import { useState, useRef, useCallback, useEffect } from "react";
import { LatLngLiteral } from "leaflet";
import type { AgentInfo } from "@/types/agent";

export function useAgentMovement(isRunning: boolean) {
  const [agentPath, setAgentPath] = useState<LatLngLiteral[] | null>(null);
  const [agentDestination, setAgentDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const isMovingRef = useRef(false);
  const nextMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch agent info on mount and when refreshTrigger changes
  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/agent/state");
        if (response.ok) {
          const data = await response.json();
          setAgentInfo({
            name: data.name,
            role: data.role,
            activity: data.current_activity
          });
        }
      } catch (error) {
        console.error("Failed to fetch agent info:", error);
      }
    };

    fetchAgentInfo();
  }, [refreshTrigger]);

  const moveAgent = useCallback(async () => {
    if (isMovingRef.current || !isRunning) return;

    isMovingRef.current = true;
    try {
      const response = await fetch("/api/agent/autonomous");
      if (response.ok) {
        const data = await response.json();
        setAgentPath(data.path);
        setAgentDestination(data.destination);
        console.log("Agent movement:", data.reason);
      } else {
        isMovingRef.current = false;
      }
    } catch (error) {
      console.error("Failed to move agent:", error);
      isMovingRef.current = false;
    }
  }, [isRunning]);

  const handleAgentArrival = useCallback(async () => {
    if (!agentDestination) return;

    try {
      // Update backend location
      await fetch("http://127.0.0.1:8000/agent/update-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: agentDestination.lat,
          lng: agentDestination.lng
        }),
      });

      // Refresh agent info to show updated activity
      setRefreshTrigger(prev => prev + 1);

      // Schedule next movement after a cooldown (60 seconds) - only if time is running
      isMovingRef.current = false;
      if (isRunning) {
        nextMoveTimeoutRef.current = setTimeout(() => {
          moveAgent();
        }, 60000); // 60 seconds cooldown between movements
      }
    } catch (error) {
      console.error("Failed to update agent location:", error);
      isMovingRef.current = false;
    }
  }, [agentDestination, isRunning, moveAgent]);

  // Initial movement on mount only
  useEffect(() => {
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

  return {
    agentPath,
    agentDestination,
    agentInfo,
    handleAgentArrival
  };
}
