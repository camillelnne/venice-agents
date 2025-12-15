#!/bin/bash

# Start the Venice Agents development environment

echo "🚀 Starting Venice Agents..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your OPENAI_API_KEY"
    exit 1
fi

# Prompt for number of agents
read -p "How many agents would you like to simulate? (default: 3, max: 5): " num_agents
num_agents=${num_agents:-3}

# Validate input
if ! [[ "$num_agents" =~ ^[0-9]+$ ]] || [ "$num_agents" -lt 1 ]; then
    echo "⚠️  Invalid number. Using default: 3"
    num_agents=3
fi

# Apply maximum limit
if [ "$num_agents" -gt 5 ]; then
    echo "⚠️  Too many agents. Maximum is 5. Using 5."
    num_agents=5
fi


echo "📊 Starting simulation with $num_agents agent(s)..."
export NEXT_PUBLIC_NUM_AGENTS=$num_agents

# Start backend in background
echo "🐍 Starting FastAPI backend..."
cd backend
python main.py &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 2

# Start frontend
echo "⚛️  Starting Next.js frontend..."
npm run dev &
FRONTEND_PID=$!

echo "✅ Services started!"
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Wait for both processes
wait
