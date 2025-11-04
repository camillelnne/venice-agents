import { useState, useRef, useCallback, useEffect } from "react";
import { LatLngLiteral } from "leaflet";
import type { AgentInfo } from "@/types/agent";
import { agentApiClient, ApiError } from "@/lib/api-client";
import { AGENT_CONFIG } from "@/lib/constants";

export function useAgentMovement(isRunning: boolean) {
  const [agentPath, setAgentPath] = useState<LatLngLiteral[] | null>(null);
  const [agentDestination, setAgentDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isMovingRef = useRef(false);
  const nextMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasRunningRef = useRef(isRunning);

  // Fetch agent info on mount and when refreshTrigger changes
  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        const data = await agentApiClient.getAgentState();
        setAgentInfo({
          name: data.name,
          role: data.role as AgentInfo["role"],
          activity: data.current_activity
        });
      } catch (error) {
        if (error instanceof ApiError) {
          console.error(`Failed to fetch agent info: ${error.message}`, error.statusCode);
        } else {
          console.error("Failed to fetch agent info:", error);
        }
      }
    };

    fetchAgentInfo();
  }, [refreshTrigger]);

  const moveAgent = useCallback(async () => {
    if (isMovingRef.current) {
      console.log("Movement already in progress, skipping");
      return;
    }
    // Check isRunning directly from the ref to avoid dependency issues
    if (!wasRunningRef.current) {
      console.log("Time is paused, skipping movement");
      return;
    }

    console.log("Starting new movement");
    isMovingRef.current = true;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("Movement request timed out, aborting");
      controller.abort();
    }, 30000); // 30 second timeout for pathfinding

    try {
      const response = await fetch("/api/agent/autonomous", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setAgentPath(data.path);
        setAgentDestination(data.destination);
        console.log("Agent movement:", data.reason);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Failed to move agent: HTTP", response.status, errorData);
        isMovingRef.current = false;
        
        // Schedule retry after a delay
        setTimeout(() => {
          if (wasRunningRef.current && !isMovingRef.current) {
            console.log("Retrying movement after error...");
            moveAgent();
          }
        }, 5000);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Failed to move agent:", error);
      isMovingRef.current = false;
      
      // Schedule retry after a delay for network errors
      setTimeout(() => {
        if (wasRunningRef.current && !isMovingRef.current) {
          console.log("Retrying movement after network error...");
          moveAgent();
        }
      }, 5000);
    }
  }, []); // Remove isRunning from deps, use ref instead

  const handleAgentArrival = useCallback(async () => {
    if (!agentDestination) return;

    console.log("Agent arrived at destination");
    try {
      // Update backend location
      await agentApiClient.updateLocation(
        agentDestination.lat,
        agentDestination.lng
      );

      // Refresh agent info to show updated activity
      setRefreshTrigger(prev => prev + 1);

      // Mark as no longer moving
      isMovingRef.current = false;
      
      // Clear any existing timeout
      if (nextMoveTimeoutRef.current) {
        clearTimeout(nextMoveTimeoutRef.current);
        nextMoveTimeoutRef.current = null;
      }

      // Schedule next movement after cooldown if time is running (check ref)
      if (wasRunningRef.current) {
        console.log(`Scheduling next movement in ${AGENT_CONFIG.MOVEMENT_COOLDOWN}ms`);
        nextMoveTimeoutRef.current = setTimeout(() => {
          moveAgent();
        }, AGENT_CONFIG.MOVEMENT_COOLDOWN);
      } else {
        console.log("Time is paused, not scheduling next movement");
      }
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(`Failed to update agent location: ${error.message}`, error.statusCode);
      } else {
        console.error("Failed to update agent location:", error);
      }
      isMovingRef.current = false;
    }
  }, [agentDestination, moveAgent]);

  // Initial movement on mount only
  useEffect(() => {
    console.log("Initial mount - starting first movement");
    moveAgent();

    return () => {
      // Cleanup: cancel pending movements and reset state
      if (nextMoveTimeoutRef.current) {
        clearTimeout(nextMoveTimeoutRef.current);
      }
      isMovingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Handle time pause/resume
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    
    // Only act if isRunning actually changed
    if (wasRunning === isRunning) return;
    
    // Update ref AFTER checking if changed
    wasRunningRef.current = isRunning;

    if (!isRunning) {
      // Time just paused - cancel any pending scheduled movements
      console.log("Time paused - canceling pending movements");
      if (nextMoveTimeoutRef.current) {
        clearTimeout(nextMoveTimeoutRef.current);
        nextMoveTimeoutRef.current = null;
      }
    } else {
      // Time just resumed
      console.log("Time resumed - checking if need to schedule movement");
      console.log(`  isMovingRef.current: ${isMovingRef.current}`);
      console.log(`  nextMoveTimeoutRef.current: ${nextMoveTimeoutRef.current}`);
      
      // Only schedule if agent is not currently moving AND no movement is already scheduled
      if (!isMovingRef.current && !nextMoveTimeoutRef.current) {
        console.log(`Scheduling movement after resume in ${AGENT_CONFIG.MOVEMENT_COOLDOWN}ms`);
        nextMoveTimeoutRef.current = setTimeout(() => {
          moveAgent();
        }, AGENT_CONFIG.MOVEMENT_COOLDOWN);
      } else {
        console.log("Not scheduling - agent is moving or movement already scheduled");
      }
    }
  }, [isRunning, moveAgent]);

  return {
    agentPath,
    agentDestination,
    agentInfo,
    handleAgentArrival
  };
}
