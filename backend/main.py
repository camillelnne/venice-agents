from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from openai import OpenAI
from dotenv import load_dotenv
import random

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
    current_destination: Optional[str] = None

class ThoughtResponse(BaseModel):
    thought: str
    agent_name: str
    override_routine: bool = False
    desired_action: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "Venice Agents Backend"}

@app.post("/generate-thought", response_model=ThoughtResponse)
async def generate_thought(request: ThoughtRequest):
    try:
        # 20% chance to consider deviating from routine
        should_consider_deviation = random.random() < 0.2
        
        if should_consider_deviation and not("travel" in str.lower(request.current_activity)): # if travelling, shouldn't be overrinding
            prompt = f"""
            You are {request.agent_name}, a Venetian merchant in 1740.
            
            Current situation:
            - Current Activity: {request.current_activity}
            - Location: {request.location}
            - Time: {request.time_of_day}
            {f"- Planned Destination: {request.current_destination}" if request.current_destination else ""}
            {f"- Personality: {request.personality}" if request.personality else ""}
            
            You're currently following your daily routine, but you can choose to do something spontaneous if you feel like it.
            
            Consider: Are you tired? Bored? Want to socialize? Curious about something?
            
            Respond in this format:
            THOUGHT: [what you're thinking/feeling, in first person.]
            OVERRIDE: [YES or NO - do you want to deviate from your routine?]
            ACTION: [if YES, what would you like to do? Write in first person. e.g., "take a walk to Rialto", "visit a tavern", "chat with neighbors"]
            """
        else:
            prompt = f"""
            You are {request.agent_name}, a Venetian merchant in 1740.
            
            Current situation:
            - Activity: {request.current_activity}
            - Location: {request.location}
            - Time: {request.time_of_day}
            {f"- Personality: {request.personality}" if request.personality else ""}
            
            Generate a brief, authentic thought (1-2 sentences) that describes what you are doing or feeling right now.
            
            Respond in this exact format:
            THOUGHT: [your thought here]
            """
        
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a historical simulation assistant helping create authentic 18th century Venetian character thoughts and decisions."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0.8
        )
        
        content = response.choices[0].message.content
        print(f"LLM Response: {content}")
        
        # Parse the response
        lines = content.strip().split('\n')
        thought = ""
        override = False
        desired_action = None
        
        for line in lines:
            if line.startswith("THOUGHT:"):
                thought = line.replace("THOUGHT:", "").strip()
            elif line.startswith("OVERRIDE:"):
                override_text = line.replace("OVERRIDE:", "").strip().upper()
                override = override_text == "YES"
            elif line.startswith("ACTION:"):
                desired_action = line.replace("ACTION:", "").strip()
        
        if not thought:
            thought = content.strip()
        
        return ThoughtResponse(
            thought=thought,
            agent_name=request.agent_name,
            override_routine=override,
            desired_action=desired_action
        )
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating thought: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)