# SARVIS Web Assistant

SARVIS is a personal computer agent with a Node.js/TypeScript brain, a minimalist web client, and a lightweight desktop app. It supports chat, voice input, system automation, screen-time monitoring, and an unlimited local vault of API keys.

## First-run awareness and profile

On first boot SARVIS opens a setup conversation. The user explicitly chooses whether SARVIS may inventory app metadata and file metadata. The scan records app names, running process names, folder/file counts, and extensions in common workspace folders, but never reads document contents, browser history, messages, passwords, or API keys. A short personality quiz proposes a working profile for the user to review and correct before it is saved locally in `.sarvis-profile.json`.

The **Profile & models** view can rerun setup, refresh the metadata snapshot, and choose separate models for the reasoning brain and voice input. Preferences are stored locally in `.sarvis-settings.json`; `browser-native` voice input remains the private, immediately available option.

## 🏗️ Architecture

- **Web App**: Browser chat UI (HTML5, CSS3 glassmorphism, vanilla JS) served by the Node server, with live WebSocket replies and screen-time nudges.
- **Brain (Node.js/TypeScript)**: HTTP + WebSocket server handling intent routing, API rotator, device control, and personalization.
- **Unlimited API-key Rotator**: Failover across built-in providers plus any number of custom OpenAI-compatible endpoints and keys.
- **Desktop app**: `npm run start:app` launches the same UI and brain in a local Electron shell on port `9743`.
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

For the desktop app:

```powershell
npm run start:app
```

The desktop shell starts its private local brain on `http://127.0.0.1:9743`. The browser and desktop clients share the same agent behavior and local key vault.

On Windows, `SARVIS App.lnk` on the Desktop launches the same app without leaving a terminal window open.

> **First-Time Setup**: On first launch SARVIS opens a consentful awareness and personality setup. API keys are optional for local mode; add any provider or OpenAI-compatible endpoint from the **API keys** tab, then add unlimited additional keys. Values copied from `.env.example` are ignored until replaced with real keys.

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
