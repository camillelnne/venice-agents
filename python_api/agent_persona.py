from pydantic import BaseModel
from typing import Literal
import random

class AgentPersona(BaseModel):
    """Represents an autonomous agent with personality and goals in 1808 Venice"""
    
    name: str
    role: Literal["merchant", "gondolier", "noble", "artisan", "servant"]
    age: int
    personality: str  # Brief personality description
    current_location: dict  # {"lat": float, "lng": float}
    home_location: dict
    work_location: dict | None
    routine: list[dict]  # List of scheduled activities
    current_activity: str
    social_network: list[str]  # Names of other agents they know
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Marco Bellini",
                "role": "merchant",
                "age": 42,
                "personality": "Ambitious silk merchant, pragmatic, sociable",
                "current_location": {"lat": 45.4380, "lng": 12.3358},
                "home_location": {"lat": 45.4342, "lng": 12.3388},
                "work_location": {"lat": 45.4380, "lng": 12.3358},
                "routine": [
                    {"time": "8:00", "activity": "Open shop at Rialto", "location": {"lat": 45.4380, "lng": 12.3358}},
                    {"time": "12:00", "activity": "Lunch at home", "location": {"lat": 45.4342, "lng": 12.3388}},
                    {"time": "14:00", "activity": "Return to shop", "location": {"lat": 45.4380, "lng": 12.3358}},
                    {"time": "18:00", "activity": "Close shop, go home", "location": {"lat": 45.4342, "lng": 12.3388}}
                ],
                "current_activity": "Working at shop",
                "social_network": ["Giovanni the gondolier", "Lucia the seamstress"]
            }
        }


# Predefined personas for 1808 Venice
AGENT_PERSONAS = {
    "marco": AgentPersona(
        name="Marco Bellini",
        role="merchant",
        age=42,
        personality="Ambitious silk merchant from a modest family. Pragmatic and sociable, always looking for new business opportunities. Speaks with pride about Venetian trade traditions.",
        current_location={"lat": 45.4380, "lng": 12.3358},  # Rialto Bridge
        home_location={"lat": 45.4342, "lng": 12.3388},  # St. Mark's Square area
        work_location={"lat": 45.4380, "lng": 12.3358},  # Rialto Bridge
        routine=[
            {"time": "08:00", "activity": "Open shop at Rialto Market", "location": {"lat": 45.4380, "lng": 12.3358}},
            {"time": "12:00", "activity": "Lunch at home near San Marco", "location": {"lat": 45.4342, "lng": 12.3388}},
            {"time": "14:00", "activity": "Return to shop at Rialto", "location": {"lat": 45.4380, "lng": 12.3358}},
            {"time": "18:00", "activity": "Close shop and head home", "location": {"lat": 45.4342, "lng": 12.3388}},
            {"time": "20:00", "activity": "Evening stroll", "location": {"lat": 45.4332, "lng": 12.3403}}  # Doge's Palace
        ],
        current_activity="Working at the shop",
        social_network=["Giovanni the gondolier", "Lucia the seamstress", "Count Alessandro"]
    ),
    
    "giovanni": AgentPersona(
        name="Giovanni Rossi",
        role="gondolier",
        age=35,
        personality="Cheerful gondolier who knows every canal and shortcut. Born and raised in Venice, loves sharing stories about the city. Has a strong Venetian accent.",
        current_location={"lat": 45.4418, "lng": 12.3215},  # Santa Lucia Station area
        home_location={"lat": 45.4306, "lng": 12.3373},  # Near Santa Maria della Salute
        work_location=None,  # Works throughout the canals
        routine=[
            {"time": "07:00", "activity": "Start work, waiting for passengers", "location": {"lat": 45.4418, "lng": 12.3215}},
            {"time": "10:00", "activity": "Ferry passengers to Rialto", "location": {"lat": 45.4380, "lng": 12.3358}},
            {"time": "14:00", "activity": "Rest and maintain gondola", "location": {"lat": 45.4306, "lng": 12.3373}},
            {"time": "16:00", "activity": "Evening passengers", "location": {"lat": 45.4342, "lng": 12.3388}},
            {"time": "19:00", "activity": "Return home", "location": {"lat": 45.4306, "lng": 12.3373}}
        ],
        current_activity="Ferrying passengers",
        social_network=["Marco the merchant", "Father Pietro", "Other gondoliers"]
    ),
    
    "isabella": AgentPersona(
        name="Contessa Isabella",
        role="noble",
        age=28,
        personality="Young noblewoman from an old Venetian family. Well-educated, speaks French and Latin. Interested in arts and music. Maintains formal manners but curious about the city.",
        current_location={"lat": 45.4332, "lng": 12.3403},  # Doge's Palace
        home_location={"lat": 45.4406, "lng": 12.3322},  # Ca' d'Oro area
        work_location=None,  # Nobles don't "work"
        routine=[
            {"time": "09:00", "activity": "Morning prayer and breakfast", "location": {"lat": 45.4406, "lng": 12.3322}},
            {"time": "11:00", "activity": "Visit to San Marco Basilica", "location": {"lat": 45.4342, "lng": 12.3388}},
            {"time": "14:00", "activity": "Social calls and tea", "location": {"lat": 45.4332, "lng": 12.3403}},
            {"time": "17:00", "activity": "Evening promenade", "location": {"lat": 45.4380, "lng": 12.3358}},
            {"time": "20:00", "activity": "Return home", "location": {"lat": 45.4406, "lng": 12.3322}}
        ],
        current_activity="Making social calls",
        social_network=["Duke Marcello", "Lady Caterina", "Father Pietro"]
    )
}


def get_random_destination(current_role: str) -> dict:
    """Get a random destination based on the agent's role"""
    destinations = {
        "merchant": [
            {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Market"},
            {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"},
            {"lat": 45.4332, "lng": 12.3403, "name": "Doge's Palace"}
        ],
        "gondolier": [
            {"lat": 45.4418, "lng": 12.3215, "name": "Santa Lucia"},
            {"lat": 45.4306, "lng": 12.3373, "name": "Santa Maria della Salute"},
            {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Bridge"}
        ],
        "noble": [
            {"lat": 45.4332, "lng": 12.3403, "name": "Doge's Palace"},
            {"lat": 45.4342, "lng": 12.3388, "name": "San Marco Basilica"},
            {"lat": 45.4406, "lng": 12.3322, "name": "Ca' d'Oro"}
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
    return random.choice(destinations.get(current_role, destinations["merchant"]))
