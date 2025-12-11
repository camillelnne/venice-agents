import type { ThoughtRequest, ThoughtResponse, DetourDecisionRequest, DetourDecisionResponse } from '@/types/agent';

const API_BASE_URL = 'http://localhost:8000';

export class ApiService {
  static async generateThought(request: ThoughtRequest): Promise<ThoughtResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/thought`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error generating thought:', error);
      throw error;
    }
  }

  static async decideDetour(request: DetourDecisionRequest): Promise<DetourDecisionResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/decide-detour`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deciding detour:', error);
      throw error;
    }
  }
}
