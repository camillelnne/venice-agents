"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { AgentDisplay } from "@/hooks/useAgent";
import { AGENT_CONFIG } from "@/lib/constants";
import { useThoughts } from "@/hooks/useThought";
import { useTime } from "@/lib/TimeContext";

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
  const { generateThought } = useThoughts();
  const [generatedThought, setGeneratedThought] = useState<string>("");
  const { currentTime } = useTime();
  const lastActivityRef = useRef<string>("");

  // Derive the current thought: prioritize detour thought, fall back to generated thought
  const currentThought = agent?.detourThought || generatedThought;

  // Function to update popup content
  const updatePopup = useCallback(() => {
    if (!agent) return;
    const popupContent = `
      <div style="min-width: 200px;">
        <strong>${agent.name}</strong><br/>
        <em>${agent.shopType}</em><br/>
        <strong>Activity:</strong> ${agent.currentActivity}<br/>
        ${currentThought ? `
          <hr style="margin: 8px 0;">
          <div style="font-style: italic; color: #666; font-size: 0.9em;">
            💭 "${currentThought}"
          </div>
        ` : ''}
      </div>
    `;
    if (!markerRef.current) return;
    const popup = markerRef.current.getPopup();
    if (popup) {
      popup.setContent(popupContent);
    } else {
      markerRef.current.bindPopup(popupContent);
    }
  }, [agent, currentThought]);

  // Generate thought when activity changes (but only if no detour thought)
  useEffect(() => {
    if (!agent) return;
    
    // Skip if activity hasn't changed
    if (agent.currentActivity === lastActivityRef.current) return;
    lastActivityRef.current = agent.currentActivity;
    
    // Skip thought generation if we have a detour thought
    if (agent.detourThought) return;

    const generateNewThought = async () => {
      const currentLocation = agent.position;
      
      const thought = await generateThought(
        agent, 
        currentTime, 
        currentLocation
      );
      
      if (thought) {
        setGeneratedThought(thought.thought);
      }
    };

    generateNewThought();
  }, [agent?.currentActivity, agent?.detourThought, agent, currentTime, generateThought]);

  // Update popup when thought changes
  useEffect(() => {
    updatePopup();
  }, [updatePopup]);

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
