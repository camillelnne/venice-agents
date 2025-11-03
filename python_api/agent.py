from dotenv import load_dotenv
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from agent_persona import AGENT_PERSONAS, get_random_destination
import random

load_dotenv(dotenv_path="../.env.local")
api_key = os.getenv("OPENAI_API_KEY")

class GoalCoordinates(BaseModel):
    lat: float
    lng: float

llm = init_chat_model("openai:gpt-4o-mini", temperature=0.7)  # Higher temp for personality

llm_with_parser = llm.with_structured_output(GoalCoordinates)

# Global agent state (in production, use a database)
current_agent = AGENT_PERSONAS["marco"]  # Start with Marco
conversation_history = []
last_destination = None  # Track last destination to avoid repetition


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
    """Get the current state of the agent"""
    return {
        "name": current_agent.name,
        "role": current_agent.role,
        "age": current_agent.age,
        "personality": current_agent.personality,
        "current_location": current_agent.current_location,
        "current_activity": current_agent.current_activity,
    }

@app.post("/agent/chat")
async def chat_with_agent(request: ChatRequest):
    """Chat with the agent - they respond in character"""
    global conversation_history
    
    # Build context for the LLM
    system_prompt = f"""You are {current_agent.name}, a {current_agent.age}-year-old {current_agent.role} in Venice, Italy in the year 1808.

Your personality: {current_agent.personality}

Current activity: {current_agent.current_activity}
Current location: You are near {_describe_location(current_agent.current_location)}

Your daily routine:
{_format_routine(current_agent.routine)}

Social connections: {', '.join(current_agent.social_network)}

Respond to the user's message in character. Be conversational, share details about your life in 1808 Venice, your work, and the city. Stay authentic to the time period and your role. You can mention historical events, daily life, and Venetian culture of that era. Reference the time of day in your responses when appropriate."""

    conversation_history.append({"role": "user", "content": request.message})
    
    messages = [
        {"role": "system", "content": system_prompt},
        *conversation_history[-10:]  # Keep last 10 messages for context
    ]
    
    try:
        response = await llm.ainvoke(messages)
        agent_response = response.content
        conversation_history.append({"role": "assistant", "content": agent_response})
        
        return {
            "response": agent_response,
            "agent_name": current_agent.name,
            "agent_role": current_agent.role
        }
    except Exception as e:
        print(f"Error in chat: {e}")
        return {"error": "Could not get response from agent"}

@app.post("/agent/next-destination")
async def get_next_destination():
    """Agent autonomously decides where to go next based on their routine or random exploration"""
    global current_agent, last_destination
    
    # Get all possible destinations for this agent's role
    all_destinations = _get_all_destinations_for_role(current_agent.role)
    
    # Filter out the last destination to avoid repetition
    available_destinations = [d for d in all_destinations 
                            if last_destination is None or d['name'] != last_destination.get('name')]
    
    if not available_destinations:
        available_destinations = all_destinations  # Reset if we've been everywhere
    
    # Pick a random destination
    destination = random.choice(available_destinations)
    last_destination = destination
    
    # Update agent's activity based on destination
    activity_map = {
        "Rialto Market": "heading to work at the market",
        "Rialto Bridge": "conducting business at Rialto",
        "St. Mark's Square": "visiting San Marco",
        "Doge's Palace": "attending to business at the palace",
        "Santa Lucia": "near the waterfront",
        "Santa Maria della Salute": "visiting the basilica",
        "Ca' d'Oro": "in the Cannaregio district"
    }
    
    current_agent.current_activity = activity_map.get(destination['name'], f"traveling to {destination['name']}")
    
    return {
        "start": current_agent.current_location,
        "destination": destination,
        "reason": f"{current_agent.name} is heading to {destination.get('name', 'a new location')}"
    }

@app.post("/agent/update-location")
async def update_agent_location(location: GoalCoordinates):
    """Update the agent's current location after they've moved"""
    global current_agent
    current_agent.current_location = {"lat": location.lat, "lng": location.lng}
    return {"status": "Location updated"}

def _get_all_destinations_for_role(role: str) -> list:
    """Get all possible destinations for a given role"""
    destinations = {
        "merchant": [
            {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Market"},
            {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"},
            {"lat": 45.4332, "lng": 12.3403, "name": "Doge's Palace"},
            {"lat": 45.4306, "lng": 12.3373, "name": "Santa Maria della Salute"},
            {"lat": 45.4406, "lng": 12.3322, "name": "Ca' d'Oro"}
        ],
        "gondolier": [
            {"lat": 45.4418, "lng": 12.3215, "name": "Santa Lucia"},
            {"lat": 45.4306, "lng": 12.3373, "name": "Santa Maria della Salute"},
            {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Bridge"},
            {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"}
        ],
        "noble": [
            {"lat": 45.4332, "lng": 12.3403, "name": "Doge's Palace"},
            {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"},
            {"lat": 45.4406, "lng": 12.3322, "name": "Ca' d'Oro"},
            {"lat": 45.4306, "lng": 12.3373, "name": "Santa Maria della Salute"}
        ],
        "artisan": [
            {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Market"},
            {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"}
        ],
        "servant": [
            {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Market"},
            {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"}
        ]
    }
    return destinations.get(role, destinations["merchant"])

def _describe_location(location: dict) -> str:
    """Convert coordinates to a location name"""
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
    """Format the routine for the prompt"""
    return "\n".join([f"- {item['time']}: {item['activity']}" for item in routine])

@app.post("/get-coordinates")
async def get_coordinates_endpoint(request: DestinationRequest):
    """
    Receives a natural language destination and returns its coordinates.
    """
    prompt = f"""You are a coordinate extraction assistant for Venice, Italy.
Your task is to identify the geographic coordinates (latitude and longitude) for a given location.

Venice landmarks and their approximate coordinates:
- St. Mark's Square (Piazza San Marco): {{"lat": 45.4342, "lng": 12.3388}}
- Rialto Bridge: {{"lat": 45.4380, "lng": 12.3358}}
- Doge's Palace: {{"lat": 45.4332, "lng": 12.3403}}
- Santa Lucia Train Station: {{"lat": 45.4418, "lng": 12.3215}}
- Santa Maria della Salute: {{"lat": 45.4306, "lng": 12.3373}}
- Ca' d'Oro: {{"lat": 45.4406, "lng": 12.3322}}

User's requested destination: "{request.destination}"

Based on the user's request, provide the coordinates.
"""
    try:
        goal_coords = await llm_with_parser.ainvoke(prompt)
        return {"goal": goal_coords}
    except Exception as e:
        print(f"Error invoking LLM: {e}")
        return {"error": "Could not determine coordinates for the destination."}


@app.get("/")
def read_root():
    return {"Status": "Coordinate Service is Running"}

