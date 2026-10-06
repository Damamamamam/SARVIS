# SARVIS Windows Architecture (WPF)

## Architecture Overview

**Brain**: Node.js/TypeScript (existing, unchanged)
- Runs on localhost:9741
- All existing features preserved
- WebSocket server implementation
- API rotator, device control logic, etc.

**Windows App**: WPF (C#/.NET)
- Modern dark-themed GUI with real-time status
- Connects to brain via WebSocket (ws://localhost:9741)
- Provides Windows-specific implementations

## Component Mapping

| Windows Service | Windows Equivalent |
|----------------|-------------------|
| AudioCaptureService | NAudio library for audio capture |
| VoiceIo (STT/TTS) | Windows Speech API |
| DeviceControlService | Windows UI Automation API |
| ApiKeyStore | Windows DPAPI (Data Protection API) |
| MainWindow | WPF MainWindow with chat interface |

## Technology Stack

**Windows App:**
- .NET 10.0-windows
- WPF (Windows Presentation Foundation)
- NAudio (audio capture)
- Windows Speech API (STT/TTS)
- Windows UI Automation (desktop automation)
- DPAPI (secure storage)
- WebSocket.Client (brain communication)

**Brain (unchanged):**
- Node.js 18+
- TypeScript
- WebSocket server
- All existing services

## Implementation Status

1. **✅ Project Structure**: Created .NET WPF project
2. **✅ Audio Capture**: Implemented using NAudio
3. **✅ STT/TTS**: Implemented using Windows Speech API
4. **✅ Automation**: Implemented using Windows UI Automation
5. **✅ Secure Storage**: Implemented using DPAPI
6. **✅ UI**: Created WPF interface with dark theme
7. **✅ WebSocket**: Connected to existing brain
8. **✅ Testing**: Verified basic functionality

## Advantages

- Keep all existing brain intelligence
- Modern WPF GUI with real-time status
- Full desktop automation capabilities
- No need to rewrite core logic
- Windows-specific optimizations