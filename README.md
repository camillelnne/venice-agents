# Venice Agents

An interactive Next.js application that simulates the daily life of Venetian merchants in 1740. The project combines historical archival data (1740 Catastici tax register) with LLM-powered autonomous agents to explore the texture of everyday urban life in 18th-century Venice.

## Features

- **Historical Data Foundation**: Built from the 1740 Venetian tax register (Catastici) with 968 merchants across authentic shop types
- **Autonomous AI Agents**: LLM-powered agents with unique personalities, daily routines, and decision-making capabilities
- **Spontaneous Detours**: Agents autonomously decide to visit nearby taverns, churches, and courtyards based on personality and available time
- **Historical Accuracy**: Navigation uses the 1808 Venice street and traghetto network as a proxy for 1740
- **Real-time Pathfinding**: BFS algorithm for navigation through historic Venice's streets and canals
- **Interactive Thoughts**: Watch agents generate poetic (sometimes amusingly melodramatic) first-person thoughts
- **Multi-Agent Simulation**: Support for up to 5 simultaneous agents with independent decision-making
- **Time Simulation**: Adjustable time progression with routine-based scheduling

## Architecture

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Backend**: FastAPI (Python)
- **AI**: OpenAI GPT-4o-mini (with optional Gemini 2.5-flash support)
- **Maps**: Leaflet with historical Venice tiles from Time Atlas@EPFL
- **Pathfinding**: Custom graph-based BFS navigation system

### System Architecture Diagram

```
OFFLINE DATA PIPELINE (scripts/)
 Catastici → merchants_dataset → personas.json + pois.json
                         |
                         v
┌────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                         │
│                                                                    │
│  Data Load: public/data/*.json + 1808_street_cleaned.geojson       │
│                                                                    │
│  ┌───────────────┐     ┌───────────────────┐     ┌───────────────┐ │
│  │ ENV LAYER     │     │ SIM LAYER         │     │ UI LAYER      │ │
│  │ - network.ts  │     │ - AgentState[]    │     │ - map render  │ │
│  │ - pois lookup │<--->│ - routine policy  │<--->│ - panels/log  │ │
│  │ - pathfinding │     │ - detour policy   │     │ - time ctrl   │ │
│  └───────┬───────┘     └─────────┬─────────┘     └───────────────┘ │
│          │                       │                                 │
│          │ candidate POIs +      │ request narrative/choice        │
│          │ feasibility checks     │                                │
│          v                       v                                 │
│     ┌───────────────────────────────────────────────────────────┐  │
│     │ Next API Proxy (same-origin)                              │  │
│     │  POST /api/llm/thought  → Python /thought                 │  │
│     │  POST /api/llm/detour   → Python /decide-detour           │  │
│     └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                              |
                              v
┌────────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI, stateless)                    │
│                                                                    │
│  /thought:  context → prompt → LLM → JSON {thought}                │
│  /decide-detour: options → prompt → LLM → JSON {choice_id, thought}│
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

The architecture follows a clear separation of concerns:
- **Offline pipeline**: Processes historical data into simulation-ready datasets
- **Frontend**: Manages all agent state, pathfinding, and decision logic client-side
- **Backend**: Stateless LLM service for generating thoughts and making narrative choices

## Key Components

### Data
- `public/data_raw/1740_Catastici_2025-09-24.geojson` - Original 1740 tax register data
- `public/data/1808_street_traghetto_route.geojson` - Street and traghetto network (cleaned by previous FDH group)
- `public/data/merchants_dataset.csv` - Processed merchant dataset (968 merchants)
- `public/data/POI_dataset.geojson` - Points of interest for spontaneous detours (3,536 locations)
- `public/data/personas.json` - Generated merchant personas with personalities and routines

### Code
- `backend/` - FastAPI backend with LLM endpoints for thoughts and detour decisions
- `src/components/` - React components for map visualization and agent rendering
- `src/lib/` - Network graph utilities, pathfinding (BFS), and agent logic
- `src/hooks/` - React hooks for agent state management, thoughts, and multi-agent coordination
- `scripts/` - Python scripts for data processing and dataset generation
- `notebooks/` - Jupyter notebook with data exploration and analysis

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- OpenAI API key

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd venice-agents
   ```

2. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Install Node.js dependencies**

   ```bash
   npm install
   ```

4. **Install Python dependencies**

   ```bash
   pip install -r requirements.txt
   ```

   Or use conda:

   ```bash
   conda create -n venice-agents python=3.9
   conda activate venice-agents
   pip install -r requirements.txt
   ```

### Running the Application

**Option 1: Use the startup script (starts both backend and frontend)**

   ```bash
   ./start-dev.sh
   ```

**Option 2: Run manually**

   Terminal 1 - Backend:
   ```bash
   cd backend
   python main.py
   ```

   Terminal 2 - Frontend:
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:8000`
   
   The app will be available at `http://localhost:3000`

### How the Simulation Works

#### Daily Routines
Each agent follows a time-based daily routine with activities like:
- `HOME` - At home
- `SHOP` - Working at their shop
- `TRAVEL_TO_SHOP` / `TRAVEL_HOME` - Commuting
- `FREE_TIME` - Available for detours

Agents automatically transition between activities and compute paths using BFS pathfinding.

#### Spontaneous Detours
Every 5 simulation minutes, agents in routine mode evaluate nearby detour opportunities:
- The system fetches POIs within a 15-minute walking radius
- Agents are presented with 3-4 diverse options (taverns, churches, gardens) plus "none"
- The LLM decides based on personality, time constraints, and available slack time
- Agents automatically return to their routine after dwelling at the location

Detour constraints:
- Maximum 2 detours per day per agent
- 60-minute cooldown between detours
- Requires at least 20 minutes before next obligation
- Only during stationary routines (not while traveling)

#### Thoughts
Agents generate first-person thoughts reflecting their personality and context. The LLM tends to produce unexpectedly poetic and contemplative musings, giving merchants a rather philosophical (and occasionally melodramatic) inner life.

When you see agent activity:
- Console logs show detour decisions: `🎯 Agent taking detour to [location]`
- Thought bubbles display their reasoning
- Paths update in real-time as agents move through Venice


## Data Processing

The project includes scripts to regenerate datasets from the raw Catastici:

```bash
# Build merchant dataset from raw Catastici
python scripts/build_merchant_dataset.py

# Build POI dataset
python scripts/build_POI_dataset.py

# Generate personas with personalities and routines
python scripts/generate_personas.py
```

Explore the data processing logic in `notebooks/data_exploration.ipynb`.

## Development

### Adding More Agents

Agents are loaded from `public/data/personas.json`. To add more:
1. Run `scripts/generate_personas.py` with different sampling
2. Or manually add entries following the persona schema

### Customizing Agent Behavior

- **Thought generation**: Modify prompts in `backend/main.py` (`/thought` endpoint)
- **Detour logic**: Adjust constraints in `src/hooks/useAgent.ts` or `src/hooks/useAgents.ts`
- **Routine types**: Extend the `RoutineType` enum in `src/types/persona.ts`
- **Pathfinding**: Modify BFS algorithm in `src/lib/network.ts`

### Customizing the Map

Historical tiles are from [Time Atlas@EPFL](https://timeatlas.eu/). You can adjust the tile source in `src/components/VeniceMap.tsx`.

## Project Context

This project was developed as part of the **Foundation of Digital Humanities (DH-405)** course at EPFL. It explores how combining archival data, spatial modeling, and generative AI can bring us closer to understanding the lived experience of everyday life in 18th-century Venice.

**Course**: Foundation of Digital Humanities (DH-405), EPFL  
**Professor**: Frédéric Kaplan  
**Supervisor**: Alexander Rusnak  
**Authors**: Camille Lannoye, Sophia Kovalenko

## License

This project uses historical data from Time Atlas@EPFL and the 1740 Venetian Catastici tax register.
```