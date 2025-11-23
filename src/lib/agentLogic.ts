/**
 * Core logic for V1 deterministic agents
 */

import { LatLngLiteral } from "leaflet";
import type { Persona, RoutineBlock, RoutineType } from "@/types/persona";
import type { StreetNetwork } from "./network";
import { findNearestNode, findPathBFS, pathToCoordinates } from "./network";

export interface AgentState {
  persona: Persona;
  currentNodeId: string;
  homeNodeId: string;
  shopNodeId: string;
  currentPath: LatLngLiteral[]; // Smooth path for rendering
  pathNodeIds: string[]; // Node IDs along the path
  pathProgress: number; // Index in currentPath (how far along the smooth path)
  currentRoutineType: RoutineType;
  targetNodeId: string;
}

/**
 * Parse time string "HH:mm" to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Get the current active routine block for a given time
 */
export function getActiveRoutine(
  persona: Persona,
  currentTime: Date
): RoutineBlock | null {
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // Find the routine block that contains the current time
  for (const block of persona.dailyRoutine) {
    const startMinutes = timeToMinutes(block.startTime);
    const endMinutes = timeToMinutes(block.endTime);

    // Handle case where end time is after midnight
    if (endMinutes < startMinutes) {
      // Block spans midnight
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return block;
      }
    } else {
      // Normal case
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return block;
      }
    }
  }

  return null;
}

/**
 * Determine the target node based on routine type
 */
export function getTargetNodeForRoutine(
  routineType: RoutineType,
  homeNodeId: string,
  shopNodeId: string,
  currentNodeId: string
): string {
  switch (routineType) {
    case "HOME":
      return homeNodeId;
    case "SHOP":
      return shopNodeId;
    case "TRAVEL_TO_SHOP":
      return shopNodeId;
    case "TRAVEL_HOME":
      return homeNodeId;
    case "FREE_TIME":
      // Stay at current location
      return currentNodeId;
    default:
      return currentNodeId;
  }
}

/**
 * Initialize agent state from persona and network
 */
export function initializeAgent(
  persona: Persona,
  network: StreetNetwork,
  currentTime: Date
): AgentState | null {
  // Find nearest nodes to home and shop
  const homeNode = findNearestNode(network, persona.home.lat, persona.home.lng);
  const shopNode = findNearestNode(network, persona.shop.lat, persona.shop.lng);

  console.log("Initializing agent:", {
    name: persona.name,
    homeCoords: persona.home,
    shopCoords: persona.shop,
    homeNode: homeNode ? { id: homeNode.id, lat: homeNode.lat, lng: homeNode.lng } : null,
    shopNode: shopNode ? { id: shopNode.id, lat: shopNode.lat, lng: shopNode.lng } : null,
  });

  if (!homeNode || !shopNode) {
    console.error("Could not find nodes for agent", persona.name);
    return null;
  }

  // Get current routine
  const activeRoutine = getActiveRoutine(persona, currentTime);
  const currentRoutineType = activeRoutine?.type || "HOME";

  // Determine starting position (we'll start at home)
  const currentNodeId = homeNode.id;

  // Determine target
  const targetNodeId = getTargetNodeForRoutine(
    currentRoutineType,
    homeNode.id,
    shopNode.id,
    currentNodeId
  );

  console.log("Agent initial state:", {
    currentRoutineType,
    currentNodeId,
    targetNodeId,
    homeNodeId: homeNode.id,
    shopNodeId: shopNode.id,
  });

  // Initialize with empty path (will be computed if target != current)
  return {
    persona,
    currentNodeId,
    homeNodeId: homeNode.id,
    shopNodeId: shopNode.id,
    currentPath: [],
    pathNodeIds: [],
    pathProgress: 0,
    currentRoutineType,
    targetNodeId,
  };
}

/**
 * Update agent state based on current time
 * Returns updated state and whether path needs to be recomputed
 */
