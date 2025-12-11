/**
 * Hook to manage multiple V1 deterministic agents
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { LatLngLiteral } from "leaflet";
import type { Persona } from "@/types/persona";
import type { StreetNetwork } from "@/lib/network";
import { findPathBFS, pathToCoordinates, findNearestNode } from "@/lib/network";
import {
  initializeAgent,
  updateAgentRoutine,
  moveAgentAlongPath,
  getAgentPosition,
  type AgentState,
} from "@/lib/agentLogic";

export interface AgentDisplay {
  id: string; // Unique identifier for the agent
  position: LatLngLiteral;
  path: LatLngLiteral[];
  name: string;
  shopType: string;
  currentActivity: string;
  personality: string;
  detourThought?: string;
}

export interface AgentInfo {
  id: string;
  persona: Persona;
}

export function useAgents(
  agentInfos: AgentInfo[],
  network: StreetNetwork | null,
  currentTime: Date,
  isRunning: boolean,
  timeSpeed: number = 5
) {
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map());
  const lastUpdateRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const pendingSetRef = useRef<number | null>(null);

  // Helper to defer setState to avoid synchronous updates
  const scheduleSetAgentStates = (states: Map<string, AgentState>) => {
    if (pendingSetRef.current) {
      clearTimeout(pendingSetRef.current);
      pendingSetRef.current = null;
    }
    pendingSetRef.current = window.setTimeout(() => {
      setAgentStates(states);
      pendingSetRef.current = null;
    }, 0);
  };

  // Initialize all agents when network is ready
  useEffect(() => {
    if (!network || agentInfos.length === 0 || initializedRef.current) return;

    const newStates = new Map<string, AgentState>();

    agentInfos.forEach((agentInfo) => {
      const initialState = initializeAgent(agentInfo.persona, network, currentTime);
      if (initialState) {
        // Compute initial path if needed
        if (initialState.targetNodeId !== initialState.currentNodeId) {
          const nodePath = findPathBFS(
            network,
            initialState.currentNodeId,
            initialState.targetNodeId
          );
          const smoothPath = nodePath ? pathToCoordinates(network, nodePath) : [];

          console.log(`Initial path computed for ${agentInfo.persona.name}:`, {
            from: initialState.currentNodeId,
            to: initialState.targetNodeId,
            pathLength: smoothPath.length,
          });

          initialState.currentPath = smoothPath;
          initialState.pathNodeIds = nodePath || [];
        }

        newStates.set(agentInfo.id, initialState);
      }
    });

    initializedRef.current = true;
    scheduleSetAgentStates(newStates);
    console.log(`Initialized ${newStates.size} agents`);
  }, [agentInfos, network, currentTime]);

  // Update agent routines when time changes
  useEffect(() => {
    if (agentStates.size === 0 || !network) return;

    const newStates = new Map<string, AgentState>();
    let anyPathChanged = false;

    agentStates.forEach((state, agentId) => {
      const { state: updatedState, pathChanged } = updateAgentRoutine(
        state,
        currentTime,
        network
      );

      if (pathChanged) {
        anyPathChanged = true;
        console.log(
          `Agent ${updatedState.persona.name} routine changed:`,
          updatedState.currentRoutineType,
          "-> target:",
          updatedState.targetNodeId
        );
      }

      newStates.set(agentId, updatedState);
    });

    if (anyPathChanged) {
      scheduleSetAgentStates(newStates);
    } else {
      // Still update if any state changed
      let statesChanged = false;
      agentStates.forEach((oldState, agentId) => {
        const newState = newStates.get(agentId);
        if (newState !== oldState) {
          statesChanged = true;
        }
      });
      if (statesChanged) {
        scheduleSetAgentStates(newStates);
      }
    }
  }, [currentTime, agentStates, network]);

  // Clear pending deferred setState on unmount
  useEffect(() => {
    return () => {
      if (pendingSetRef.current) {
        clearTimeout(pendingSetRef.current);
        pendingSetRef.current = null;
      }
    };
  }, []);

  // Movement loop: runs every frame when simulation is running
  useEffect(() => {
    if (!network || !isRunning || agentStates.size === 0) return;

    lastUpdateRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaTime = now - lastUpdateRef.current;
      lastUpdateRef.current = now;

      setAgentStates((prevStates) => {
        const newStates = new Map<string, AgentState>();
        prevStates.forEach((state, agentId) => {
          const movedState = moveAgentAlongPath(state, network, deltaTime, timeSpeed);
          newStates.set(agentId, movedState);
        });
        return newStates;
      });
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [network, isRunning, timeSpeed, agentStates.size]);

  // Override agent's destination (for spontaneous behavior)
  const overrideDestination = (agentId: string, targetCoordinates: LatLngLiteral, reason: string) => {
    const agentState = agentStates.get(agentId);
    
    if (!agentState || !network) {
      console.warn(`Cannot override destination for agent ${agentId}: agent or network not ready`);
      return;
    }

    console.log(`🎯 Overriding destination for ${agentState.persona.name}:`, {
      reason,
      target: targetCoordinates,
    });

    // Find nearest node to target
    const targetNode = findNearestNode(network, targetCoordinates.lat, targetCoordinates.lng);
    
    if (!targetNode) {
      console.error("Could not find node near target coordinates");
      return;
    }

    // Compute new path from current position to target
    const nodePath = findPathBFS(network, agentState.currentNodeId, targetNode.id);
    const smoothPath = nodePath ? pathToCoordinates(network, nodePath) : [];

    if (smoothPath.length === 0) {
      console.warn("Could not find path to target");
      return;
    }

    // Update agent state with new path
    const newStates = new Map(agentStates);
    newStates.set(agentId, {
      ...agentState,
      targetNodeId: targetNode.id,
      currentPath: smoothPath,
      pathNodeIds: nodePath || [],
      pathProgress: 0,
      currentRoutineType: "FREE_TIME", // Mark as spontaneous activity
      spontaneousActivity: reason, // Store the reason for display
    });

    setAgentStates(newStates);
    console.log(`✅ New path computed for ${agentState.persona.name}: ${smoothPath.length} points`);
  };

  // Compute display from agent states
  const agentDisplays = useMemo((): AgentDisplay[] => {
    if (agentStates.size === 0 || !network) {
      return [];
    }

    const displays: AgentDisplay[] = [];

    agentStates.forEach((state, agentId) => {
      let position = getAgentPosition(state);
      
      // If no position from path (agent is stationary), use current node
      if (!position) {
        const currentNode = network.nodes.get(state.currentNodeId);
        if (currentNode) {
          position = { lat: currentNode.lat, lng: currentNode.lng };
        }
      }

      if (!position) {
        return; // Skip this agent if we can't determine position
      }

      // Determine current activity description
      let activity = "";
      switch (state.currentRoutineType) {
        case "HOME":
          activity = "At home";
          break;
        case "SHOP":
          activity = "Working";
          break;
        case "TRAVEL_TO_SHOP":
          activity = "Traveling to shop";
          break;
        case "TRAVEL_HOME":
          activity = "Traveling home";
          break;
        case "FREE_TIME":
          // Check if this is a spontaneous activity
          if (state.spontaneousActivity) {
            activity = state.spontaneousActivity;
          } else {
            activity = "Free time";
          }
          break;
      }

      displays.push({
        id: agentId,
        position,
        path: state.currentPath,
        name: state.persona.name,
        shopType: state.persona.shopType,
        currentActivity: activity,
        personality: state.persona.personality,
      });
    });

    return displays;
  }, [agentStates, network]);

  return { agents: agentDisplays, overrideDestination };
}
