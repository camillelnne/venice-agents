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

  // Calculate movement based on real-world walking speed (meters)
  // Average walking speed: ~1.4 m/s
  // `timeSpeed` is expressed as simulated minutes per real second (e.g. 5 = 5 simulated minutes / real second)
  // Convert that to simulated seconds per real second: timeSpeed * 60.
  // Move per real millisecond = walkingSpeed_m_per_s * (timeSpeed * 60) / 1000
  // Apply an optional visual multiplier for faster visuals.
  const REAL_WALKING_SPEED_M_PER_S = 1.4; // m/s
  const simulatedSecondsPerRealSecond = timeSpeed * 60; // e.g. 5 min/s -> 300 simulated seconds per real second
  const WALKING_SPEED_M_PER_MS =
    (REAL_WALKING_SPEED_M_PER_S * simulatedSecondsPerRealSecond) / 1000;

  // Distance (meters) to move this tick
  let remainingMeters = WALKING_SPEED_M_PER_MS * deltaTime;

  // Helper: convert a small lat/lng delta to meters using local scaling
  const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    // Approx meters per degree latitude
    const METERS_PER_DEGREE_LAT = 111320;
    // scale longitude by cos(latitude)
    const meanLatRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
    const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(meanLatRad);

    const dLatMeters = (b.lat - a.lat) * METERS_PER_DEGREE_LAT;
    const dLngMeters = (b.lng - a.lng) * metersPerDegreeLng;
    return Math.sqrt(dLatMeters * dLatMeters + dLngMeters * dLngMeters);
  };

  // Move through path points based on meters
  let newProgress = state.pathProgress;

  while (newProgress < state.currentPath.length - 1 && remainingMeters > 0) {
    const idx = Math.floor(newProgress);
    const current = state.currentPath[idx];
    const next = state.currentPath[idx + 1];

    // full length of this segment in meters
    const segmentMeters = metersBetween(current, next);
    // how much of this segment remains given current fractional progress
    const fractionAlong = newProgress - idx;
    const remainingSegmentMeters = segmentMeters * (1 - fractionAlong);

    if (remainingMeters >= remainingSegmentMeters) {
      // consume remaining part of this segment and step to next point
      remainingMeters -= remainingSegmentMeters;
      newProgress = idx + 1;
    } else {
      // move part-way along this segment
      const advanceFraction = remainingMeters / segmentMeters;
      newProgress += advanceFraction;
      remainingMeters = 0;
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
