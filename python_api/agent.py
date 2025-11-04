from dotenv import load_dotenv
import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from langchain.chat_models import init_chat_model
from agent_persona import AGENT_PERSONAS
import random

from state_manager import agent_state_manager
from constants import (
    DEFAULT_AGENT_ID, 
    ROLE_DESTINATIONS, 
    ACTIVITY_MAP, 
    VENICE_LANDMARKS,
    VENICE_BOUNDS
)
from validators import validate_venice_coordinates

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv(dotenv_path="../.env.local")
api_key = os.getenv("OPENAI_API_KEY")

class GoalCoordinates(BaseModel):
    lat: float = Field(..., ge=VENICE_BOUNDS["min_lat"], le=VENICE_BOUNDS["max_lat"])
    lng: float = Field(..., ge=VENICE_BOUNDS["min_lng"], le=VENICE_BOUNDS["max_lng"])

llm = init_chat_model("openai:gpt-4o-mini", temperature=0.7)  # Higher temp for personality

llm_with_parser = llm.with_structured_output(GoalCoordinates)


# --- FastAPI Service ---
app = FastAPI()

# Add CORS middleware to allow requests from the Next.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # The origin of the Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DestinationRequest(BaseModel):
    destination: str

class ChatRequest(BaseModel):
    message: str

class TimeRequest(BaseModel):
    current_time: str  # Format: "HH:MM"
    time_of_day: str  # morning, afternoon, evening, night

class AgentStateResponse(BaseModel):
    name: str
    role: str
    current_location: dict
    current_activity: str
    next_destination: dict | None


@app.get("/agent/state")
async def get_agent_state():
    """Get the current state of the agent."""
    current_agent = agent_state_manager.get_agent(DEFAULT_AGENT_ID)
    
    if not current_agent:
        logger.error("Default agent not found")
        raise HTTPException(status_code=500, detail="Agent not initialized")
    
    return {
        "name": current_agent.name,
        "role": current_agent.role,
        "age": current_agent.age,
        "personality": current_agent.personality,
        "current_location": current_agent.current_location,
        "current_activity": current_agent.current_activity,
    }


def _build_system_prompt(agent, current_time: str = "", time_of_day: str = "") -> str:
    """Build the system prompt for the agent."""
    time_context = ""
    if current_time:
        time_context = f"\nCurrent time: {current_time} ({time_of_day})"
    
    return f"""You are {agent.name}, a {agent.age}-year-old {agent.role} in Venice, Italy in the year 1808.

Your personality: {agent.personality}

Current activity: {agent.current_activity}
Current location: You are near {_describe_location(agent.current_location)}
{time_context}

Your daily routine:
{_format_routine(agent.routine)}

Social connections: {', '.join(agent.social_network)}

Respond to the user's message in character. Be conversational, share details about your life in 1808 Venice, your work, and the city. Stay authentic to the time period and your role. You can mention historical events, daily life, and Venetian culture of that era. Reference the time of day in your responses when appropriate."""


