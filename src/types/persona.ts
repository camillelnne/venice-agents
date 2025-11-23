/**
 * Persona and routine types for deterministic agents
 */

export type RoutineType = "HOME" | "SHOP" | "TRAVEL_TO_SHOP" | "TRAVEL_HOME" | "FREE_TIME";

export interface RoutineBlock {
  startTime: string; // "HH:mm" format
  endTime: string;   // "HH:mm" format
  type: RoutineType;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Persona {
  name: string;
  shopType: string;
  shopCategory: string;
  home: Coordinates;
  shop: Coordinates;
  personality: string;
  dailyRoutine: RoutineBlock[];
}
