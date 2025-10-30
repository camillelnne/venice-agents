from dotenv import load_dotenv
import os
from typing import List
from typing_extensions import TypedDict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from langchain_core.output_parsers import JsonOutputParser

load_dotenv(dotenv_path="../.env.local")
api_key = os.getenv("OPENAI_API_KEY")

class GoalCoordinates(BaseModel):
    lat: float
    lng: float

llm = init_chat_model("openai:gpt-4o-mini", temperature=0)

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

