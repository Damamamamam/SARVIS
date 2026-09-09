# JARVIS Windows Desktop Assistant

JARVIS is a native Windows desktop assistant powered by Electron, featuring an 8-key API rotator, speech/voice interactions, Windows system automation, screen-time watching, and a modern glassmorphic interface.

## 🏗️ Architecture

- **Windows Desktop App (Electron)**: Native Windows window with glassmorphism UI & system tray integration.
- **Local Brain Orchestrator**: In-process Node.js brain handling intent routing, tool execution, and personalization.
- **8-Key API Rotator**: Failover across Gemini, Groq, OpenRouter, Cerebras, Mistral, Together, Cohere, and DeepSeek.
- **Windows System Controller**: Control Windows volume, brightness, applications, and system tasks.
- **Windows Process Watchdog**: Active window screen-time watcher and doomscroll guard.

## 📋 Prerequisites

- Windows 10/11
- Node.js 18+
- npm or yarn

## 🚀 Quick Start

### 1. Install & Configure

```bash
# Install dependencies
npm install

# Copy environment template (if not already done)
cp .env.example .env

# Edit .env and add your API keys (or configure directly in the app UI)
```

### 2. Launch JARVIS

```bash
# Launch app in development mode
npm run dev

# Or run via startup script
start-brain.bat
```

### 3. Package Standalone Windows Executable (.exe)

```bash
# Package into Windows NSIS Installer and Portable .exe
npm run package:win
```

The compiled installer will be created in the `dist/` directory.

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run specific test suites
npm run test:rotator
npm run test:device
npm run test:audio
npm run test:vision
```

## 🏗️ Project Structure

```
brain/
├── src/
│   ├── agent/           # Main brain orchestration
│   ├── config/         # Environment key loader
│   ├── electron/       # Electron main process & preload script
│   ├── services/       # Core services (rotator, win_control, win_screen_guard, etc.)
│   ├── tools/          # Free web tools (weather, wikipedia, news, search, etc.)
│   └── ui/             # Glassmorphic HTML/CSS/JS interface
├── test/               # Unit tests
├── build.bat           # Windows build script
├── start-brain.bat     # App launcher script
└── package.json
```

## 📄 License

Private project - All rights reserved