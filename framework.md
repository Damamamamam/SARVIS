# SARVIS Framework

## Overview

SARVIS is a personal computer agent framework with a minimalist browser client and a lightweight desktop shell. It provides a modular architecture for intelligent chat/voice applications with automation capabilities and a Node.js/TypeScript backend.

## Core Components

### 1. Brain (Node.js/TypeScript)
- **Location**: `src/`
- **Purpose**: Central intelligence and orchestration
- **Features**:
  - Unlimited API-key rotator for LLM failover
  - Intent routing and conversation management
  - Device control orchestration
  - Screen time monitoring
  - Vision processing hooks
  - Free web tools integration

### 2. Clients (Browser + Desktop + Node server)
- **Location**: `src/ui/` + `src/server/webapp.ts`
- **Purpose**: Chat/voice frontend served over HTTP
- **Features**:
  - Chat UI with typing indicator and send resilience
  - Voice converse mode (single utterance + hands-free loop)
  - Spoken replies via SpeechSynthesis with on/off toggle
  - Live replies and screen-time nudges over WebSocket (`/ws`)
  - Unlimited dynamic API-key vault backed by `/api/keys`
  - Works in any modern browser — no install needed
  - Electron desktop shell via `npm run start:app`

### 3. Communication Protocol
- **Web UI**: HTTP JSON API (`/api/hear`, `/api/status`, `/api/keys`, `/api/command`) + WebSocket (`/ws`) on port 9742
- **Headless bridge**: WebSocket (`ws://localhost:9741`) with JSON envelopes and module-based routing
- **Modules**: `audio`, `vision`, `screen`, `device`, `voice`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (any device)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Chat UI      │  │ Voice converse│  │ Settings    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│              HTTP /api/*  +  WS /ws (live)              │
└──────────────────────┼──────────────────────────────────┘
                       │
┌──────────────────────┼──────────────────────────────────┐
│                      │         Brain (Node.js)          │
│                      │  ┌──────────────────────────────┐ │
│                      │  │ API Rotator (unlimited keys) │ │
│                      │  └──────────────────────────────┘ │
│                      │  ┌──────────────────────────────┐ │
│                      │  │  Agent Brain (orchestration) │ │
│                      │  └──────────────────────────────┘ │
│                      │  ┌──────────────────────────────┐ │
│                      │  │  Device Control Service      │ │
│                      │  └──────────────────────────────┘ │
│                      │  ┌──────────────────────────────┐ │
│                      │  │  Audio Recorder               │ │
│                      │  └──────────────────────────────┘ │
│                      │  ┌──────────────────────────────┐ │
│                      │  │  Vision Tracker               │ │
│                      │  └──────────────────────────────┘ │
│                      │  ┌──────────────────────────────┐ │
│                      │  │  Screen Guard                 │ │
│                      │  └──────────────────────────────┘ │
└──────────────────────┴──────────────────────────────────┘
```

## Supported LLM Providers

The framework supports failover across built-in providers and any number of custom OpenAI-compatible connections:

1. Gemini
2. Groq
3. OpenRouter
4. Cerebras
5. Mistral
6. Together
7. Cohere
8. DeepSeek
9. OpenCode Zen (Nemotron 3 Ultra Free)
10. Any custom endpoint and any number of additional keys

## Environment Configuration

```bash
SARVIS_GEMINI_API_KEY=your-key
SARVIS_GROQ_API_KEY=your-key
SARVIS_OPENROUTER_API_KEY=your-key
SARVIS_CEREBRAS_API_KEY=your-key
SARVIS_MISTRAL_API_KEY=your-key
SARVIS_TOGETHER_API_KEY=your-key
SARVIS_COHERE_API_KEY=your-key
SARVIS_DEEPSEEK_API_KEY=your-key
SARVIS_OPENCODE_ZEN_API_KEY=your-key
```

## Quick Start

### Start the Web App
```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain"
npm run build
npm start
# open http://localhost:9742
```

### Start the Headless Bridge (no UI)
```powershell
npm run start:server
```

## Extension Points

### Adding New LLM Providers
1. Add environment variable to `.env.example`
2. Update `src/config/load_keys.ts`
3. Add provider configuration to API rotator
4. Add the key field to `src/ui/index.html` + `src/ui/app.js` key lists

### Adding New Brain Services
1. Create service in `src/services/`
2. Integrate in `src/agent/brain.ts`
3. Add unit tests in `test/`

### Adding New Web API Endpoints
1. Add the route in `src/server/webapp.ts`
2. Add the matching `api*` helper in `src/ui/app.js`

## Security Features

- **API Key Management**: Environment-based, never hardcoded; web settings never leak secrets back to the browser
- **Localhost Binding**: WebSocket/HTTP bind locally by default
- **Kill Switch**: Immediate audio capture termination
- **Degraded Mode**: Functions without API keys (reminders, time/date work offline)

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:rotator
npm run test:device
npm run test:audio
npm run test:vision
```

## Performance Considerations

- **Audio**: 16kHz mono PCM for optimal performance
- **Memory**: Rolling buffer with configurable window size
- **Network**: WebSocket with exponential backoff reconnection
- **Processing**: Asynchronous non-blocking operations
- **UI**: Throttled status polling (5s); WebSocket preferred over polling for chat

## Troubleshooting

### Web App Not Starting
- Check Node.js version (18+)
- Verify port 9742 is available (`SARVIS_PORT` overrides)
- Run `npm run build` first so `dist/` is fresh

### Chat Send Failures
- Check the browser console and the in-chat error message
- Verify the server is reachable at `/api/health`
- The UI retries WebSocket with backoff and falls back to REST automatically

### API Failover Issues
- Verify API key format
- Check network connectivity
- Review provider-specific rate limits

## Future Enhancements

- Camera integration for vision features
- Plugin system for extensions
- Advanced gesture recognition
- Multi-language support
- Mobile companion app

## License

Private project - All rights reserved
