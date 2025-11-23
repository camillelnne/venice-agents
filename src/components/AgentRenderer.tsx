"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { AgentDisplay } from "@/hooks/useAgent";
import { AGENT_CONFIG } from "@/lib/constants";

interface AgentRendererProps {
  agent: AgentDisplay | null;
}

/**
 * Renders agent on the map
 */
export default function AgentRenderer({ agent }: AgentRendererProps) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const pathRef = useRef<L.Polyline | null>(null);
  const lastPathLengthRef = useRef<number>(0);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!agent) {
      // Clean up if no agent
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (pathRef.current) {
        pathRef.current.remove();
        pathRef.current = null;
      }
      hasInitializedRef.current = false;
      return;
    }

    // Create marker on first render
    if (!markerRef.current) {
      markerRef.current = L.circleMarker(agent.position, {
        radius: AGENT_CONFIG.MARKER_RADIUS,
        color: "#ff4444",
        fillColor: "#ff4444",
        fillOpacity: 0.8,
      }).addTo(map);
      
      markerRef.current.bindPopup(`
        <strong>${agent.name}</strong><br/>
        <em>${agent.shopType}</em><br/>
        ${agent.currentActivity}
      `).openPopup();
      
      // Center map on agent on first render
      if (!hasInitializedRef.current) {
        map.setView(agent.position, 17);
        hasInitializedRef.current = true;
      }
    }

    // Update marker position (this is smooth)
    markerRef.current.setLatLng(agent.position);

    // Update popup content (only the text)
    const popup = markerRef.current.getPopup();
    if (popup) {
      popup.setContent(`
        <strong>${agent.name}</strong><br/>
        <em>${agent.shopType}</em><br/>
        ${agent.currentActivity}
      `);
    }

    // Only update path when it actually changes
    if (agent.path.length > 0) {
      if (!pathRef.current) {
        // Create new path
        pathRef.current = L.polyline(agent.path, {
          weight: AGENT_CONFIG.ROUTE_WEIGHT,
          color: "#00bcd4",
          opacity: 0.6,
        }).addTo(map);
        lastPathLengthRef.current = agent.path.length;
      } else if (agent.path.length !== lastPathLengthRef.current) {
        // Path changed - update it
        pathRef.current.setLatLngs(agent.path);
        lastPathLengthRef.current = agent.path.length;
      }
      // If path length is same, don't update (prevents flickering)
    } else if (pathRef.current) {
      // No path - remove it if it exists
      pathRef.current.remove();
      pathRef.current = null;
      lastPathLengthRef.current = 0;
    }
  }, [agent, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
      }
      if (pathRef.current) {
        pathRef.current.remove();
      }
    };
  }, []);

  return null; // This component doesn't render React elements
}
