/**
 * Famous landmarks and points of interest in 1740s Venice
 * These locations can be used for spontaneous agent behavior
 */

import type { VeniceCoordinates } from "@/types/agent";

export interface NamedLocation {
  name: string;
  coordinates: VeniceCoordinates;
  description: string;
}

// Famous landmarks in Venice (approximate 1740s locations)
export const VENICE_LANDMARKS: Record<string, NamedLocation> = {
  "Rialto": {
    name: "Rialto Bridge",
    coordinates: { lat: 45.4380, lng: 12.3358 },
    description: "The famous bridge and bustling market center"
  },
  "San Marco": {
    name: "Piazza San Marco",
    coordinates: { lat: 45.4341, lng: 12.3387 },
    description: "The main square and political heart of Venice"
  },
  "Arsenal": {
    name: "Venetian Arsenal",
    coordinates: { lat: 45.4350, lng: 12.3486 },
    description: "The great shipyard and naval base"
  },
  "Accademia": {
    name: "Ponte dell'Accademia",
    coordinates: { lat: 45.4315, lng: 12.3280 },
    description: "A quiet spot near the Grand Canal"
  },
  "Campo Santa Maria Formosa": {
    name: "Campo Santa Maria Formosa",
    coordinates: { lat: 45.4380, lng: 12.3418 },
    description: "A lively campo with a beautiful church"
  },
  "Cannaregio": {
    name: "Cannaregio District",
    coordinates: { lat: 45.4420, lng: 12.3270 },
    description: "A residential area with canals and local life"
  },
  "Dorsoduro": {
    name: "Dorsoduro",
    coordinates: { lat: 45.4300, lng: 12.3240 },
    description: "An artistic district along the water"
  }
};

/**
 * Parse action string to extract location name
 * Examples:
 * - "take a walk to Rialto" -> "Rialto"
 * - "visit San Marco" -> "San Marco"
 * - "go to the Arsenal" -> "Arsenal"
 */
export function parseLocationFromAction(action: string): string | null {
  const actionLower = action.toLowerCase();
  
  // Check each landmark name
  for (const [key, landmark] of Object.entries(VENICE_LANDMARKS)) {
    if (actionLower.includes(landmark.name.toLowerCase()) || actionLower.includes(key.toLowerCase())) {
      return key;
    }
  }
  
  return null;
}

/**
 * Get coordinates for a named location
 */
export function getLocationCoordinates(locationName: string): VeniceCoordinates | null {
  const landmark = VENICE_LANDMARKS[locationName];
  return landmark ? landmark.coordinates : null;
}

/**
 * Get a random landmark (for fallback behavior)
 */
export function getRandomLandmark(): NamedLocation {
  const keys = Object.keys(VENICE_LANDMARKS);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return VENICE_LANDMARKS[randomKey];
}

/**
 * Determine action type from action string
 */
export type ActionType = "navigate" | "rest" | "socialize" | "wander" | "unknown";

export function parseActionType(action: string): ActionType {
  const actionLower = action.toLowerCase();
  
  if (actionLower.includes("walk") || actionLower.includes("go to") || actionLower.includes("visit")) {
    return "navigate";
  } else if (actionLower.includes("rest") || actionLower.includes("break") || actionLower.includes("pause")) {
    return "rest";
  } else if (actionLower.includes("chat") || actionLower.includes("socialize") || actionLower.includes("talk")) {
    return "socialize";
  } else if (actionLower.includes("wander") || actionLower.includes("explore")) {
    return "wander";
  }
  
  return "unknown";
}
