#!/usr/bin/env bash
# SARVIS Web App Startup Script

set -e

echo "===================================="
echo "Starting SARVIS Web App"
echo "===================================="

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env file."
    fi
fi

npm run dev
