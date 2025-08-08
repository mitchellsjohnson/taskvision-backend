#!/bin/bash

# Smart development startup script for TaskVision Backend
# Kills existing processes on port 6060 before starting

PORT=6060
APP_NAME="TaskVision Backend"

echo "🚀 Starting $APP_NAME on port $PORT..."

# Function to kill processes on the specified port
kill_port() {
    local port=$1
    echo "🔍 Checking for existing processes on port $port..."
    
    # Find processes using the port
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ ! -z "$pids" ]; then
        echo "⚠️  Found existing processes on port $port: $pids"
        echo "🔪 Killing existing processes..."
        
        # Kill the processes
        echo $pids | xargs kill -9 2>/dev/null
        
        # Wait a moment for processes to die
        sleep 2
        
        # Check if any are still running
        local remaining=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$remaining" ]; then
            echo "❌ Some processes are still running on port $port: $remaining"
            echo "💀 Force killing remaining processes..."
            echo $remaining | xargs kill -9 2>/dev/null
            sleep 1
        fi
        
        echo "✅ Port $port is now free"
    else
        echo "✅ Port $port is already free"
    fi
}

# Kill any existing processes on our port
kill_port $PORT

# Start the application
echo "🎯 Starting $APP_NAME..."
cd "$(dirname "$0")/.." # Go to the backend directory
npm start