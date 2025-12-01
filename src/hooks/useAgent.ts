/**
 * Hook to manage V1 deterministic agent
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { LatLngLiteral } from "leaflet";
import type { Persona } from "@/types/persona";
import type { StreetNetwork } from "@/lib/network";
import { findPathBFS, pathToCoordinates } from "@/lib/network";
import {
  initializeAgent,
  updateAgentRoutine,
  moveAgentAlongPath,
  getAgentPosition,
  type AgentState,
} from "@/lib/agentLogic";

export interface AgentDisplay {
  position: LatLngLiteral;
  path: LatLngLiteral[];
  name: string;
  shopType: string;
  currentActivity: string;
  personality: string
}

export function useAgent(
  network: StreetNetwork | null,
  currentTime: Date,
  isRunning: boolean,
  timeSpeed: number = 5
) {
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const initializedRef = useRef(false);
  // Ref to hold any pending deferred setState timer id
  const pendingSetRef = useRef<number | null>(null);

  // Helper to defer setAgentState to the next tick to avoid synchronous setState inside effects
  const scheduleSetAgentState = (s: AgentState | null) => {
    if (pendingSetRef.current) {
      clearTimeout(pendingSetRef.current);
      pendingSetRef.current = null;
    }
    // Defer to next macrotask
    pendingSetRef.current = window.setTimeout(() => {
      setAgentState(s);
      pendingSetRef.current = null;
    }, 0);
  };

  // Load a random persona on mount
  useEffect(() => {
    async function loadRandomPersona() {
      try {
        const response = await fetch("/data/personas.json");
        const personas: Persona[] = await response.json();

        if (personas.length > 0) {
          const randomIndex = Math.floor(Math.random() * personas.length);
          const persona = personas[randomIndex];
          
          console.log("Loaded persona:", {
            name: persona.name,
            home: persona.home,
            shop: persona.shop
          });
          
          setSelectedPersona(persona);
        }
      } catch (error) {
        console.error("Failed to load personas:", error);
      }
    }

    loadRandomPersona();
  }, []);

  // Initialize agent when persona and network are ready
  useEffect(() => {
    if (!selectedPersona || !network || initializedRef.current) return;

    const initialState = initializeAgent(selectedPersona, network, currentTime);
    if (initialState) {
      initializedRef.current = true;
      
      // Compute initial path if needed
      if (initialState.targetNodeId !== initialState.currentNodeId) {
        const nodePath = findPathBFS(
          network,
          initialState.currentNodeId,
          initialState.targetNodeId
        );
        const smoothPath = nodePath ? pathToCoordinates(network, nodePath) : [];
        
        console.log("Initial path computed:", {
          from: initialState.currentNodeId,
          to: initialState.targetNodeId,
          pathLength: smoothPath.length,
        });
        
        initialState.currentPath = smoothPath;
        initialState.pathNodeIds = nodePath || [];
      }
      
  // defer setting state to avoid cascading synchronous renders inside effect
  scheduleSetAgentState(initialState);
      console.log("Agent initialized:", selectedPersona.name);
    }
  }, [selectedPersona, network, currentTime]);

  // Update agent routine when time changes
  useEffect(() => {
    if (!agentState || !network) return;

    const { state: updatedState, pathChanged } = updateAgentRoutine(
      agentState,
      currentTime,
      network
    );

    if (pathChanged) {
      // defer setState to avoid synchronous update inside an effect
      scheduleSetAgentState(updatedState);
      console.log(
        "Agent routine changed:",
        updatedState.currentRoutineType,
        "-> target:",
        updatedState.targetNodeId
      );
    } else if (updatedState !== agentState) {
      scheduleSetAgentState(updatedState);
    }
  }, [currentTime, agentState, network]);

  // Clear any pending deferred setState when unmounting
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
    if (!network || !isRunning) return;

    lastUpdateRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaTime = now - lastUpdateRef.current;
      lastUpdateRef.current = now;

      setAgentState((prevState) => {
        if (!prevState) return null;
        return moveAgentAlongPath(prevState, network, deltaTime, timeSpeed);
      });
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [network, isRunning, timeSpeed]);

  // Compute display from agent state
  const agentDisplay = useMemo((): AgentDisplay | null => {
    if (!agentState || !network) {
      return null;
    }

    let position = getAgentPosition(agentState);
    
    // If no position from path (agent is stationary), use current node
    if (!position) {
      const currentNode = network.nodes.get(agentState.currentNodeId);
      if (currentNode) {
        position = { lat: currentNode.lat, lng: currentNode.lng };
      }
    }

    if (!position) {
      return null;
    }

    // Determine current activity description
    let activity = "";
    switch (agentState.currentRoutineType) {
      case "HOME":
        activity = "At home";
        break;
      case "SHOP":
        activity = `Working at ${agentState.persona.shopType}`;
        break;
      case "TRAVEL_TO_SHOP":
        activity = "Traveling to shop";
        break;
      case "TRAVEL_HOME":
        activity = "Traveling home";
        break;
      case "FREE_TIME":
        activity = "Free time";
        break;
    }

    return {
      position,
      path: agentState.currentPath,
      name: agentState.persona.name,
      shopType: agentState.persona.shopType,
      currentActivity: activity,
      personality: agentState.persona.personality
    };
  }, [agentState, network]);

  return agentDisplay;
}
