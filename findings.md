# SARVIS Findings

## Project State
- Repository remote is `https://github.com/Damamamamam/SARVIS.git`.
- The repository is now intentionally web-only; the earlier Electron and WPF clients were removed during the product redirect.
- The Obsidian vault is present at `obsidian-vault` inside the repository.
- Vault says current milestone is camera integration and GUI enhancements.
- TypeScript brain verification passes: `npm test` reports 41/41 passing.

## Tooling
- Computer Use is available and initialized successfully in this session.
- Antigravity IDE is installed and has been launched/observed through Computer Use.

## Build Findings
- Historical Windows build work is preserved in the progress log, but the current release gate is the TypeScript web app build and browser smoke test.

## Redirect Findings (2026-10-09)
- WPF crackle root causes: subsystem startup on the UI thread, per-callback
  `Dispatcher.Invoke` + full waveform redraw (~100 rects), overlapping Grid rows,
  audio-thread sends with no guard, silent send failures when offline.
- Web UI send failures root cause: `app.js` assumed Electron IPC only
  (`window.jarvisAPI.hear`); outside Electron every send threw.
- `JarvisBrain.hear` short-circuited to degraded with zero keys, hiding the
  local reminder/time paths; `APIRotatorService.complete` threw TypeError with zero keys.
- Rotator limit (8) contradicted the 9th provider (OpenCode Zen) in `load_keys.ts`.
- Provider status was reading a duplicate rotator instead of the AgentBrain rotator that served requests.
- `.env.example` values were counted as configured keys; OpenCode Zen used an obsolete NVIDIA endpoint; Gemini's initial model was retired or intermittently overloaded.
- Fixed by sharing the live rotator, rejecting placeholders, using the OpenCode Zen gateway endpoint, selecting Gemini 3.1 Flash Lite, retrying transient 503s, and verifying the browser flow live.

## Agentic Regression (2026-10-12)
- The web UI can call `/api/command`, but `AgentBrain.process()` never routed natural language into that service, so chat could only answer and not act.
- The fix must keep computer actions bounded and observable: whitelist app aliases, allow `http(s)` URLs, restrict file writes to the project workspace, and permit only known project commands.
- Multi-step requests should execute serially and stop on the first failure while returning the completed steps and failure detail to the UI.

## App And Unlimited Keys (2026-10-12)
- The current API rotator and UI are both hard-coded to nine provider slots.
- Custom key entries need a separate local store so multiple keys can target the same provider or endpoint without inventing environment-variable names.
- The desktop version can share the web server and UI through a small Electron shell, avoiding a second brain implementation and keeping web/app behavior consistent.
