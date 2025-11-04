"use client";
import { useMap } from "react-leaflet";
import L, { LatLngLiteral } from "leaflet";
import { useEffect, useRef } from "react";
import { useTime } from "@/lib/TimeContext";
import { AGENT_CONFIG } from "@/lib/constants";
import type { AgentInfo } from "@/types/agent";

type AutonomousAgentProps = {
  path: LatLngLiteral[] | null;
  agentInfo: AgentInfo | null;
  onArrival?: () => void;
};

/**
 * Renders and animates an autonomous agent moving through Venice
 */
export default function AutonomousAgent({ path, agentInfo, onArrival }: AutonomousAgentProps) {
  const map = useMap();
  const routeRef = useRef<L.Polyline | null>(null);
  const agentRef = useRef<L.CircleMarker | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { timeSpeed, isRunning } = useTime();
  const currentIndexRef = useRef(0);
  const hasArrivedRef = useRef(false); // Track if we've already called onArrival for current path

  // Effect for updating popup when agentInfo changes
  useEffect(() => {
    if (agentRef.current && agentInfo) {
      const popupContent = `
        <strong>${agentInfo.name}</strong><br/>
        <em>${agentInfo.role}</em><br/>
        ${agentInfo.activity}
      `;
      
      const popup = agentRef.current.getPopup();
      if (popup) {
        popup.setContent(popupContent);
      } else {
        agentRef.current.bindPopup(popupContent).openPopup();
      }
    }
  }, [agentInfo]);

  // Effect for drawing and animating the path
  useEffect(() => {
    if (!path || path.length === 0) {
      routeRef.current?.remove();
      agentRef.current?.remove();
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
      hasArrivedRef.current = false;
      return;
    }

    // Draw route if not already drawn
    if (!routeRef.current) {
      routeRef.current = L.polyline(path, { 
        weight: AGENT_CONFIG.ROUTE_WEIGHT, 
        color: "#00bcd4" 
      }).addTo(map);
    }

    // Create agent marker if not exists
    if (!agentRef.current) {
      agentRef.current = L.circleMarker(path[0], {
        radius: AGENT_CONFIG.MARKER_RADIUS,
        color: "#ff4444",
        fillColor: "#ff4444",
        fillOpacity: 0.8
      }).addTo(map);

      // Add initial popup with agent info
      if (agentInfo) {
        agentRef.current.bindPopup(`
          <strong>${agentInfo.name}</strong><br/>
          <em>${agentInfo.role}</em><br/>
          ${agentInfo.activity}
        `).openPopup();
      }
      currentIndexRef.current = 0;
    }

    // Clear existing interval
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }

    // Only animate if time is running
    if (!isRunning) return;

    // If already at destination AND haven't called arrival yet, trigger arrival immediately
    if (currentIndexRef.current >= path.length - 1 && !hasArrivedRef.current) {
      console.log("Agent already at destination on effect re-run, triggering arrival");
      hasArrivedRef.current = true;
      if (onArrival) {
        onArrival();
      }
      return;
    }

    // If we've already arrived, don't restart animation
    if (hasArrivedRef.current) {
      console.log("Already arrived at this destination, skipping animation");
      return;
    }

    // Base speed (points per second) when timeSpeed === 60 (legacy behavior)
    const baseSpeed = AGENT_CONFIG.ANIMATION_BASE_SPEED;
    const scaledSpeed = baseSpeed * (timeSpeed / 60);
    const intervalMs = Math.max(16, 1000 / Math.max(0.01, scaledSpeed));

    animationIntervalRef.current = setInterval(() => {
      if (!agentRef.current || !path) return;

      currentIndexRef.current = Math.min(currentIndexRef.current + 1, path.length - 1);
      agentRef.current.setLatLng(path[currentIndexRef.current]);

      // Pan map to follow agent
      map.panTo(path[currentIndexRef.current], { animate: true, duration: 0.5 });

      // Check if reached destination
      if (currentIndexRef.current >= path.length - 1 && !hasArrivedRef.current) {
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
          animationIntervalRef.current = null;
        }
        // Call onArrival callback when animation completes
        console.log("Animation complete, calling onArrival");
        hasArrivedRef.current = true;
        if (onArrival) {
          onArrival();
        }
      }
    }, intervalMs);

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
    };
  }, [path, map, agentInfo, timeSpeed, onArrival, isRunning]);

  // Clear everything when path changes
  useEffect(() => {
    // Reset arrival flag when we get a new path
    hasArrivedRef.current = false;
    currentIndexRef.current = 0;
    
    return () => {
      routeRef.current?.remove();
      routeRef.current = null;
      agentRef.current?.remove();
      agentRef.current = null;
      currentIndexRef.current = 0;
      hasArrivedRef.current = false;
    };
  }, [path]);

  return null;
}
