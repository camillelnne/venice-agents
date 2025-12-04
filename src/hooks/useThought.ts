/**
 * Hook to manage thoughts of V2 agents
 */

import { useState, useCallback } from 'react';
import { ApiService } from '@/lib/api';
import type { ThoughtRequest, ThoughtResponse, AgentInfo, VeniceCoordinates } from '@/types/agent';
import { AgentDisplay } from './useAgent';

export function useThoughts() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastThought, setLastThought] = useState<ThoughtResponse | null>(null);

  const generateThought = useCallback(async (
    agentInfo: AgentDisplay,
    currentTime: Date,
    location: VeniceCoordinates,
    currentDestination?: string
  ): Promise<ThoughtResponse | null> => {
    if (isGenerating) return null;

    setIsGenerating(true);
    try {
			// translate time to string for python backend
			const timeString = currentTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });

      // Convert VeniceCoordinates to location string
      const locationString = `Venice (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`;

      const request: ThoughtRequest = {
        agent_name: agentInfo.name,
        current_activity: agentInfo.currentActivity,
        location: locationString,
        time_of_day: timeString,
        personality: agentInfo.personality,
        current_destination: currentDestination,
      };

      console.log('Sending thought request:', request);
      const thought = await ApiService.generateThought(request);
      console.log('Received thought response:', thought);
      setLastThought(thought);
      return thought;
    } catch (error) {
      console.error('Failed to generate thought:', error);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating]);

  return {
    generateThought,
    isGenerating,
    lastThought,
  };
}