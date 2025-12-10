from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Venice Agents Backend")



MODEL = "gpt-5"
JSON_FORMAT = {"type": "json_object"}

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

class SimpleThoughtRequest(BaseModel):
    agent_name: str
    current_activity: str
    location_label: str
    time_of_day: str
    personality: Optional[str] = None
    context: Optional[str] = None

class SimpleThoughtResponse(BaseModel):
    thought: str
    agent_name: str

class DetourOption(BaseModel):
    id: str
    type: str
    label: str

class DetourDecisionRequest(BaseModel):
    agent_name: str
    personality: str
    time_of_day: str
    main_goal: str
    available_minutes_before_next_obligation: int
    options: list[DetourOption]

class DetourDecisionResponse(BaseModel):
    choice_id: str
    thought: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "Venice Agents Backend"}

@app.post("/thought", response_model=SimpleThoughtResponse)
async def generate_simple_thought(request: SimpleThoughtRequest):
    try:
        user_prompt = f"""
        You are {request.agent_name}, thinking in first person.

        - Current activity: {request.current_activity}
        - Location: {request.location_label}
        - Time of day: {request.time_of_day}
        {f"- Personality: {request.personality}" if request.personality else ""}
        {f"- Context: {request.context}" if request.context else ""}

        Provide a concise inner thought (1-2 sentences). Do not propose actions, plans, or decisions.
        
        Respond ONLY with valid JSON matching this schema:
        {{
          "thought": "<first person thought here>",
          "agent_name": "{request.agent_name}"
        }}
        """

        response = client.chat.completions.create(
            model=MODEL,
            response_format=JSON_FORMAT,
            messages=[
                {"role": "system", "content": "You are the character, thinking briefly about what is happening. Stay concise and authentic. Return only valid JSON."},
                {"role": "user", "content": user_prompt},
            ],

        )

        content = response.choices[0].message.content
        print(f"/thought LLM Response: {content}")
        
        parsed = json.loads(content)
        thought = parsed.get("thought", "").strip()
        
        if not thought:
            thought = content.strip()

        return SimpleThoughtResponse(
            thought=thought,
            agent_name=request.agent_name,
        )
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating thought: {str(e)}")

@app.post("/decide-detour", response_model=DetourDecisionResponse)
async def decide_detour(request: DetourDecisionRequest):
    
    if not request.options:
      return DetourDecisionResponse(choice_id="none", thought=None)

    try:
        options_text = "\n".join(
            [
                f"{idx + 1}. id={opt.id} | type={opt.type} | label={opt.label}"
                for idx, opt in enumerate(request.options)
            ]
        )

        user_prompt = f"""
        You are {request.agent_name} deciding whether to take a quick detour.
        - Personality: {request.personality}
        - Time of day: {request.time_of_day}
        - Main goal: {request.main_goal}
        - Available minutes before next obligation: {request.available_minutes_before_next_obligation}

        Options (choose exactly one id from the list or "none"):
        {options_text if options_text else "none"}

        Return JSON with:
        - "choice_id": one of the provided option ids or "none"
        - "thought": optional one-line first-person rationale

        Never invent new locations; only choose from the provided ids or "none".
        """

        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You decide on a detour using only the provided options. Pick the most fitting id or 'none'."},
                {"role": "user", "content": user_prompt},
            ],
            response_format=JSON_FORMAT,
        )

        content = response.choices[0].message.content
        print(f"/decide-detour LLM Response: {content}")
        parsed = json.loads(content)

        choice_id = parsed.get("choice_id", "none")
        allowed_ids = {opt.id for opt in request.options}
        if choice_id not in allowed_ids and choice_id != "none":
            choice_id = "none"

        thought = parsed.get("thought")
        if isinstance(thought, str):
            thought = thought.strip()
        else:
            thought = None

        return DetourDecisionResponse(choice_id=choice_id, thought=thought)
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error deciding detour: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
