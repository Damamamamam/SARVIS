# SARVIS Windows Application Setup

## Overview

SARVIS is now a Windows desktop application that connects to a Node.js/TypeScript brain via WebSocket. The Windows client provides audio capture, voice I/O, window automation, and secure storage while the brain handles LLM processing, intent routing, and intelligent orchestration.

## Architecture

**Brain**: Node.js/TypeScript (runs on localhost:9741)
- WebSocket server
- API rotator with 8-key failover
- Intent routing and conversation management
- Device control orchestration
- Screen time monitoring
- Vision processing

**Windows Client**: .NET 8.0 C# Console Application
- Audio capture via NAudio
- Voice I/O via Windows Speech API
- Window automation via Windows API
- Secure storage via DPAPI
- WebSocket client to brain

## Prerequisites

### 1. Install .NET SDK
The installation script has already been run. .NET 10.0.401 is installed at:
`C:\Users\give it back\AppData\Local\Microsoft\dotnet\`

### 2. Node.js
Ensure Node.js 18+ is installed for the brain.

## Setup Instructions

### 1. Start the Brain

```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain"
npm run build
npm run start:server
```

The brain will start on `ws://localhost:9741`. With no API keys configured, it runs in degraded mode but the WebSocket server remains functional.

### 2. Start the Windows Client

```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain\windows\JarvisWindows"
$env:PATH = "C:\Users\give it back\AppData\Local\Microsoft\dotnet;$env:PATH"
dotnet run
```

### 3. Configure API Keys (Optional)

To enable full LLM intelligence, configure API keys in the environment:

```powershell
$env:SARVIS_GEMINI_API_KEY="your-key"
$env:SARVIS_GROQ_API_KEY="your-key"
# ... up to 8 providers
```

Then restart the brain with:
```powershell
npm run start:server
```

## Windows Client Features

### Voice Commands
- **q** - Quit the application
- **s** - Speak text (interactive TTS)
- **h** - Show help
- **[any text]** - Send text to brain for processing

### Audio Capture
- Continuous microphone capture at 16kHz, mono
- PCM data sent to brain for ambient listening
- Automatically pauses/resumes during TTS

### Window Automation
- **minimize** - Minimize active window
- **maximize** - Maximize active window
- **type** - Type text into active window

### Secure Storage
- API keys and sensitive data stored using Windows DPAPI
- Registry-based encrypted storage
- Protected under current user context

## Building the Windows Client

```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain\windows\JarvisWindows"
$env:PATH = "C:\Users\give it back\AppData\Local\Microsoft\dotnet;$env:PATH"
dotnet build
```

The compiled executable will be at:
`windows\JarvisWindows\bin\Debug\net8.0\JarvisWindows.exe`

## Troubleshooting

### .NET Not Found
If you get "dotnet not found", add it to your PATH:
```powershell
$env:PATH = "C:\Users\give it back\AppData\Local\Microsoft\dotnet;$env:PATH"
```

### Brain Not Connecting
Ensure the brain is running:
```powershell
cd "C:\Users\give it back\OneDrive\Desktop\NVMUN\brain"
npm run start:server
```

Check that it shows "SARVIS brain listening on ws://0.0.0.0:9741"

### Audio Capture Issues
- Ensure microphone permissions are granted
- Check that no other application is using the microphone
- The client uses NAudio which requires WASAPI

### TTS Issues
- Windows Speech API (SAPI) is used via COM
- Ensure Windows audio services are running
- Check system audio output settings

## Project Structure

```
brain/
├── src/                 # Node.js brain source
├── windows/
│   └── JarvisWindows/  # .NET Windows client
│       ├── BrainClient.cs      # WebSocket client
│       ├── AudioCapture.cs     # NAudio capture
│       ├── VoiceServices.cs    # Windows Speech API
│       ├── WindowAutomation.cs  # Windows API automation
│       ├── SecureStorage.cs    # DPAPI encryption
│       └── Program.cs          # Main application
```

## Architecture Details

The Windows client connects to the brain via WebSocket, handling platform-specific operations while the brain provides intelligent orchestration. Key architectural components:

1. **Platform**: Windows desktop with native API integration
2. **Build**: .NET CLI with cross-platform support
3. **Audio**: NAudio for high-performance audio capture
4. **Speech**: Windows Speech API for STT/TTS functionality
5. **Automation**: Windows API for system control
6. **Storage**: DPAPI for secure credential management

The brain architecture provides consistent intelligence across different client implementations.

## Next Steps

1. **Enhanced Automation**: Add more Windows automation capabilities (keyboard shortcuts, mouse control, app launching)
2. **Camera Integration**: Add MediaPipe face tracking for vision features
3. **GUI**: Consider adding a WinUI 3 GUI instead of console interface
4. **System Tray**: Add system tray integration for background operation
5. **Settings UI**: Create a proper settings interface for configuration