#!/usr/bin/env bash
# JARVIS Windows App Startup Script

set -e

echo "===================================="
echo "Starting JARVIS Windows Desktop"
echo "===================================="

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env file."
    fi
fi

npm run dev