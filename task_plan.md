# Task Plan: JARVIS brain glue + shippable APK

## Goal
Make the JARVIS Android app buildable and able to talk to a real brain WebSocket server on port 9741, with aligned protocol, env/Keystore keys, and STT/TTS — without taking Antigravity’s native command/vision/FGS work.

## Next Step
Add protocol mapper, brain WS server, Gradle wrapper, and Android glue (host URL, ACK, Keystore, voice I/O).

## Current Phase
Phase 3

## Phases

### Phase 1: Requirements & Discovery
- [x] Split of work confirmed (Cursor vs Antigravity)
- [x] Identified missing wrapper, WS server, payload mismatch, localhost-vs-LAN
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Canonical wire format: flat Android payload + aliases for TS field names
- [x] Brain is WS **server**; phone is WS **client**
- **Status:** complete

### Phase 3: Implementation
- [x] Gradle wrapper + coroutines so `assembleDebug` works
- [x] `toAndroidDevicePayload` + Kotlin aliases + ACK `success`
- [x] `src/server` binds `:9741`, routes events, speaks replies
- [ ] Configurable brain host, SecureStore, STT/TTS (Antigravity)
- **Status:** complete (Cursor), pending (Antigravity)

### Phase 4: Testing & Verification
- [ ] `npm test` still passes
- [ ] `assembleDebug` produces an APK (or document why the SDK/JDK blocked it)
- **Status:** pending

## Decisions Made
- Map payloads in the **server transport**, not in DeviceControlService unit tests.
- Bind `0.0.0.0:9741` by default so a physical phone can reach a PC; override with `JARVIS_BIND=127.0.0.1` for on-device-only.
- Default emulator host `10.0.2.2:9741` (not `localhost` on the phone).

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| | | |
