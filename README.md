# Venice Agents

An interactive Next.js application that visualizes AI-powered agent navigation across historic Venice (1808). The app uses GeoJSON historical map data and implements autonomous agents with distinct personalities who navigate the city's streets and waterways.

## Features

- **Historical Accuracy**: Based on 1808 Venice street and canal network
- **Autonomous AI Agents**: LLM-powered agents with unique personalities and daily routines
- **Spontaneous Behavior**: Agents can autonomously decide to deviate from their routines (5% chance)
- **Real-time Pathfinding**: BFS algorithm for navigation through historic Venice
- **Interactive Thoughts**: Watch agents think and make decisions in real-time
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

**Run the script which starts the backend and the app at the same time**

   ```bash
   ./start-dev.sh
   ```

   The API will be available at `http://localhost:8000`

   The app will be available at `http://localhost:3000`

### How Spontaneous Behavior Works

Agents generate thoughts periodically using GPT-4. With a 5% probability, the LLM is asked if the agent wants to deviate from their routine. The agent might decide to:

- Take a walk to a specific location (e.g., "take a walk to Rialto")
- Visit a tavern for socializing
- Stop and rest
- Chat with neighbors

When an override occurs, you'll see:
- A console log: `🎯 Agent wants to do: [action]`
- The agent's thought bubble shows their reasoning
- (Future enhancement: Agent will actually change their path based on the action)


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