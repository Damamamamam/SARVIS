# SARVIS Web Assistant

SARVIS is a web-app AI assistant with a Node.js/TypeScript brain, featuring a 9-key API rotator, chat + voice converse mode, system automation, and screen-time monitoring. It runs entirely in the browser — no desktop build needed.

## 🏗️ Architecture

- **Web App**: Browser chat UI (HTML5, CSS3 glassmorphism, vanilla JS) served by the Node server, with live WebSocket replies and screen-time nudges.
- **Brain (Node.js/TypeScript)**: HTTP + WebSocket server handling intent routing, API rotator, device control, and personalization.
- **9-Key API Rotator**: Failover across Gemini, Groq, OpenRouter, Cerebras, Mistral, Together, Cohere, DeepSeek, and OpenCode Zen.
- **Voice Converse Mode**: Mic click = single utterance, double-click = hands-free loop (listen → spoken reply → listen…), with 🔊/🔇 reply toggle and 🎙 status badge.
- **Screen Time Monitoring**: Active window tracking and doomscroll guard with live nudges.

## 📋 Prerequisites

- Node.js 18+

## 🚀 Quick Start

```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain"
npm run build
npm start
```

Then open `http://localhost:9742` in any browser (or just run `start-sarvis.bat`, which builds, starts the server, and opens the browser for you).

> **First-Time Setup**: On first launch with no usable API keys configured, SARVIS shows a setup wizard. Any one of the 9 provider keys is enough to enable the LLM path; keys can be reconfigured at any time via the **API Keys** tab. Values copied from `.env.example` are ignored until replaced with real keys.

Set `SARVIS_PORT` / `SARVIS_BIND` env vars to change host/port. The default bind is `127.0.0.1` because the settings endpoint accepts API keys; use `SARVIS_BIND=0.0.0.0` only on a trusted network.

### Alternative: Headless Bridge Mode

```powershell
npm run start:server
```

The brain starts a standalone WebSocket bridge on `ws://localhost:9741` (no UI).

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
│   ├── config/          # Environment key loader & config
│   ├── server/          # Web app server (HTTP + WebSocket) and headless bridge
│   ├── services/        # Core services (rotator, device_control, audio_recorder, etc.)
│   ├── tools/           # Free web tools (weather, wikipedia, news, search, etc.)
│   └── ui/              # Web app frontend (HTML5, CSS3 glassmorphism, vanilla JS)
├── test/                # Unit tests
└── package.json
```

## 📄 License

Private project - All rights reserved
