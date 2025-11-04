"use client";
import { useMap } from "react-leaflet";
import L, { LatLngLiteral } from "leaflet";
import { useEffect, useRef } from "react";
import { useTime } from "@/lib/TimeContext";
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

  // Effect for drawing and animating the path
  useEffect(() => {
    if (!path || path.length === 0) {
      routeRef.current?.remove();
      agentRef.current?.remove();
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
      return;
    }

    // Draw route if not already drawn
    if (!routeRef.current) {
      routeRef.current = L.polyline(path, { weight: 4, color: "#00bcd4" }).addTo(map);
    }

    // Create agent marker if not exists
    if (!agentRef.current) {
      agentRef.current = L.circleMarker(path[0], {
        radius: 8,
        color: "#ff4444",
        fillColor: "#ff4444",
        fillOpacity: 0.8
      }).addTo(map);

      // Add popup with agent info
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
    if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);

    // Only animate if time is running
    if (!isRunning) return;

    // Base speed (points per second) when timeSpeed === 60 (legacy behavior)
    const baseSpeed = 100;
    const scaledSpeed = baseSpeed * (timeSpeed / 60);
    const intervalMs = Math.max(16, 1000 / Math.max(0.01, scaledSpeed));

    animationIntervalRef.current = setInterval(() => {
      if (!agentRef.current || !path) return;

      currentIndexRef.current = Math.min(currentIndexRef.current + 1, path.length - 1);
      agentRef.current.setLatLng(path[currentIndexRef.current]);

      // Pan map to follow agent
      map.panTo(path[currentIndexRef.current], { animate: true, duration: 0.5 });

      // Check if reached destination
      if (currentIndexRef.current >= path.length - 1) {
        if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
        // Call onArrival callback when animation completes
        if (onArrival) {
          onArrival();
        }
      }
    }, intervalMs);

    return () => {
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
    };
  }, [path, map, agentInfo, timeSpeed, onArrival, isRunning]);

  // Clear everything when path changes
  useEffect(() => {
    return () => {
      routeRef.current?.remove();
      routeRef.current = null;
      agentRef.current?.remove();
      agentRef.current = null;
      currentIndexRef.current = 0;
    };
  }, [path]);

  return null;
}
