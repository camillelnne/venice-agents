/**
 * Hook to manage V1 deterministic agent
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
import {
  initializeAgent,
  updateAgentRoutine,
  moveAgentAlongPath,
  getAgentPosition,
  getTargetNodeForRoutine,
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
  let baseMin = 8;
  let baseMax = 15;
  if (upperType.includes("TAVERN") || upperType.includes("OSTERIA") || upperType.includes("INN")) {
    baseMin = 12;
    baseMax = 20;
  } else if (upperType.includes("CHURCH") || upperType.includes("CHAPEL") || upperType.includes("TEMPLE")) {
    baseMin = 6;
    baseMax = 12;
  } else if (upperType.includes("GARDEN") || upperType.includes("PARK") || upperType.includes("COURTYARD")) {
    baseMin = 8;
    baseMax = 16;
  }
  const dwell = baseMin + Math.random() * (baseMax - baseMin);
  return Math.min(dwell, Math.max(slack - 5, baseMin)); // leave a small buffer
};

export function useAgent(
  network: StreetNetwork | null,
  currentTime: Date,
  isRunning: boolean,
  timeSpeed: number = 5,
  pois: Poi[] = []
) {
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const initializedRef = useRef(false);
  // Ref to hold any pending deferred setState timer id
  const pendingSetRef = useRef<number | null>(null);
  const lastDetourCheckMinuteRef = useRef<number>(-Infinity);
  const isRequestingDetourRef = useRef<boolean>(false);

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
            shop: persona.shop,
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
    if (agentState.mode !== "ROUTINE") return; // don't override while detouring or dwelling

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

  // Detour decision checkpoints
  useEffect(() => {
    if (!agentState || !network || !isRunning || pois.length === 0) return;

    const simMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const CHECK_INTERVAL_MIN = 5;
    if (simMinutes - lastDetourCheckMinuteRef.current < CHECK_INTERVAL_MIN) return;
    lastDetourCheckMinuteRef.current = simMinutes;

    if (agentState.mode !== "ROUTINE") return;
    if (["TRAVEL_TO_SHOP", "TRAVEL_HOME"].includes(agentState.currentRoutineType)) return;

    // Cooldown: require at least 60 sim minutes since last detour end
    if (
      agentState.lastDetourEndTime !== null &&
      simMinutes - agentState.lastDetourEndTime < 60
    ) {
      console.log("Skipping detour: cooldown active");
      return;
    }

    // Daily cap
    if (agentState.detoursTakenToday >= 2) return;

    const nextNonFreeStart = (() => {
      const routine = agentState.persona.dailyRoutine;
      const now = simMinutes;
      // Build list of future blocks starting from now, wrapping once
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
    if (slackMinutes < 20) return; // not enough slack to bother

    const nearby = getNearbyPoisWithDistance(network, pois, agentState.currentNodeId, 15);
    if (nearby.length === 0) return;

    // Build diverse options: tavern-ish, church-ish, courtyard/garden-ish, and nearest fallback
    const pickByTypes = (types: string[]) =>
      nearby.find((entry) => types.includes(entry.poi.type.toUpperCase()));

    const candidates: { poi: Poi; reachableMinutes: number }[] = [];

    const tavern = pickByTypes(["TAVERN", "OSTERIA", "INN", "BAR", "CAFE"]);
    if (tavern) candidates.push(tavern);
    const church = pickByTypes(["CHURCH", "CHAPEL", "TEMPLE"]);
    if (church) candidates.push(church);
    const courtyard = pickByTypes(["COURTYARD", "SQUARE", "GARDEN", "PARK", "PIAZZA"]);
    if (courtyard) candidates.push(courtyard);

    // Ensure at least one candidate (fallback to nearest)
    if (candidates.length === 0 && nearby.length > 0) {
      candidates.push(nearby[0]);
    }

    // Deduplicate by id and trim to 4
    const uniqueCandidates = Array.from(
      new Map(candidates.map((c) => [c.poi.id, c])).values()
    ).slice(0, 4);

    if (uniqueCandidates.length === 0) return;

    // Estimate slack needed: travel to POI + dwell + travel to target
    const dwellMinutes = 10;
    const targetNodeId = agentState.targetNodeId;

    const options: DetourOption[] = [];
    let enoughSlack = false;

    for (const entry of uniqueCandidates) {
      const nearestToPoi = findNearestNode(network, entry.poi.lat, entry.poi.lng);
      if (!nearestToPoi) continue;
      const backMeters = shortestPathDistanceMeters(
        network,
        nearestToPoi.id,
        targetNodeId
      );
      if (backMeters === null) continue;
      const backMinutes = backMeters / (1.4 * 60);
      const totalNeeded = entry.reachableMinutes + dwellMinutes + backMinutes;
      if (totalNeeded <= slackMinutes) {
        enoughSlack = true;
        options.push({
          id: entry.poi.id,
          type: entry.poi.type.toUpperCase(),
          label: entry.poi.label,
        });
      }
    }

    if (!enoughSlack || options.length === 0) return;

    // Add synthetic "none" choice
    options.push({ id: "none", type: "NONE", label: "Continue directly to your destination" });

    const timeStr = currentTime.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const mainGoal = agentState.currentRoutineType === "SHOP"
      ? `Be back at your shop by ${formatMinutes(nextNonFreeStart % (24 * 60))}.`
      : `Be back home by ${formatMinutes(nextNonFreeStart % (24 * 60))}.`;

    if (isRequestingDetourRef.current) return;
    isRequestingDetourRef.current = true;

    ApiService.decideDetour({
      agent_name: agentState.persona.name,
      personality: agentState.persona.personality,
      time_of_day: timeStr,
      main_goal: mainGoal,
      available_minutes_before_next_obligation: Math.floor(slackMinutes),
      options,
    })
      .then((resp) => {
        console.log("Detour decision response:", resp);
        if (!resp || !agentState) return;
        if (resp.choice_id === "none") {
          if (resp.thought) {
            console.log("Detour declined thought:", resp.thought);
          }
          return;
        }

        const poi = pois.find((p) => p.id === resp.choice_id);
        if (!poi) {
          console.warn("POI not found for detour choice:", resp.choice_id);
          return;
        }

        const targetNode = findNearestNode(network, poi.lat, poi.lng);
        if (!targetNode) {
          console.warn("Could not find node for POI:", poi);
          return;
        }

        const pathNodeIds = findPathBFS(network, agentState.currentNodeId, targetNode.id);
        if (!pathNodeIds) {
          console.warn("No path to POI:", poi);
          return;
        }

        const travelThereMeters = shortestPathDistanceMeters(
          network,
          agentState.currentNodeId,
          targetNode.id
        );
        if (travelThereMeters === null) return;
        const travelThereMinutes = travelThereMeters / (1.4 * 60);

        const backMeters = shortestPathDistanceMeters(
          network,
          targetNode.id,
          agentState.targetNodeId
        );
        if (backMeters === null) return;
        const backMinutes = backMeters / (1.4 * 60);

        const dwellMinutes = estimateDwellMinutes(poi.type, slackMinutes);
        const totalNeeded = travelThereMinutes + dwellMinutes + backMinutes;
        if (totalNeeded > slackMinutes - 1) {
          console.log("Detour doesn't fit in slack, skipping", {
            travelThereMinutes,
            dwellMinutes,
            backMinutes,
            slackMinutes,
          });
          return;
        }

        const smoothPath = pathToCoordinates(network, pathNodeIds);

        setAgentState({
          ...agentState,
          mode: "DETOURING",
          detourTargetNodeId: targetNode.id,
          targetNodeId: targetNode.id,
          currentPath: smoothPath,
          pathNodeIds,
          pathProgress: 0,
          spontaneousEndTime: simMinutes + dwellMinutes,
          spontaneousActivity: poi.label,
        });

        if (resp.thought) {
          console.log("Detour thought:", resp.thought);
        }
      })
      .catch((err) => {
        console.error("Failed to decide detour:", err);
      })
      .finally(() => {
        isRequestingDetourRef.current = false;
      });
  }, [agentState, network, isRunning, pois, currentTime]);

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
        const moved = moveAgentAlongPath(prevState, network, deltaTime, timeSpeed);

        // If detouring and reached destination, switch to AT_DETOUR
        if (
          moved.mode === "DETOURING" &&
          moved.currentPath.length > 0 &&
          moved.pathProgress >= moved.currentPath.length - 1
        ) {
          console.log("Reached detour target, entering dwell", {
            detourTargetNodeId: moved.detourTargetNodeId,
            spontaneousEndTime: moved.spontaneousEndTime,
          });
          return {
            ...moved,
            mode: "AT_DETOUR",
            currentPath: [],
            pathNodeIds: [],
            pathProgress: 0,
          };
        }

        // If at detour and dwell time expired, return to routine
        const simMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        if (
          moved.mode === "AT_DETOUR" &&
          moved.spontaneousEndTime !== null &&
          simMinutes >= moved.spontaneousEndTime
        ) {
          const routineTarget = getTargetNodeForRoutine(
            moved.currentRoutineType,
            moved.homeNodeId,
            moved.shopNodeId,
            moved.currentNodeId
          );
          const nodePath = findPathBFS(network, moved.currentNodeId, routineTarget);
          const smooth = nodePath ? pathToCoordinates(network, nodePath) : [];

          console.log("Detour complete, returning to routine", {
            detoursTakenToday: moved.detoursTakenToday + 1,
            routineTarget,
          });

          return {
            ...moved,
            mode: "ROUTINE",
            detourTargetNodeId: null,
            spontaneousEndTime: null,
            lastDetourEndTime: simMinutes,
            detoursTakenToday: moved.detoursTakenToday + 1,
            currentPath: smooth,
            pathNodeIds: nodePath || [],
            pathProgress: 0,
            targetNodeId: routineTarget,
            spontaneousActivity: undefined,
          };
        }

        return moved;
      });
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [network, isRunning, timeSpeed]);

  // Override agent's destination (for spontaneous behavior)
  const overrideDestination = (targetCoordinates: LatLngLiteral, reason: string) => {
    if (!agentState || !network) {
      console.warn("Cannot override destination: agent or network not ready");
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
    setAgentState({
      ...agentState,
      targetNodeId: targetNode.id,
      currentPath: smoothPath,
      pathNodeIds: nodePath || [],
      pathProgress: 0,
      currentRoutineType: "FREE_TIME", // Mark as spontaneous activity
      spontaneousActivity: reason, // Store the reason for display
    });

    console.log(`✅ New path computed: ${smoothPath.length} points`);
  };

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
        if (agentState.spontaneousActivity) {
          activity = agentState.spontaneousActivity;
        } else {
          activity = "Free time";
        }
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

  return { agent: agentDisplay, overrideDestination };
}
