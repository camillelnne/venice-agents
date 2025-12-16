/**
 * Hook to manage multiple V1 deterministic agents
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { LatLngLiteral } from "leaflet";
import type { Persona } from "@/types/persona";
import type { StreetNetwork } from "@/lib/network";
import {
  findPathBFS,
  pathToCoordinates,
  findNearestNode,
  getNearbyPoisWithDistance,
  shortestPathDistanceMeters,
} from "@/lib/network";
import type { Poi } from "@/types/poi";
import { ApiService } from "@/lib/api";
import type { DetourOption } from "@/types/agent";
import { VENICE_LANDMARKS } from "@/lib/landmarks";
import {
  initializeAgent,
  updateAgentRoutine,
  moveAgentAlongPath,
  getAgentPosition,
  getTargetNodeForRoutine,
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

// Helper functions for detour logic
const parseTimeToMinutes = (timeStr: string): number => {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const formatMinutes = (minutes: number): string => {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const estimateDwellMinutes = (poiType: string, slack: number): number => {
  const upperType = poiType.toUpperCase();
  let baseMin = 15;
  let baseMax = 25;
  if (upperType.includes("TAVERN") || upperType.includes("OSTERIA") || upperType.includes("INN") || upperType.includes("MALVASIA") || upperType.includes("CAFFÈ")) {
    baseMin = 20;
    baseMax = 35;
  } else if (upperType.includes("CHURCH") || upperType.includes("CHIESA") || upperType.includes("SCUOLA")) {
    baseMin = 10;
    baseMax = 20;
  } else if (upperType.includes("GARDEN") || upperType.includes("ORTO") || upperType.includes("GIARDINO") || upperType.includes("CORTE")) {
    baseMin = 15;
    baseMax = 30;
  } else if (upperType.includes("LANDMARK")) {
    baseMin = 20;
    baseMax = 40;
  }
  const dwell = baseMin + Math.random() * (baseMax - baseMin);
  // Ensure we have at least baseMin, but cap at 70% of available slack
  return Math.min(dwell, Math.max(slack * 0.7, baseMin));
};

export function useAgents(
  agentInfos: AgentInfo[],
  network: StreetNetwork | null,
  currentTime: Date,
  isRunning: boolean,
  timeSpeed: number = 5,
  pois: Poi[] = []
) {
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map());
  const lastUpdateRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const pendingSetRef = useRef<number | null>(null);
  const lastDetourCheckMinuteRef = useRef<Map<string, number>>(new Map());
  const isRequestingDetourRef = useRef<Map<string, boolean>>(new Map());

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
      // Don't override routine while detouring or dwelling
      if (state.mode !== "ROUTINE") {
        newStates.set(agentId, state);
        return;
      }

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

  // Detour decision checkpoints for all agents
  useEffect(() => {
    if (!network || !isRunning || pois.length === 0 || agentStates.size === 0) return;

    const simMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const CHECK_INTERVAL_MIN = 15; // Check for detours every 15 sim minutes (was 5)

    agentStates.forEach((agentState, agentId) => {
      // Check if enough time has passed since last check for this agent
      const lastCheck = lastDetourCheckMinuteRef.current.get(agentId) ?? -Infinity;
      if (simMinutes - lastCheck < CHECK_INTERVAL_MIN) return;

      // Skip if already requesting
      if (isRequestingDetourRef.current.get(agentId)) return;

      // Only check during routine mode
      if (agentState.mode !== "ROUTINE") return;
      if (["TRAVEL_TO_SHOP", "TRAVEL_HOME"].includes(agentState.currentRoutineType)) return;

      // Cooldown: require at least 60 sim minutes since last detour end
      if (
        agentState.lastDetourEndTime !== null &&
        simMinutes - agentState.lastDetourEndTime < 60
      ) {
        return;
      }

      // Daily cap
      if (agentState.detoursTakenToday >= 2) return;

      // Mark this agent as checked
      lastDetourCheckMinuteRef.current.set(agentId, simMinutes);

      // Find next non-free time block
      const nextNonFreeStart = (() => {
        const routine = agentState.persona.dailyRoutine;
        const now = simMinutes;
        const blocks = [...routine, ...routine];
        for (const block of blocks) {
          const start = parseTimeToMinutes(block.startTime);
          const type = block.type;
          const adjustedStart = start + (start < now ? 24 * 60 : 0);
          if (type !== "FREE_TIME" && adjustedStart > now) {
            return adjustedStart;
          }
        }
        return null;
      })();

      if (!nextNonFreeStart) return;
      const slackMinutes = nextNonFreeStart - simMinutes;
      // Require at least 45 minutes of free time to consider a detour
      // This ensures enough time for travel, dwelling, and return
      if (slackMinutes < 45) return;

      const nearby = getNearbyPoisWithDistance(network, pois, agentState.currentNodeId, 15);
      if (nearby.length === 0) return;

      console.log(`📍 Found ${nearby.length} nearby POIs for ${agentState.persona.name}`);
      console.log(`   Types available:`, [...new Set(nearby.map(p => p.poi.type))].join(", "));

      // Build diverse options with randomization
      const pickByTypes = (types: string[], count: number = 2) => {
        const matches = nearby.filter((entry) => types.includes(entry.poi.type.toUpperCase()));
        if (matches.length === 0) return [];
        // Shuffle and pick up to 'count' random ones from matches
        const shuffled = [...matches].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count, matches.length));
      };

      const candidates: { poi: Poi; reachableMinutes: number }[] = [];

      // Italian/Venetian POI types from the actual dataset
      // Pick up to 2 from each category to offer more variety
      const taverns = pickByTypes(["OSTERIA", "LOCANDA", "ALBERGO", "MALVASIA", "CAFFÈ"], 2);
      candidates.push(...taverns);
      const churches = pickByTypes(["CHIESA", "SCUOLA", "OSPIZIO"], 2);
      candidates.push(...churches);
      const courtyards = pickByTypes(["CORTE", "GIARDINO", "ORTO"], 2);
      candidates.push(...courtyards);

      // Add landmarks as additional options (convert to virtual POIs)
      const landmarkEntries = Object.entries(VENICE_LANDMARKS);
      const shuffledLandmarks = [...landmarkEntries].sort(() => Math.random() - 0.5);
      const selectedLandmarks = shuffledLandmarks.slice(0, 2); // Pick 2 random landmarks
      
      for (const [key, landmark] of selectedLandmarks) {
        const landmarkNode = findNearestNode(network, landmark.coordinates.lat, landmark.coordinates.lng);
        if (!landmarkNode) continue;
        
        const distanceMeters = shortestPathDistanceMeters(network, agentState.currentNodeId, landmarkNode.id);
        if (distanceMeters === null) continue;
        
        const reachableMinutes = distanceMeters / (1.4 * 60);
        if (reachableMinutes <= 15) { // Within same range as nearby POIs
          candidates.push({
            poi: {
              id: `landmark_${key}`,
              lat: landmark.coordinates.lat,
              lng: landmark.coordinates.lng,
              type: "LANDMARK",
              label: landmark.name,
            },
            reachableMinutes,
          });
        }
      }

      if (candidates.length === 0 && nearby.length > 0) {
        console.log(`⚠️  No candidates matched preferred types, using fallback from ${nearby.length} nearby POIs`);
        // Pick up to 3 random nearby POIs as fallback
        const shuffled = [...nearby].sort(() => Math.random() - 0.5);
        candidates.push(...shuffled.slice(0, 3));
      }

      console.log(`🎯 Initial candidates selected: ${candidates.length}`, candidates.map(c => `${c.poi.type}: ${c.poi.label}`));

      const uniqueCandidates = Array.from(
        new Map(candidates.map((c) => [c.poi.id, c])).values()
      ).slice(0, 4);

      if (uniqueCandidates.length === 0) return;

      const targetNodeId = agentState.targetNodeId;

      const options: DetourOption[] = [];
      let enoughSlack = false;

      console.log(`⏱️  Checking time feasibility (${Math.floor(slackMinutes)} min available):`);
      for (const entry of uniqueCandidates) {
        const nearestToPoi = findNearestNode(network, entry.poi.lat, entry.poi.lng);
        if (!nearestToPoi) {
          console.log(`   ❌ ${entry.poi.label}: No nearest node found`);
          continue;
        }
        const backMeters = shortestPathDistanceMeters(network, nearestToPoi.id, targetNodeId);
        if (backMeters === null) {
          console.log(`   ❌ ${entry.poi.label}: No path back to target`);
          continue;
        }
        const backMinutes = backMeters / (1.4 * 60);
        // Use realistic dwell time estimate (not hardcoded 10)
        const estimatedDwellMinutes = estimateDwellMinutes(entry.poi.type, slackMinutes);
        const totalNeeded = entry.reachableMinutes + estimatedDwellMinutes + backMinutes;
        // Add 5 minute buffer for safety
        if (totalNeeded + 5 <= slackMinutes) {
          enoughSlack = true;
          console.log(`   ✅ ${entry.poi.label}: ${Math.floor(totalNeeded)} min (${Math.floor(entry.reachableMinutes)} there + ${Math.floor(estimatedDwellMinutes)} dwell + ${Math.floor(backMinutes)} back)`);
          options.push({
            id: entry.poi.id,
            type: entry.poi.type.toUpperCase(),
            label: entry.poi.label,
          });
        } else {
          console.log(`   ⏰ ${entry.poi.label}: ${Math.floor(totalNeeded)} min needed > ${Math.floor(slackMinutes)} min available`);
        }
      }

      if (!enoughSlack || options.length === 0) {
        console.log(`❌ No feasible detours found (enoughSlack: ${enoughSlack}, options: ${options.length})`);
        return;
      }

      options.push({ id: "none", type: "NONE", label: "Continue directly to your destination" });

      const timeStr = currentTime.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const mainGoal =
        agentState.currentRoutineType === "SHOP"
          ? `Be back at your shop by ${formatMinutes(nextNonFreeStart % (24 * 60))}.`
          : `Be back home by ${formatMinutes(nextNonFreeStart % (24 * 60))}.`;

      console.log(`🎭 POIs proposed to ${agentState.persona.name}:`, options);
      console.log(`⏰ Available time: ${Math.floor(slackMinutes)} minutes`);

      isRequestingDetourRef.current.set(agentId, true);

      ApiService.decideDetour({
        agent_name: agentState.persona.name,
        personality: agentState.persona.personality,
        time_of_day: timeStr,
        main_goal: mainGoal,
        available_minutes_before_next_obligation: Math.floor(slackMinutes),
        options,
      })
        .then((resp) => {
          console.log(`Detour decision for ${agentState.persona.name}:`, resp);
          if (!resp) return;

          const currentState = agentStates.get(agentId);
          if (!currentState) return;

          if (resp.choice_id === "none") {
            if (resp.thought) {
              console.log(`${agentState.persona.name} declined detour:`, resp.thought);
            }
            return;
          }

          // Check if it's a landmark or regular POI
          let poi = pois.find((p) => p.id === resp.choice_id);
          
          // If not found, check if it's a landmark
          if (!poi && resp.choice_id.startsWith("landmark_")) {
            const landmarkKey = resp.choice_id.replace("landmark_", "");
            const landmark = VENICE_LANDMARKS[landmarkKey];
            if (landmark) {
              // Reconstruct the POI from landmark data
              poi = {
                id: resp.choice_id,
                lat: landmark.coordinates.lat,
                lng: landmark.coordinates.lng,
                type: "LANDMARK",
                label: landmark.name,
              };
            }
          }
          
          if (!poi) {
            console.warn("❌ POI not found for detour choice:", resp.choice_id);
            return;
          }

          const targetNode = findNearestNode(network, poi.lat, poi.lng);
          if (!targetNode) {
            console.warn("❌ No target node found for POI:", poi.label);
            return;
          }

          // Check if agent is already at the POI
          if (currentState.currentNodeId === targetNode.id) {
            console.log(`⚠️  ${agentState.persona.name} is already at ${poi.label}, skipping detour`);
            return;
          }

          const pathNodeIds = findPathBFS(network, currentState.currentNodeId, targetNode.id);
          if (!pathNodeIds) {
            console.warn("❌ No path found to POI:", poi.label, "from node", currentState.currentNodeId, "to", targetNode.id);
            return;
          }

          const travelThereMeters = shortestPathDistanceMeters(
            network,
            currentState.currentNodeId,
            targetNode.id
          );
          if (travelThereMeters === null) return;
          const travelThereMinutes = travelThereMeters / (1.4 * 60);

          const backMeters = shortestPathDistanceMeters(
            network,
            targetNode.id,
            currentState.targetNodeId
          );
          if (backMeters === null) return;
          const backMinutes = backMeters / (1.4 * 60);

          const dwellMinutes = estimateDwellMinutes(poi.type, slackMinutes);
          const totalNeeded = travelThereMinutes + dwellMinutes + backMinutes;
          if (totalNeeded > slackMinutes - 5) {
            console.log(`⏰ ${agentState.persona.name} detour doesn't fit in slack:`, 
              `${Math.floor(totalNeeded)} min needed > ${Math.floor(slackMinutes - 5)} min available (with 5 min buffer)`);
            return;
          }

          console.log(`⏱️  Detour timing: ${Math.floor(travelThereMinutes)} min there + ${Math.floor(dwellMinutes)} min dwell + ${Math.floor(backMinutes)} min back = ${Math.floor(totalNeeded)} min total (${Math.floor(slackMinutes)} min available)`);


          const smoothPath = pathToCoordinates(network, pathNodeIds);

          setAgentStates((prevStates) => {
            const newStates = new Map(prevStates);
            const state = newStates.get(agentId);
            if (!state) return prevStates;

            newStates.set(agentId, {
              ...state,
              mode: "DETOURING",
              detourTargetNodeId: targetNode.id,
              targetNodeId: targetNode.id,
              currentPath: smoothPath,
              pathNodeIds,
              pathProgress: 0,
              spontaneousEndTime: simMinutes + dwellMinutes,
              spontaneousActivity: poi.label,
              detourThought: resp.thought || undefined,
            });

            console.log(`✈️  ${agentState.persona.name} taking detour to ${poi.label}`);
            console.log(`   Path: ${pathNodeIds.length} nodes, ${smoothPath.length} coordinates`);
            console.log(`   Current position: node ${currentState.currentNodeId}, target: node ${targetNode.id}`);
            if (resp.thought) {
              console.log(`   Thought: "${resp.thought}"`);
            }

            return newStates;
          });
        })
        .catch((err) => {
          console.error(`Failed to decide detour for ${agentState.persona.name}:`, err);
        })
        .finally(() => {
          isRequestingDetourRef.current.set(agentId, false);
        });
    });
  }, [agentStates, network, isRunning, pois, currentTime]);

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
        const simMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

        prevStates.forEach((state, agentId) => {
          let movedState = moveAgentAlongPath(state, network, deltaTime, timeSpeed);

          // If detouring and reached destination, switch to AT_DETOUR
          if (
            movedState.mode === "DETOURING" &&
            movedState.currentPath.length > 0 &&
            movedState.pathProgress >= movedState.currentPath.length - 1
          ) {
            console.log(`${movedState.persona.name} reached detour target, entering dwell at ${movedState.spontaneousActivity || '(unknown)'}`);
            movedState = {
              ...movedState,
              mode: "AT_DETOUR",
              currentPath: [],
              pathNodeIds: [],
              pathProgress: 0,
            };
          }

          // If at detour and dwell time expired, return to routine
          if (
            movedState.mode === "AT_DETOUR" &&
            movedState.spontaneousEndTime !== null &&
            simMinutes >= movedState.spontaneousEndTime
          ) {
            const routineTarget = getTargetNodeForRoutine(
              movedState.currentRoutineType,
              movedState.homeNodeId,
              movedState.shopNodeId,
              movedState.currentNodeId
            );
            const nodePath = findPathBFS(network, movedState.currentNodeId, routineTarget);
            const smooth = nodePath ? pathToCoordinates(network, nodePath) : [];

            console.log(`${movedState.persona.name} detour complete, returning to routine`);
            if (movedState.detourThought) {
              console.log(`🧹 Clearing detour thought: "${movedState.detourThought}"`);
            }

            movedState = {
              ...movedState,
              mode: "ROUTINE",
              detourTargetNodeId: null,
              spontaneousEndTime: null,
              lastDetourEndTime: simMinutes,
              detoursTakenToday: movedState.detoursTakenToday + 1,
              currentPath: smooth,
              pathNodeIds: nodePath || [],
              pathProgress: 0,
              targetNodeId: routineTarget,
              spontaneousActivity: undefined,
              detourThought: undefined,
            };
          }

          newStates.set(agentId, movedState);
        });
        return newStates;
      });
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [network, isRunning, timeSpeed, agentStates.size, currentTime]);

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
      
      // Check mode first - detours override routine activities
      if (state.mode === "DETOURING") {
        activity = state.spontaneousActivity ? `Traveling to ${state.spontaneousActivity}` : "Taking a detour";
      } else if (state.mode === "AT_DETOUR") {
        activity = state.spontaneousActivity ? `Visiting ${state.spontaneousActivity}` : "At detour location";
        // Debug: Check if spontaneousActivity is actually set
        if (!state.spontaneousActivity) {
          console.warn(`⚠️  Agent ${state.persona.name} is AT_DETOUR but spontaneousActivity is not set:`, state.spontaneousActivity);
        }
      } else {
        // Normal routine-based activities
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
      }

      displays.push({
        id: agentId,
        position,
        path: state.currentPath,
        name: state.persona.name,
        shopType: state.persona.shopType,
        currentActivity: activity,
        personality: state.persona.personality,
        detourThought: state.detourThought,
      });
    });

    return displays;
  }, [agentStates, network]);

  return { agents: agentDisplays, overrideDestination };
}