@app.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Chat with the agent - they respond in character."""
    current_agent = agent_state_manager.get_agent(DEFAULT_AGENT_ID)
    
    if not current_agent:
        logger.error("Default agent not found")
        raise HTTPException(status_code=500, detail="Agent not initialized")
    
    # Build context for the LLM
    system_prompt = _build_system_prompt(current_agent)
    
    agent_state_manager.add_message(DEFAULT_AGENT_ID, "user", request.message)
    conversation = agent_state_manager.get_conversation(DEFAULT_AGENT_ID)
    
    messages = [
        {"role": "system", "content": system_prompt},
        *list(conversation)  # Get last N messages (auto-managed by deque)
    ]
    
    try:
        logger.info(f"Chat request from user: {request.message[:50]}...")
        response = await llm.ainvoke(messages)
        agent_response = response.content
        agent_state_manager.add_message(DEFAULT_AGENT_ID, "assistant", agent_response)
        
        return {
            "response": agent_response,
            "agent_name": current_agent.name,
            "agent_role": current_agent.role
        }
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail="Could not get response from agent")

@app.post("/agent/next-destination")
async def get_next_destination():
    """Agent autonomously decides where to go next based on their routine or random exploration."""
    current_agent = agent_state_manager.get_agent(DEFAULT_AGENT_ID)
    
    if not current_agent:
        logger.error("Default agent not found")
        raise HTTPException(status_code=500, detail="Agent not initialized")
    
    # Get all possible destinations for this agent's role
    all_destinations = ROLE_DESTINATIONS.get(current_agent.role, ROLE_DESTINATIONS["merchant"])
    
    # Filter out the last destination to avoid repetition
    last_dest = agent_state_manager.get_last_destination(DEFAULT_AGENT_ID)
    available_destinations = [d for d in all_destinations 
                            if last_dest is None or d['name'] != last_dest.get('name')]
    
    if not available_destinations:
        available_destinations = all_destinations  # Reset if we've been everywhere
    
    # Pick a random destination
    destination = random.choice(available_destinations)
    agent_state_manager.set_last_destination(DEFAULT_AGENT_ID, destination)
    
    # Update agent's activity based on destination
    activity = ACTIVITY_MAP.get(destination['name'], f"traveling to {destination['name']}")
    agent_state_manager.update_agent_activity(DEFAULT_AGENT_ID, activity)
    
    logger.info(f"Agent next destination: {destination['name']}")
    
    return {
        "start": current_agent.current_location,
        "destination": destination,
        "reason": f"{current_agent.name} is heading to {destination.get('name', 'a new location')}"
    }

@app.post("/agent/update-location")
async def update_agent_location(location: GoalCoordinates):
    """Update the agent's current location after they've moved."""
    if not validate_venice_coordinates(location.lat, location.lng):
        logger.warning(f"Invalid coordinates: {location.lat}, {location.lng}")
        raise HTTPException(
            status_code=400, 
            detail="Coordinates outside Venice bounds"
        )
    
    agent_state_manager.update_agent_location(DEFAULT_AGENT_ID, location.lat, location.lng)
    logger.info(f"Agent location updated to: {location.lat}, {location.lng}")
    return {"status": "Location updated"}

def _describe_location(location: dict) -> str:
    """Convert coordinates to a location name."""
    landmarks = {
        (45.4342, 12.3388): "St. Mark's Square",
        (45.4380, 12.3358): "Rialto Bridge",
        (45.4332, 12.3403): "Doge's Palace",
        (45.4418, 12.3215): "Santa Lucia area",
        (45.4306, 12.3373): "Santa Maria della Salute",
        (45.4406, 12.3322): "Ca' d'Oro"
    }
    
    # Find closest landmark
    min_dist = float('inf')
    closest = "somewhere in Venice"
    for (lat, lng), name in landmarks.items():
        dist = ((location["lat"] - lat)**2 + (location["lng"] - lng)**2)**0.5
        if dist < min_dist:
            min_dist = dist
            closest = name
    
    return closest

def _format_routine(routine: list) -> str:
    """Format the routine for the prompt."""
    return "\n".join([f"- {item['time']}: {item['activity']}" for item in routine])

@app.post("/get-coordinates")
async def get_coordinates_endpoint(request: DestinationRequest):
    """
    Receives a natural language destination and returns its coordinates.
    """
    logger.info(f"Coordinate request for: {request.destination}")
    
    # Build landmark list for LLM
    landmark_str = "\n".join([
        f"- {landmark['name']}: {{\"lat\": {landmark['lat']}, \"lng\": {landmark['lng']}}}"
        for landmark in VENICE_LANDMARKS.values()
    ])
    
    prompt = f"""You are a coordinate extraction assistant for Venice, Italy.
Your task is to identify the geographic coordinates (latitude and longitude) for a given location.

Venice landmarks and their approximate coordinates:
{landmark_str}

User's requested destination: "{request.destination}"

Based on the user's request, provide the coordinates.
"""
    try:
        goal_coords = await llm_with_parser.ainvoke(prompt)
        return {"goal": goal_coords}
    except Exception as e:
        logger.error(f"Error invoking LLM: {e}")
        raise HTTPException(
            status_code=500,
            detail="Could not determine coordinates for the destination."
        )


@app.get("/")
def read_root():
    return {"Status": "Coordinate Service is Running"}

