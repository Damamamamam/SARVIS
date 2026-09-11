#!/usr/bin/env bash
# SARVIS Windows App Build Script

set -e

echo "===================================="
echo "SARVIS Windows App Build Script"
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

echo "Building TypeScript and UI assets..."
npm run build

echo
echo "===================================="
echo "Build Complete!"
echo "===================================="
echo "Run 'npm run dev' to launch the app."
echo "Run 'npm run package:win' to build the Windows installer."