export function updateAgentRoutine(
  state: AgentState,
  currentTime: Date,
  network: StreetNetwork
): { state: AgentState; pathChanged: boolean } {
  const activeRoutine = getActiveRoutine(state.persona, currentTime);
  const newRoutineType = activeRoutine?.type || "HOME";

  // Check if routine changed
  if (newRoutineType !== state.currentRoutineType) {
    const newTargetNodeId = getTargetNodeForRoutine(
      newRoutineType,
      state.homeNodeId,
      state.shopNodeId,
      state.currentNodeId
    );

    // If target changed, compute new path
    if (newTargetNodeId !== state.targetNodeId) {
      const nodePath = findPathBFS(network, state.currentNodeId, newTargetNodeId);
      const smoothPath = nodePath ? pathToCoordinates(network, nodePath) : [];

      return {
        state: {
          ...state,
          currentRoutineType: newRoutineType,
          targetNodeId: newTargetNodeId,
          currentPath: smoothPath,
          pathNodeIds: nodePath || [],
          pathProgress: 0,
        },
        pathChanged: true,
      };
    } else {
      // Routine changed but target is the same (e.g., already at target)
      return {
        state: {
          ...state,
          currentRoutineType: newRoutineType,
        },
        pathChanged: false,
      };
    }
  }

  return { state, pathChanged: false };
}

/**
 * Move agent one step along the path based on walking speed
 * Returns updated state
 */
export function moveAgentAlongPath(
  state: AgentState,
  network: StreetNetwork,
  deltaTime: number, // milliseconds since last tick
  timeSpeed: number = 5 // simulation speed multiplier
): AgentState {
  // If no path or already at destination, don't move
  if (
    state.currentPath.length === 0 ||
    state.pathProgress >= state.currentPath.length - 1
  ) {
    return state;
  }

  // Calculate movement based on real-world walking speed
  // Average walking speed: ~1.4 m/s = 5 km/h
  // Multiply by timeSpeed to make movement proportional to simulation speed
  // Also add a visual multiplier to make movement more visible (20x faster than realistic)
  // TODO: fix bc agent too slow
  const VISUAL_SPEED_MULTIPLIER = 20;
  const WALKING_SPEED_M_PER_MS = (1.4 / 1000) * timeSpeed * VISUAL_SPEED_MULTIPLIER;
  const APPROX_METERS_PER_DEGREE = 111000; // rough approximation at Venice latitude

  // Calculate how many coordinate points to move based on time and speed
  const distanceToMove = WALKING_SPEED_M_PER_MS * deltaTime;
  const degreesToMove = distanceToMove / APPROX_METERS_PER_DEGREE;

  // Move through path points based on approximate distance
  let newProgress = state.pathProgress;
  let remainingDistance = degreesToMove;

  while (
    newProgress < state.currentPath.length - 1 &&
    remainingDistance > 0
  ) {
    const current = state.currentPath[Math.floor(newProgress)];
    const next = state.currentPath[Math.floor(newProgress) + 1];

    const segmentDistance = Math.sqrt(
      Math.pow(next.lat - current.lat, 2) + Math.pow(next.lng - current.lng, 2)
    );

    if (remainingDistance >= segmentDistance) {
      remainingDistance -= segmentDistance;
      newProgress += 1;
    } else {
      // Partial movement along current segment
      newProgress += remainingDistance / segmentDistance;
      remainingDistance = 0;
    }
  }

  newProgress = Math.min(newProgress, state.currentPath.length - 1);

  // Update current node if we've progressed through the path significantly
  let newCurrentNodeId = state.currentNodeId;
  if (
    state.pathNodeIds.length > 0 &&
    newProgress >= state.currentPath.length - 1
  ) {
    // Reached end of path
    newCurrentNodeId = state.targetNodeId;
  }

  return {
    ...state,
    pathProgress: newProgress,
    currentNodeId: newCurrentNodeId,
  };
}

/**
 * Get current position of agent for rendering
 */
export function getAgentPosition(state: AgentState): LatLngLiteral | null {
  if (state.currentPath.length === 0) {
    // Agent is stationary - return current node position
    return null; // Will be handled by caller to get node position
  }

  // Interpolate position along path
  const index = Math.floor(state.pathProgress);
  const fraction = state.pathProgress - index;

  if (index >= state.currentPath.length - 1) {
    // At end of path
    return state.currentPath[state.currentPath.length - 1];
  }

  const current = state.currentPath[index];
  const next = state.currentPath[index + 1];

  // Linear interpolation
  return {
    lat: current.lat + (next.lat - current.lat) * fraction,
    lng: current.lng + (next.lng - current.lng) * fraction,
  };
}
