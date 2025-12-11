import type { ThoughtRequest, ThoughtResponse } from '@/types/agent';

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
}
