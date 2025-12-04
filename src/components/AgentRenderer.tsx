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
  onSpontaneousAction?: (action: string, thought: string) => void;
}

/**
 * Renders agent on the map
 */
export default function AgentRenderer({ agent, onSpontaneousAction }: AgentRendererProps) {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);
  const pathRef = useRef<L.Polyline | null>(null);
  const lastPathLengthRef = useRef<number>(0);
  const hasInitializedRef = useRef(false);
  const { generateThought, isGenerating } = useThoughts();
  const [currentThought, setCurrentThought] = useState<string>("");
  const { currentTime, timeSpeed } = useTime();
  
  // Cooldown mechanism after spontaneous override
  const overrideCooldownRef = useRef<number>(0); // timestamp when cooldown ends
  const COOLDOWN_DURATION = 1200000; // 20 minutes of simulation time in milliseconds

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

  // Generate thought when activity changes
  useEffect(() => {
    if (!agent) return;

    const generateNewThought = async () => {
      // Check if we're in cooldown period
      const now = Date.now();
      if (overrideCooldownRef.current > now) {
        console.log('⏸️  Thought generation paused (cooldown after override)');
        return;
      }

      const currentLocation = agent.position;
      const currentDestination = agent.currentActivity.includes('to') 
        ? agent.currentActivity.split('to ')[1]
        : undefined;
      
      const thought = await generateThought(
        agent, 
        currentTime, 
        currentLocation,
        currentDestination
      );
      
      if (thought) {
        setCurrentThought(thought.thought);
        
        // Handle spontaneous actions
        if (thought.override_routine && thought.desired_action && onSpontaneousAction) {
          console.log('🎯 Agent wants to do:', thought.desired_action);
          onSpontaneousAction(thought.desired_action, thought.thought);
          
          // Set cooldown period: no new thoughts for a while
          // Convert simulation time to real time based on timeSpeed
          const realCooldownMs = COOLDOWN_DURATION / (timeSpeed * 60);
          overrideCooldownRef.current = now + realCooldownMs;
          
          const cooldownMinutes = Math.round(COOLDOWN_DURATION / 60000);
          console.log(`⏸️  Thought generation paused for ${cooldownMinutes} simulation minutes (${Math.round(realCooldownMs/1000)}s real time)`);
        }
      }
    };

    generateNewThought();
  }, [agent?.currentActivity, agent?.name, timeSpeed, COOLDOWN_DURATION]);

  // Generate periodic thoughts
  useEffect(() => {
    if (!agent) return;

    const generateNewThought = async () => {
      // Check if we're in cooldown period
      const now = Date.now();
      if (overrideCooldownRef.current > now) {
        console.log('⏸️  Thought generation paused (cooldown after override)');
        return;
      }

      const currentLocation = agent.position;
      const currentDestination = agent.currentActivity.includes('to') 
        ? agent.currentActivity.split('to ')[1]
        : undefined;
      
      const thought = await generateThought(
        agent, 
        currentTime, 
        currentLocation,
        currentDestination
      );
      
      if (thought) {
        setCurrentThought(thought.thought);
        // Set cooldown period: no new thoughts for a while
        // Convert simulation time to real time based on timeSpeed
        const realCooldownMs = COOLDOWN_DURATION / (timeSpeed * 60);
        overrideCooldownRef.current = now + realCooldownMs;
        
        const cooldownMinutes = Math.round(COOLDOWN_DURATION / 60000);
        console.log(`⏸️  Thought generation paused for ${cooldownMinutes} simulation minutes (${Math.round(realCooldownMs/1000)}s real time)`);
        if (thought.override_routine && thought.desired_action && onSpontaneousAction) {
          console.log('🎯 Agent wants to do:', thought.desired_action);
          onSpontaneousAction(thought.desired_action, thought.thought);
          
          
        }
      }
    };

    // Generate new thoughts periodically (every 1 minute of simulation time)
    const thoughtInterval = setInterval(generateNewThought, 120000 / timeSpeed);

    return () => clearInterval(thoughtInterval);
  }, [agent?.name, timeSpeed, generateThought, onSpontaneousAction]);

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
