# SARVIS Progress Log

## 2026-10-09
- Started completion pass requested by user.
- Loaded Computer Use and planning-with-files instructions.
- Confirmed GitHub remote.
- Found `obsidian-vault` in the repo.
- Created persistent planning files for the delivery push.
- Read vault status; current milestone is camera integration and GUI enhancements.
- Ran `npm test`; all 41 TypeScript tests passed.
- Started Windows build verification; first failure was missing `System.Management` package reference.
- Fixed System.Management package reference in project file.
- Build now succeeds for both TypeScript and Windows client.
- **Enhanced GUI**: Added real-time audio waveform visualization with Canvas-based rendering.
- **Enhanced Security**: Added API key validation in settings window with format checking.
- **Enhanced Reliability**: Implemented comprehensive error logging system (ErrorLogger.cs) with file persistence.
- **Enhanced Reliability**: Added crash recovery service (CrashRecovery.cs) with automatic retry logic.
- Integrated error logging into all major components (BrainClient, VoiceServices, AudioCapture, CameraVision).
- Added global exception handlers for AppDomain and Dispatcher.
- Updated Obsidian vault with current completion status.
- Build verification: ✅ All tests passing, ✅ Windows build successful.
- Created complete startup script (start-sarvis.bat) to launch both Brain server and Windows client.
- Created stop script (stop-sarvis.bat) to gracefully shutdown all components.
- Created desktop shortcut (SARVIS.lnk) for one-click startup.
- **Updated startup to be silent**: No terminal windows shown, only the app opens.

