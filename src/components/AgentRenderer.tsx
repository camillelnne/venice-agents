"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { AgentDisplay } from "@/hooks/useAgents";
import { AGENT_CONFIG } from "@/lib/constants";
import { useTime } from "@/lib/TimeContext";
import { useThoughts } from "@/hooks/useThought";

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
  const tooltipsRef = useRef<Map<string, L.Tooltip>>(new Map());
  const lastPathLengthsRef = useRef<Map<string, number>>(new Map());
  const hasInitializedRef = useRef(false);
  const { generateThought } = useThoughts();
  
  // Track generated thoughts per agent (non-detour thoughts)
  const [generatedThoughts, setGeneratedThoughts] = useState<Map<string, string>>(new Map());
  
  // Track last activity per agent
  const lastActivityRef = useRef<Map<string, string>>(new Map());
  
  const { currentTime } = useTime();

  // Add a ref to track tooltip visibility state
  const tooltipVisibilityRef = useRef<Map<string, boolean>>(new Map());

  // Function to get current thought for an agent (prioritize detour thought)
  const getCurrentThought = useCallback((agent: AgentDisplay): string => {
    // Prioritize detour thought if it exists
    if (agent.detourThought) {
      return agent.detourThought;
    }
    // Fall back to generated thought
    return generatedThoughts.get(agent.id) || "";
  }, [generatedThoughts]);

  // Function to update tooltip content for a specific agent
  const updateTooltip = useCallback((agentId: string, agent: AgentDisplay) => {
    const thought = getCurrentThought(agent);
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
  }, [getCurrentThought]);

  // Generate thoughts for agents when their activity changes (but only if no detour thought)
  useEffect(() => {
    agents.forEach(async (agent) => {
      // Skip if activity hasn't changed
      const lastActivity = lastActivityRef.current.get(agent.id);
      if (agent.currentActivity === lastActivity) return;
      lastActivityRef.current.set(agent.id, agent.currentActivity);
      
      // Skip thought generation if we have a detour thought
      if (agent.detourThought) return;

      const generateNewThought = async () => {
        const thought = await generateThought(
          agent, 
          currentTime, 
          agent.position
        );
        
        if (thought) {
          setGeneratedThoughts(prev => {
            const next = new Map(prev);
            next.set(agent.id, thought.thought);
            return next;
          });
        }
      };

      generateNewThought();
    });
  }, [agents.map(a => `${a.id}:${a.currentActivity}`).join("|"), currentTime, generateThought]);

  // Update tooltips when thoughts change
  useEffect(() => {
    agents.forEach(agent => {
      updateTooltip(agent.id, agent);
    });
  }, [agents, generatedThoughts, updateTooltip]);

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
        lastActivityRef.current.delete(agentId);
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
        
        const thought = getCurrentThought(agent);
        
        // Create and store tooltip
        const tooltip = L.tooltip({
          permanent: true,
          direction: 'top',
          className: 'agent-tooltip',
          offset: [0, -10]
        }).setContent(`
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
        `);
        
        marker.bindTooltip(tooltip);
        tooltipsRef.current.set(agent.id, tooltip);
        
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

        if (!hasInitializedRef.current && index === 0) {
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
  }, [agents, map, getCurrentThought]);

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
      lastActivityRef.current.clear();
    };
  }, []);

  return null;
}
