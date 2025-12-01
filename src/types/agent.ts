/**
 * Agent-related types for Venice agents application
 */

export type AgentRole = "merchant" | "gondolier" | "noble" | "artisan" | "servant";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface VeniceCoordinates {
  lat: number;
  lng: number;
}

export interface Landmark extends VeniceCoordinates {
  name: string;
}

export interface RoutineActivity {
  time: string;
  activity: string;
  location: VeniceCoordinates;
}

export interface AgentInfo {
  name: string;
  role: AgentRole;
  activity: string;
  location?: VeniceCoordinates;
  personality?: string;
  thought?: string;
}

export interface AgentState extends AgentInfo {
  age: number;
  personality: string;
  current_location: VeniceCoordinates;
  home_location: VeniceCoordinates;
  work_location: VeniceCoordinates | null;
  routine: RoutineActivity[];
  social_network: string[];
}

export interface AgentMovement {
  start: VeniceCoordinates;
  destination: Landmark;
  reason: string;
}

export interface ThoughtRequest {
  agent_name: string;
  current_activity: string;
  location: string;
  time_of_day: string;
  personality?: string;
  context?: string;
}

export interface ThoughtResponse {
  thought: string;
  agent_name: string;
}
