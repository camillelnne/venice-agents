"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { AgentDisplay } from "@/hooks/useAgents";
import { AGENT_CONFIG } from "@/lib/constants";
import { useThoughts } from "@/hooks/useThought";
import { useTime } from "@/lib/TimeContext";

interface AgentRendererProps {
  agents: AgentDisplay[];
}

// Color palette for different agents
const AGENT_COLORS = [
  "#ff4444", // red
  "#44ff44", // green
  "#4444ff", // blue
  "#ffaa44", // orange
  "#ff44ff", // magenta
  "#44ffff", // cyan
  "#ffff44", // yellow
  "#aa44ff", // purple
];

/**
 * Renders multiple agents on the map
 */
export default function AgentRenderer({ agents }: AgentRendererProps) {
  const map = useMap();
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const pathsRef = useRef<Map<string, L.Polyline>>(new Map());
  const tooltipsRef = useRef<Map<string, L.Tooltip>>(new Map()); // NEW: Store tooltip references
  const lastPathLengthsRef = useRef<Map<string, number>>(new Map());
  const hasInitializedRef = useRef(false);
  const { generateThought, isGenerating } = useThoughts();
  const [currentThoughts, setCurrentThoughts] = useState<Map<string, string>>(new Map());
  const { currentTime } = useTime();

  // Add a ref to track tooltip visibility state
  const tooltipVisibilityRef = useRef<Map<string, boolean>>(new Map());

  // Function to update popup content for a specific agent
  const updatePopup = useCallback((agentId: string, agent: AgentDisplay) => {
    const thought = currentThoughts.get(agentId) || "";
    const tooltipContent = `
      <div style="min-width: 200px;">
        <strong>${agent.name}</strong><br/>
        <em>${agent.shopType}</em><br/>
        <strong>Activity:</strong> ${agent.currentActivity}<br/>
        ${thought ? `
          <hr style="margin: 8px 0;">
          <div style="font-style: italic; color: #666; font-size: 0.9em;">
            💭 "${thought}"
          </div>
        ` : ''}
      </div>
    `;
    
    // Only update if tooltip is visible
    const isVisible = tooltipVisibilityRef.current.get(agentId);
    if (!isVisible) return;
    
    const tooltip = tooltipsRef.current.get(agentId);
    if (tooltip) {
      tooltip.setContent(tooltipContent);
    }
  }, [currentThoughts]);

  // Generate thoughts for agents when their activity changes
  useEffect(() => {
    agents.forEach(async (agent) => {
      const generateNewThought = async () => {
        const thought = await generateThought(
          agent, 
          currentTime, 
          agent.position
        );
        
        if (thought) {
          setCurrentThoughts(prev => {
            const next = new Map(prev);
            next.set(agent.id, thought.thought);
            return next;
          });
        }
      };

      generateNewThought();
    });
  }, [agents.map(a => `${a.id}:${a.currentActivity}`).join("|")]);

  // Update popups when thoughts change
  useEffect(() => {
    agents.forEach(agent => {
      updatePopup(agent.id, agent);
    });
  }, [agents, currentThoughts, updatePopup]);

  // Main effect to render and update agents
  useEffect(() => {
    const currentAgentIds = new Set(agents.map(a => a.id));

    // Remove markers for agents that no longer exist
    markersRef.current.forEach((marker, agentId) => {
      if (!currentAgentIds.has(agentId)) {
        marker.remove();
        markersRef.current.delete(agentId);
        tooltipsRef.current.delete(agentId);
        tooltipVisibilityRef.current.delete(agentId);
      }
    });

    pathsRef.current.forEach((path, agentId) => {
      if (!currentAgentIds.has(agentId)) {
        path.remove();
        pathsRef.current.delete(agentId);
      }
    });

    lastPathLengthsRef.current.forEach((_, agentId) => {
      if (!currentAgentIds.has(agentId)) {
        lastPathLengthsRef.current.delete(agentId);
      }
    });

    // Update or create markers for current agents
    agents.forEach((agent, index) => {
      const color = AGENT_COLORS[index % AGENT_COLORS.length];
      let marker = markersRef.current.get(agent.id);

      // Create marker if it doesn't exist
      if (!marker) {
        marker = L.circleMarker(agent.position, {
          radius: AGENT_CONFIG.MARKER_RADIUS,
          color: color,
          fillColor: color,
          fillOpacity: 0.8,
        }).addTo(map);
        
        // Create and store tooltip
        const tooltip = L.tooltip({
          permanent: true,  // Always visible (until we toggle it)
          direction: 'top',  // Position above marker
          className: 'agent-tooltip',  // Custom CSS class
          offset: [0, -10]  // Offset from marker
        }).setContent(`
          <strong>${agent.name}</strong><br/>
          <em>${agent.shopType}</em><br/>
          ${agent.currentActivity}
        `);
        
        marker.bindTooltip(tooltip);
        tooltipsRef.current.set(agent.id, tooltip); // Store tooltip reference
        
        // Initialize as visible
        tooltipVisibilityRef.current.set(agent.id, true);
        
        // Toggle tooltip on click
        marker.on('click', () => {
          const isVisible = tooltipVisibilityRef.current.get(agent.id);
          const storedTooltip = tooltipsRef.current.get(agent.id);
          
          if (storedTooltip && marker) {
            if (isVisible) {
              // Hide tooltip
              marker.unbindTooltip();
              tooltipVisibilityRef.current.set(agent.id, false);
            } else {
              // Show tooltip
              marker.bindTooltip(storedTooltip);
              tooltipVisibilityRef.current.set(agent.id, true);
            }
          }
        });
        
        markersRef.current.set(agent.id, marker);

        // Center map on first agent on first render
        if (!hasInitializedRef.current && index === 0) {
          //map.setView(agent.position, 17);
          hasInitializedRef.current = true;
        }
      } else {
        // Update marker position
        marker.setLatLng(agent.position);
      }

      // Handle path rendering
      let path = pathsRef.current.get(agent.id);
      const lastPathLength = lastPathLengthsRef.current.get(agent.id) || 0;

      if (agent.path.length > 0) {
        if (!path) {
          // Create new path
          path = L.polyline(agent.path, {
            weight: AGENT_CONFIG.ROUTE_WEIGHT,
            color: color,
            opacity: 0.4,
          }).addTo(map);
          pathsRef.current.set(agent.id, path);
          lastPathLengthsRef.current.set(agent.id, agent.path.length);
        } else if (agent.path.length !== lastPathLength) {
          // Path changed - update it
          path.setLatLngs(agent.path);
          lastPathLengthsRef.current.set(agent.id, agent.path.length);
        }
      } else if (path) {
        // No path - remove it if it exists
        path.remove();
        pathsRef.current.delete(agent.id);
        lastPathLengthsRef.current.set(agent.id, 0);
      }
    });
  }, [agents, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      pathsRef.current.forEach(path => path.remove());
      markersRef.current.clear();
      pathsRef.current.clear();
      tooltipsRef.current.clear();
      tooltipVisibilityRef.current.clear();
      lastPathLengthsRef.current.clear();
    };
  }, []);

  return null; // This component doesn't render React elements
}