## 2026-10-09 (redirect: stability + web app)
- User reported WPF client unstable/cracky, typing/sending blocked; requested jarvis-mcp-style voice features and a web app instead of a Windows-only app.
- **WPF stability**: moved subsystem startup off the UI thread (type immediately), throttled mic-level/waveform UI updates (120/150ms, max ~50 bars), fixed overlapping waveform/mic-bar grid rows, made audio streaming send-safe (no UI work, offline queue cap), added send feedback (queued/offline notice, focus restore, Shift+Enter handling).
- **New web app server** (`src/server/webapp.ts`, `npm run start:web`, default http://localhost:9742): serves the chat UI over HTTP plus JSON API (/api/health, /status, /hear, /keys, /command, /active-window) and live WebSocket (/ws) for replies + screen-time nudges.
- **Web UI dual transport** (`src/ui/app.js`): uses Electron IPC when present, else fetch + WebSocket with reconnect backoff; sending never silently fails (typing indicator, error messages, send locking, offline queue notice).
- **Voice features (jarvis-mcp style)**: mic click = single utterance, double-click = hands-free converse loop (listen → reply aloud → listen…), 🔊/🔇 spoken-reply toggle (persisted), 🎙 voice-status badge (listening/thinking/speaking/conversing), live nudge messages.
- **Offline brain**: `hear()` without keys now honors local paths (reminders, time/date); `APIRotatorService.complete()` returns degraded instead of throwing with zero keys.
- **Provider consistency**: the former 9-key limit was later replaced by an unlimited custom-key vault.
- Verify: ✅ `npm test` 41/41, ✅ `npm run build`, ✅ `dotnet build` 0 warnings/errors, ✅ web smoke test (health, UI, /api/hear reminder without keys, WS reply).

## 2026-10-09 (web-only: GUI apps removed)
- User asked to remove the GUI app so SARVIS just opens as a web app.
- Deleted `src/electron/` (main + preload), entire `windows/JarvisWindows/` WPF client, `WINDOWS_SETUP.md`, `WINDOWS_ARCHITECTURE.md`, `debug_electron.log`.
- `npm start` now launches the web app directly (`dist/src/server/webapp.js`); removed `gui`/`start:gui` scripts and the `electron` devDependency.
- Rewrote `start-sarvis.bat` (build → start server → open browser), `stop-sarvis.bat`, `build.bat`, `start-brain.bat/.sh`, `build.sh` for web-only.
- Rewrote `README.md` and `framework.md` as web-only (no .NET/Electron prerequisites).
- Verify: ✅ `npm test` 41/41, ✅ `npm run build`, ✅ web smoke test (health + UI served).

## 2026-10-09 (keys present but stuck in degraded mode)
- Root cause 1: no code ever loaded `.env` into `process.env` — the brain always started with 0 providers. Added `loadDotEnvFile()` in `src/config/load_keys.ts`, called at startup in both servers; startup now logs configured providers and warns on malformed keys.
- Root cause 2: Gemini model `gemini-2.5-flash` returns 404 for this credential ("no longer available"); probed the models list and switched to `gemini-3-flash-preview` (verified 200 with real reply).
- Degraded replies now include the actual provider error (truncated) so failures are diagnosable from chat.
- Verify: ✅ 41/41 tests, ✅ live `/api/hear` returns real LLM reply (`OK`, degraded:false).
- Open: OpenCode Zen `oc_sk_…` key is rejected by the NVIDIA endpoint (expects JWT `nvapi-…`); correct endpoint for that key type still unknown — asked user where the key is from.

## 2026-10-11 (provider detection and live browser pass)
- Confirmed with Computer Use that Chrome can load the local SARVIS app at `http://localhost:9742`.
- Confirmed with browser automation that the UI loads as SARVIS Web Assistant and creates a reminder end-to-end.
- Confirmed `.env` contains usable Gemini and OpenCode entries without printing secret values.
- Fixed duplicate rotator ownership so health/status reflects the rotator that actually serves chat requests.
- Placeholder API-key values are now ignored instead of being reported as configured.
- Updated Gemini to `gemini-3.1-flash-lite`; the configured key returned a live completion during provider verification.
- Updated OpenCode Zen to its current OpenAI-compatible endpoint and model identifier.
- Added transient Gemini 503 retry, 512-token request budget, AQ-key validation, safe localhost default, setup wizard support for any provider, and HTML escaping.
- Updated Obsidian project status for the web-only product and documented OpenCode free-tier external-call limitations.
- Verification: `npm test` 43/43, `npm run build`, live `/api/health`, `/api/keys`, `/api/status`, `/api/hear`, browser UI, and reminder flow.

## 2026-10-12 (agentic computer-control pass)
- User reported that SARVIS responds once but is not a real agentic computer assistant.
- Confirmed the server was alive with both providers configured; found that natural-language chat had no connection to Windows control or file operations.
- Added a new bounded computer-agent phase: ordered plans, app/URL opening, foreground typing, workspace file creation/opening, and safe project command execution.

## 2026-10-12 (agentic pass complete)
- Added `ComputerAgent` and connected it before the LLM path in `AgentBrain`.
- Live API sequence succeeded: opened Notepad and typed text, wrote a workspace note, and ran `npm run build`; `/api/health` stayed healthy after every command.
- Browser UI automation sent `open calculator` and displayed `Completed 1 computer step: Opened calculator.`
- Computer Use confirmed a real `Untitled - Notepad` window after the detached launch fix. Further Computer Use calls were stopped by the user's physical Escape key.
- Fixed GUI launch aliases to use detached `start` commands, preventing SARVIS from waiting on Notepad or another GUI process.
- Final verification: 46/46 tests, build pass, diff check pass.

## 2026-10-12 (web and desktop product pass complete)
- Added unlimited custom API-key storage in ignored `.sarvis-keys.json`; custom entries can use any provider, endpoint, model, and key.
- Redacted API status metadata so the browser never receives key material.
- Replaced the fixed settings surface with a minimalist dynamic API-key manager.
- Added Electron desktop shell via `npm run start:app`; it shares the same UI and brain on port `9743`, while the browser remains on `9742`.
- Verified the browser UI, API-key form, desktop process/window, desktop health endpoint, 14-key API smoke test, and final build/test gates.
- Added `SARVIS App.lnk` on the Windows Desktop with a hidden launcher script for one-click desktop startup.
