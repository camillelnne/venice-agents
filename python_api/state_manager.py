"""
State management for Venice agents.
Handles agent state, conversation history, and destination tracking.
"""
from collections import deque
from typing import Dict, Optional, Deque
from agent_persona import AgentPersona, AGENT_PERSONAS


class AgentStateManager:
    """Manages state for multiple agents with proper memory management."""
    
    def __init__(self, max_conversation_length: int = 20):
        self.agents: Dict[str, AgentPersona] = {}
        self.conversations: Dict[str, Deque] = {}
        self.last_destinations: Dict[str, Optional[dict]] = {}
        self.max_conversation_length = max_conversation_length
        
        # Initialize with default agent
        self.set_agent("marco", AGENT_PERSONAS["marco"])
    
    def get_agent(self, agent_id: str) -> Optional[AgentPersona]:
        """Get agent by ID."""
        return self.agents.get(agent_id)
    
    def set_agent(self, agent_id: str, agent: AgentPersona):
        """Set or update agent state."""
        self.agents[agent_id] = agent
        if agent_id not in self.conversations:
            self.conversations[agent_id] = deque(maxlen=self.max_conversation_length)
        if agent_id not in self.last_destinations:
            self.last_destinations[agent_id] = None
    
    def get_conversation(self, agent_id: str) -> Deque:
        """Get conversation history for an agent."""
        if agent_id not in self.conversations:
            self.conversations[agent_id] = deque(maxlen=self.max_conversation_length)
        return self.conversations[agent_id]
    
    def add_message(self, agent_id: str, role: str, content: str):
        """Add a message to conversation history."""
        conversation = self.get_conversation(agent_id)
        conversation.append({"role": role, "content": content})
    
    def get_last_destination(self, agent_id: str) -> Optional[dict]:
        """Get the last destination for an agent."""
        return self.last_destinations.get(agent_id)
    
    def set_last_destination(self, agent_id: str, destination: dict):
        """Set the last destination for an agent."""
        self.last_destinations[agent_id] = destination
    
    def update_agent_location(self, agent_id: str, lat: float, lng: float):
        """Update agent's current location."""
        agent = self.get_agent(agent_id)
        if agent:
            agent.current_location = {"lat": lat, "lng": lng}
    
    def update_agent_activity(self, agent_id: str, activity: str):
        """Update agent's current activity."""
        agent = self.get_agent(agent_id)
        if agent:
            agent.current_activity = activity


# Global singleton instance
agent_state_manager = AgentStateManager()
