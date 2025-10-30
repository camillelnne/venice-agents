from dotenv import load_dotenv
import os
from typing import List
from typing_extensions import TypedDict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START

load_dotenv(dotenv_path="../.env.local")
api_key = os.getenv("OPENAI_API_KEY")

# --- LangGraph Agent Definition ---

class State(TypedDict):
    question: str
    answer: str
    history: List[str]


llm = init_chat_model("openai:gpt-4o-mini", temperature=0)

def classify(state: State):
    return {"question": state["question"]}

def generate(state: State):
    history_context = "\n".join(state.get("history", []))
    prompt = f"""You are a conversational AI assistant for a Venice simulation. Use conversation history to reply naturally.

History:
{history_context}

Question:
{state['question']}

Answer:"""
    response = llm.invoke(prompt)
    return {"answer": response.content}

def refine(state: State):
    refined = state["answer"]
    history = state.get("history", [])
    history.append(f"Q: {state['question']}\nA: {refined}")
    return {"answer": refined, "history": history}

# Build the graph
graph_builder = StateGraph(State)
graph_builder.add_node("classify", classify)
graph_builder.add_node("generate", generate)
graph_builder.add_node("refine", refine)

graph_builder.add_edge(START, "classify")
graph_builder.add_edge("classify", "generate")
graph_builder.add_edge("generate", "refine")
graph_builder.add_edge("refine", "__end__")

graph = graph_builder.compile()


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

class ChatRequest(BaseModel):
    question: str
    history: List[str]

@app.post("/chat")
def chat_endpoint(request: ChatRequest):
    """Receives a question and history, invokes the agent, and returns the response."""
    state = {
        "question": request.question,
        "answer": "",
        "history": request.history,
    }
    response_state = graph.invoke(state)
    return {
        "answer": response_state.get("answer", "No answer generated."),
        "history": response_state.get("history", []),
    }

@app.get("/")
def read_root():
    return {"Status": "Running"}

