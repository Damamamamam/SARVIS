#!/usr/bin/env bash
# SARVIS Windows App Startup Script

set -e

echo "===================================="
echo "Starting SARVIS Windows Desktop"
echo "===================================="

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env file."
    fi
fi

npm run dev