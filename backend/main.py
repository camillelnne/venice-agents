from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Venice Agents Backend")

# CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class ThoughtRequest(BaseModel):
    agent_name: str
    current_activity: str
    location: str
    time_of_day: str
    personality: Optional[str] = None
    context: Optional[str] = None

class ThoughtResponse(BaseModel):
    thought: str
    agent_name: str

@app.get("/")
async def root():
    return {"message": "Venice Agents Backend"}

@app.post("/generate-thought", response_model=ThoughtResponse)
async def generate_thought(request: ThoughtRequest):
    try:
        prompt = f"""
        You are {request.agent_name}, a Venetian merchant in 1740.
        
        Current situation:
        - Activity: {request.current_activity}
        - Location: {request.location}
        - Time: {request.time_of_day}
        {f"- Personality: {request.personality}" if request.personality else ""}
        
        Generate a brief, authentic thought (1-2 sentences) that this person might have right now, for example which describes what they are doing now.
        
        Respond in this exact format:
        THOUGHT: [your thought here]
        """
        
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a historical simulation assistant helping create authentic 18th century Venetian character thoughts."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150,
            temperature=0.8
        )
        
        content = response.choices[0].message.content
        # Parse the response
        lines = content.strip().split('\n')
        thought = ""
        
        for line in lines:
            if line.startswith("THOUGHT:"):
                thought = line.replace("THOUGHT:", "").strip()
        
        if not thought:
            thought = content.strip()
        
        return ThoughtResponse(
            thought=thought,
            agent_name=request.agent_name
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating thought: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)