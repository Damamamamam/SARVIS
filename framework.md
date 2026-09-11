# SARVIS Framework

## Overview

SARVIS is a comprehensive AI assistant framework designed for Windows desktop environments. It provides a modular architecture for building intelligent voice-controlled applications with advanced automation capabilities.

## Core Components

### 1. Brain (Node.js/TypeScript)
- **Location**: `src/`
- **Purpose**: Central intelligence and orchestration
- **Features**:
  - 8-key API rotator for LLM failover
  - Intent routing and conversation management
  - Device control orchestration
  - Screen time monitoring
  - Vision processing hooks
  - Free web tools integration

### 2. Windows Client (.NET 8.0)
- **Location**: `windows/JarvisWindows/`
- **Purpose**: Windows-specific implementations
- **Features**:
  - Audio capture via NAudio
  - Voice I/O via Windows Speech API
  - Window automation via Windows API
  - Secure storage via DPAPI
  - WebSocket client for brain communication

### 3. Communication Protocol
- **Protocol**: WebSocket (ws://localhost:9741)
- **Format**: JSON envelopes with module-based routing
- **Modules**: `audio`, `vision`, `screen`, `device`, `voice`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Windows Client                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Audio Capture│  │ Voice I/O    │  │ Window Auto  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                      │ WebSocket Client                │
└──────────────────────┼──────────────────────────────────┘
                       │ ws://localhost:9741
┌──────────────────────┼──────────────────────────────────┐
│                      │         Brain (Node.js)          │
│                      │  ┌──────────────────────────────┐ │
│                      │  │  API Rotator (8-key failover)│ │
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

The framework supports failover across 8 different API providers:

1. Gemini
2. Groq
3. OpenRouter
4. Cerebras
5. Mistral
6. Together
7. Cohere
8. DeepSeek

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
```

## Quick Start

### Start the Brain
```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain"
npm run build
npm run start:server
```

### Start the Windows Client
```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain\windows\JarvisWindows"
$env:PATH = "C:\Users\give it back\AppData\Local\Microsoft\dotnet;$env:PATH"
dotnet run
```

## Extension Points

### Adding New LLM Providers
1. Add environment variable to `.env.example`
2. Update `src/config/load_keys.ts`
3. Add provider configuration to API rotator

### Adding New Windows Features
1. Implement service in `windows/JarvisWindows/`
2. Add WebSocket message handling in `Program.cs`
3. Update protocol mapping in `src/protocol/client_payload.ts`

### Adding New Brain Services
1. Create service in `src/services/`
2. Integrate in `src/agent/brain.ts`
3. Add unit tests in `test/`

## Security Features

- **Secure Storage**: Windows DPAPI for sensitive data
- **API Key Management**: Environment-based, never hardcoded
- **WebSocket Security**: Localhost binding by default
- **Kill Switch**: Immediate audio capture termination
- **Degraded Mode**: Functions without API keys (limited)

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

## Troubleshooting

### Brain Not Starting
- Check Node.js version (18+)
- Verify port 9741 is available
- Check environment variable syntax

### Windows Client Issues
- Verify .NET SDK installation
- Check microphone permissions
- Ensure Windows Speech API is available

### API Failover Issues
- Verify API key format
- Check network connectivity
- Review provider-specific rate limits

## Future Enhancements

- Camera integration for vision features
- Enhanced GUI with WinUI 3
- System tray integration
- Advanced gesture recognition
- Multi-language support
- Plugin system for extensions

## License

Private project - All rights reserved