# SARVIS Windows Desktop Assistant

SARVIS is a Windows desktop assistant with a Node.js/TypeScript brain and .NET 8.0 client, featuring an 8-key API rotator, speech/voice interactions, Windows system automation, and screen-time monitoring.

## 🏗️ Architecture

- **Windows Client (.NET 8.0)**: Console application with audio capture, voice I/O, window automation, and secure storage.
- **Brain (Node.js/TypeScript)**: WebSocket server handling intent routing, API rotator, device control, and personalization.
- **8-Key API Rotator**: Failover across Gemini, Groq, OpenRouter, Cerebras, Mistral, Together, Cohere, and DeepSeek.
- **Windows Automation**: Window control via Windows API (minimize, maximize, type text).
- **Screen Time Monitoring**: Active window tracking and doomscroll guard.

## 📋 Prerequisites

- Windows 10/11
- Node.js 18+
- .NET 8.0 SDK (pre-installed at `C:\Users\give it back\AppData\Local\Microsoft\dotnet\`)

## 🚀 Quick Start

### 1. Start Desktop Application (GUI with Setup Wizard)

```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain"
npm run build
npm run gui
```

> **First-Time Setup**: On initial launch, SARVIS presents a setup wizard asking for your API keys. A **Google Gemini API Key is required**; the other 7 provider keys are optional. Keys can be reconfigured at any time via the **Settings > API Keys** tab.

### 2. Alternative: Headless Server Mode

```powershell
npm run start:server
```

The brain starts a standalone WebSocket server on `ws://localhost:9741`.

### 3. Windows Native Client (.NET)

```powershell
cd "windows\JarvisWindows"
$env:PATH = "C:\Users\give it back\AppData\Local\Microsoft\dotnet;$env:PATH"
dotnet run
```

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
│   ├── electron/        # Electron main process & IPC bridge
│   ├── server/          # WebSocket server and bridge
│   ├── services/        # Core services (rotator, device_control, audio_recorder, etc.)
│   ├── tools/           # Free web tools (weather, wikipedia, news, search, etc.)
│   └── ui/              # Desktop GUI (HTML5, CSS3 glassmorphism, vanilla JS)
├── windows/
│   └── JarvisWindows/   # .NET Windows client
│       ├── BrainClient.cs      # WebSocket client
│       ├── AudioCapture.cs     # NAudio capture
│       ├── VoiceServices.cs    # Windows Speech API
│       ├── WindowAutomation.cs  # Windows API automation
│       ├── SecureStorage.cs    # DPAPI encryption
│       └── Program.cs          # Main application
├── test/                # Unit tests
└── package.json
```

## 🖥️ Windows Client Commands

- **q** - Quit the application
- **s** - Speak text (interactive TTS)
- **h** - Show help
- **[any text]** - Send text to brain for processing

## 📄 License

Private project - All rights reserved