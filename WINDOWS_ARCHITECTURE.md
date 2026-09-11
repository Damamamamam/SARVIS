# SARVIS Windows Architecture (WinUI 3)

## Architecture Overview

**Brain**: Node.js/TypeScript (existing, unchanged)
- Runs on localhost:9741
- All existing features preserved
- WebSocket server implementation
- API rotator, device control logic, etc.

**Windows App**: WinUI 3 (C#/.NET)
- Modern native Windows UI
- Connects to brain via WebSocket (ws://localhost:9741)
- Provides Windows-specific implementations of Windows services

## Component Mapping

| Windows Service | Windows Equivalent |
|----------------|-------------------|
| AudioCaptureService | NAudio library for audio capture |
| CameraTrackerService | MediaFoundation for camera capture |
| VoiceIo (STT/TTS) | Azure Speech Services or Windows Speech API |
| DeviceControlService | Windows UI Automation API |
| AccessibilityService | Windows UI Automation (advanced automation) |
| ApiKeyStore | Windows DPAPI (Data Protection API) |
| MainActivity | WinUI 3 MainWindow |

## Technology Stack

**Windows App:**
- .NET 6+ 
- WinUI 3
- NAudio (audio capture)
- MediaFoundation (camera capture)
- Windows Speech API (STT/TTS)
- Windows UI Automation (desktop automation)
- DPAPI (secure storage)
- WebSocket.Client (brain communication)

**Brain (unchanged):**
- Node.js 18+
- TypeScript
- WebSocket server
- All existing services

## Implementation Plan

1. **Project Structure**: Create .NET WinUI 3 project
2. **Audio Capture**: Implement using NAudio
3. **Camera Capture**: Implement using MediaFoundation
4. **STT/TTS**: Implement using Windows Speech API
5. **Automation**: Implement using Windows UI Automation
6. **Secure Storage**: Implement using DPAPI
7. **UI**: Create WinUI 3 interface
8. **WebSocket**: Connect to existing brain
9. **Testing**: Verify functionality

## Advantages

- Keep all existing brain intelligence
- Modern native Windows UI
- Full desktop automation capabilities
- No need to rewrite core logic
- Windows-specific optimizations