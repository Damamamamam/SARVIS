#!/usr/bin/env bash
# SARVIS Web App Build Script

set -e

echo "===================================="
echo "SARVIS Web App Build Script"
echo "===================================="
echo

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Building TypeScript and web UI assets..."
npm run build

echo
echo "===================================="
echo "Build Complete!"
echo "===================================="
echo "Run 'npm start' to launch the web app (http://localhost:9742)."
