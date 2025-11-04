# Venice Agents

An interactive Next.js application that visualizes AI-powered agent navigation across historic Venice (1808). The app uses GeoJSON historical map data and implements autonomous agents with distinct personalities who navigate the city's streets and waterways.

## Features

- **Historical Accuracy**: Based on 1808 Venice street and canal network
- **Autonomous AI Agents**: LLM-powered agents with unique personalities and daily routines
- **Real-time Pathfinding**: BFS algorithm for navigation through historic Venice
- **Interactive Chat**: Converse with agents about life in 1808 Venice
- **Time Simulation**: Adjustable time progression with day/night cycles

## Architecture

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Backend**: FastAPI (Python)
- **AI**: LangChain + OpenAI GPT-4o-mini
- **Maps**: Leaflet with historical Venice tiles
- **Pathfinding**: Custom graph-based navigation system

## Key Components

- `public/venice_1808_landregister_geometries.geojson` - Historical building footprints
- `public/1808_street_traghetto_route.geojson` - Street and water route network
- `python_api/` - FastAPI backend with agent state management
- `src/components/` - React components for map, agents, and UI
- `src/lib/` - Network utilities, API client, and shared logic

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

   Create a `.env.local` file in the root directory:

   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   NEXT_PUBLIC_PYTHON_API_URL=http://127.0.0.1:8000
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

1. **Start the Python API** (in one terminal)

   ```bash
   conda activate venice-agents  # if using conda
   cd python_api
   fastapi dev agent.py
   ```

   The API will start on `http://127.0.0.1:8000`

2. **Start the Next.js development server** (in another terminal)

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## Project Structure

```
venice-agents/
├── python_api/
│   ├── agent.py              # FastAPI endpoints
│   ├── agent_persona.py      # Agent personality definitions
│   ├── state_manager.py      # Agent state management
│   ├── constants.py          # Shared constants
│   └── validators.py         # Input validation
├── src/
│   ├── app/
│   │   ├── api/              # Next.js API routes
│   │   ├── page.tsx          # Main page
│   │   └── layout.tsx        # Root layout
│   ├── components/
│   │   ├── VeniceMap.tsx     # Main map component
│   │   ├── AutonomousAgent.tsx
│   │   ├── AgentChatbox.tsx
│   │   ├── NetworkRenderer.tsx
│   │   └── TimeDisplay.tsx
│   ├── hooks/
│   │   └── useAgentMovement.ts
│   ├── lib/
│   │   ├── api-client.ts     # API client for backend
│   │   ├── constants.ts      # Frontend constants
│   │   ├── network.ts        # Pathfinding utilities
│   │   └── TimeContext.tsx   # Time management
│   └── types/
│       └── agent.ts          # TypeScript type definitions
└── public/
    └── *.geojson             # Historical GeoJSON data
```

## Development

### Adding New Agents

Edit `python_api/agent_persona.py` to add new agent personas with unique personalities and routines.

### Customizing the Map

Historical tiles are from [Time Atlas@EPFL](https://timeatlas.eu/). You can adjust the tile source in `VeniceMap.tsx`.

### Modifying Agent Behavior

Agent decision-making is in `python_api/agent.py`. The LLM prompt can be customized in the `_build_system_prompt` function.

## License

This project uses historical data from Time Atlas@EPFL.
```