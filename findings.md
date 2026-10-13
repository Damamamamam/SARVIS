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

## Awareness And Setup (2026-10-13)
- SARVIS now needs a real setup state rather than treating API-key presence as first-run completion.
- The awareness boundary is metadata-only and consented: installed/running app names plus file counts, folder counts, extensions, and selected root names. Raw files and secrets are not included in the model context.
- The profile is reviewable before persistence and can be rerun from the Profile & models view.
- The selected reasoning model is passed into the rotator request; `auto` preserves normal failover behavior. Voice input preferences are persisted separately, with browser-native recognition as the working private default.

## Google Personalization (2026-10-13)
- Google identity and YouTube access must be incremental OAuth grants, not one broad silent consent. SARVIS requests OpenID identity first and `youtube.readonly` only when the user chooses Connect YouTube.
- YouTube's API supports authenticated activity/subscription signals, but its personalized home feed endpoint is deprecated/unavailable; the UI labels the returned data as a preview rather than calling it a full recommendation feed.
- Direct Google Search/My Activity history is not exposed as a general third-party API. SARVIS therefore supports a user-selected JSON export, local topic extraction, explicit import approval, and deletion.
- Google access and personal signals are separate: disconnecting Google clears the local Google profile context and memory-only tokens; YouTube and search signals also have independent delete actions.
