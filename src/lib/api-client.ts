/**
 * API client for communicating with the Python FastAPI backend
 */

import { API_CONFIG, getApiUrl } from "./constants";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AgentApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout: number = API_CONFIG.TIMEOUT) {
    this.baseUrl = baseUrl || getApiUrl();
    this.timeout = timeout;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError("Request timeout", 408, error);
      }
      throw error;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await this.fetchWithTimeout(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(
          errorData.detail || errorData.error || "Request failed",
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        "Network error or invalid response",
        undefined,
        error
      );
    }
  }

  async getAgentState() {
    return this.request<{
      name: string;
      role: string;
      age: number;
      personality: string;
      current_location: { lat: number; lng: number };
      current_activity: string;
    }>("/agent/state");
  }

  async chatWithAgent(message: string) {
    return this.request<{
      response: string;
      agent_name: string;
      agent_role: string;
    }>("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  async getNextDestination() {
    return this.request<{
      start: { lat: number; lng: number };
      destination: { lat: number; lng: number; name: string };
      reason: string;
    }>("/agent/next-destination", {
      method: "POST",
    });
  }

  async updateLocation(lat: number, lng: number) {
    return this.request<{ status: string }>("/agent/update-location", {
      method: "POST",
      body: JSON.stringify({ lat, lng }),
    });
  }
}

// Singleton instance
export const agentApiClient = new AgentApiClient();
