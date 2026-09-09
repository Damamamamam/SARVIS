# JARVIS Build Checklist & Execution Matrix

## Tool Delegation Roles
* **Google Antigravity (Free Tier)**: System architectural blueprints, multi-space permission state machines, and API failover schemas. Artifacts saved in `docs/architecture.md`.
* **OpenCode CLI**: File initialization, dependency installation, running unit tests, and executing local shell commands.
* **OpenWork Orchestrator**: Creating core application code, module wiring, and managing `TASKS.md`.

---

## Progress Roadmap

### Phase 0: Workspace Setup & Config Fix (Assigned to: OpenWork / CLI)
- [x] `opencode.jsonc` permission fix applied (model + permission allow) at `~/.config/opencode/opencode.jsonc`.
- [x] Workspace folder tree initialized (`docs/`, `src/services/`, `src/tools/`, `test/`).

### Phase 1: Architectural Blueprint (Assigned to: Google Antigravity)
- [x] Full system design saved in `docs/architecture.md` (320 lines: diagrams, state machines, security model).
- [x] 8-Key API Rotator rate-limit handling & failover state machine documented (§4.1).
- [x] Dual-Space Android Accessibility & `UsageStatsManager` tracking logic designed (§4.2 / §6).

### Phase 2: Core Engineering (Assigned to: OpenWork & OpenCode CLI)
- [x] `src/services/api_rotator.ts` — 8-key API failover manager (Gemini, Groq, OpenRouter, Cerebras, Mistral, Together, Cohere, DeepSeek).
- [x] `src/services/device_control.ts` — command-dispatch layer + WebSocket protocol for Android Accessibility bridge.
- [x] `src/services/agent_brain.ts` — central orchestration loop connecting vision, audio, controls, screen guard, and API rotator.
- [x] `src/services/audio_recorder.ts` — ambient continuous audio streaming with kill-switch state machine.
- [x] `src/services/vision_tracker.ts` — front-camera lip movement / user talking state verification engine.
- [x] `src/services/screen_guard.ts` — doomscroll guard controller (TS-side; mirrors `doomscroll_guard.kt` protocol for both Android Spaces).
- [x] `src/tools/free_tools.ts` — 9 free web tool connectors (weather, wikipedia, news, places, ddg, books, geo, quotes, dictionary).
- [x] `src/agent/brain.ts` — composition root wiring vision + audio + controls + screen guard + API rotator.
- [x] `android/doomscroll_guard.kt` — Native Kotlin AccessibilityService/UsageStatsManager (deferred to Android build phase; protocol defined in `screen_guard.ts`).

### Phase 3: Verification & Test Runs (Assigned to: OpenCode CLI)
- [x] `test/api_rotator.test.ts` — 429 failover simulation (existing).
- [x] `test/device_control.test.ts` — queue ordering, toggle tracking, retry→DEAD, timeout.
- [x] `test/audio_recorder.test.ts` — rolling buffer, kill-switch hard-stop, re-arm security.
- [x] `test/vision_tracker.test.ts` — TalkState classification, threshold edge cases.
- [x] `test/screen_guard.test.ts` — threshold crossing, single-fire nudge, snooze/reset.
- [x] `test/brain.test.ts` — JarvisBrain composition root integration.
- [x] `test/android_payload.test.ts` — Android protocol mapping tests.
- [x] `npm run build` — clean TypeScript compile (37 tests, 0 failures).
- [x] `npm test` — all suites pass.

---

### Phase 4: Antigravity Android Native Features (Assigned to: Antigravity)
- [x] **STT Integration** — Native Android SpeechRecognizer with microphone contention handling
- [x] **TTS Integration** — Android TTS engine with error handling and initialization
- [x] **Permission UI** — Comprehensive PermissionActivity with guided flow
- [x] **Settings UI** — Complete SettingsActivity with connection presets and testing
- [x] **Configuration Persistence** — Extended BrainPrefs with comprehensive configuration management
- [x] **WebSocket Message Routing** — Voice I/O integration in JarvisApp
- [x] **Error Handling** — Comprehensive error handling in voice services
- [x] **Microphone Contention** — AudioCaptureService coordination for STT
- [x] **Keystore Integration** — AES-GCM secure storage for API keys implemented
- [x] **MediaPipe Vision** — Face landmarks and talk state detection implemented
- [x] **Production Integration** — Build system modernized and MainActivity wired for service orchestration

---

## Phase 4: Google Antigravity Collaboration Prompt

The Android-native Kotlin layer (AccessibilityService, UsageStatsManager, MediaRecorder,
CameraX) is owned by **Google Antigravity (Free Tier)**. Paste the prompt below into
Antigravity to generate the `android/` module that speaks the WebSocket protocol defined
in `docs/architecture.md §3` and the TS controllers in this repo.

```text
You are building the Android native layer for JARVIS, a personal phone assistant.
The TypeScript "brain" runs on-device and communicates over a LOCAL WebSocket
(ws://127.0.0.1:9741) using the JSON envelope defined in docs/architecture.md §3.

Generate a Kotlin Android module (minSdk 33) containing:

1. JarvisAccessibilityService — an AccessibilityService that:
   - Tracks the foreground app via UsageStatsManager and reports package + label
     to the brain as {type:"event", module:"screen", payload:{pkg,label,durationMs}}.
   - Executes device commands received over the bridge: launchApp, closeApp,
     tap(x,y), swipe, inputText, toggle(wifi|bluetooth|flashlight|dnd|...),
     dial, sendSms, answerCall, rejectCall.
   - Operates identically in BOTH the 1st (personal) and 2nd (work) Android Spaces
     — design the permission/state machine so it re-binds on Space switch.

2. DoomscrollGuard — consumes foreground-app events and, when a flagged social app
   (Instagram, TikTok, Snapchat, YouTube, etc.) exceeds a daily threshold, triggers
   a live voice/toast warning. Mirror the state machine in src/services/screen_guard.ts.

3. AmbientAudioRecorder — MediaRecorder pipeline feeding 5s PCM chunks to the brain,
   with a hard Kill-Switch that zeroes buffers and releases the mic (see audio_recorder.ts).

4. VisionTracker — CameraX front-camera frames to MediaPipe FaceMesh; emit TalkState
   (TALKING_TO_JARVIS | ROOM_CONVERSATION | NO_FACE) using the MAR + gaze logic in
   src/services/vision_tracker.ts (thresholds: mouthOpenRatio 0.3, gaze 30°, delta 0.05).

Deliver production-quality Kotlin with clear separation between the bridge (WS client),
the services, and the local state machines. No hardcoded API keys — load from Keystore.
```

---

## How To Run

```bash
npm run build            # tsc -> dist/
npm test                 # all suites (rotator, device, audio, vision, screen, brain)
npm run test:rotator     # 8-key failover simulation
npm run test:device      # device command queue
npm run test:audio       # audio kill-switch
npm run test:vision      # talk-state classification
```
