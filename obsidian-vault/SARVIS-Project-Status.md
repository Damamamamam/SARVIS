# SARVIS Project Status

## Current Product

SARVIS is shipped as a browser web app backed by a Node.js/TypeScript brain. The supported launch path is `npm run build` followed by `npm start`, which serves the UI at `http://localhost:9742`.

The former Electron and WPF clients are retired from this repository. Windows controls and screen-time monitoring remain available through the web server's best-effort Windows integration.

## Completed

### Brain and Providers

- [x] 9-provider API rotator with failover and cooldowns
- [x] `.env` loading with placeholder-key rejection
- [x] Gemini AQ and legacy API-key formats accepted
- [x] Gemini 3.1 Flash Lite provider configuration
- [x] OpenCode Zen gateway configuration using its current OpenAI-compatible endpoint
- [x] Transient Gemini 503 retry before provider cooldown
- [x] Degraded/local mode for reminders, date, and time without a working provider
- [x] Intent routing, conversation state, device-control protocol, vision hooks, audio controller, and free web tools
- [x] 43 automated tests passing

### Browser App

- [x] HTTP UI served from the Node server
- [x] WebSocket live replies and screen-time nudges
- [x] Chat send flow with typing indicator, errors, and Enter-to-send
- [x] Browser speech recognition and speech synthesis
- [x] Single-utterance voice mode and hands-free converse mode
- [x] API-key setup wizard accepts any one configured provider
- [x] Masked key status in the settings view
- [x] 9-key provider dashboard and active-provider status
- [x] Windows command, active-window, and screen-guard endpoints
- [x] HTML escaping before markdown rendering
- [x] Agentic computer control from natural-language chat: ordered app/URL, typing, file, and safe project-command tools
- [x] Bounded workspace file writes and explicit rejection of arbitrary shell commands
- [x] Detached Windows app launching for Notepad, Calculator, Chrome, Edge, Explorer, Paint, Word, and Code

### Operations and Documentation

- [x] `npm run build` compiles TypeScript and copies UI assets
- [x] `npm test` passes all 46 tests
- [x] Live browser smoke test passed for app load and reminder creation
- [x] API health, key detection, status, and WebSocket routes verified
- [x] Localhost is the safe default bind; LAN binding is opt-in with `SARVIS_BIND=0.0.0.0`
- [x] README, framework notes, startup scripts, and this vault note updated for web-only delivery

## Provider Notes

- Gemini is detected from the current `.env` and responds when the upstream model is available. A transient 503 is retried automatically.
- OpenCode Zen keys are detected, but OpenCode's free tier rejects requests made by external applications. Paid or externally enabled OpenCode access is required for that provider to answer SARVIS requests.
- A provider failure does not break local reminders, date/time replies, the UI, or the server. SARVIS reports degraded mode and the provider error.

## Optional Follow-ups

- [ ] Add CI for build, tests, and a browser smoke test
- [ ] Add production authentication before exposing the server beyond localhost
- [ ] Add a native camera/frame pipeline if vision input is required in the browser product
- [ ] Add packaging/installer work if SARVIS needs a distributable desktop shell again

**Project Status**: Web MVP plus agentic computer-control pass complete and verified
**Next Milestone**: CI and production hardening
**Last Verified**: 2026-10-12
