# SARVIS Completion Plan

## Goal
Complete the project to a handoff-ready state, verify builds/tests, update progress in the Obsidian vault, and push the finished work to GitHub.

## Redirect (2026-10-09, user request)
Stability first + web app instead of Windows-only: fix cracky WPF client
(UI-thread overload, typing/sending blocked), add jarvis-mcp-style voice
features (converse loop, speak toggle, voice status), and ship SARVIS as a
browser web app (HTTP + WebSocket).

## Web-only (2026-10-09, user request)
Removed the GUI apps entirely (`src/electron/`, `windows/JarvisWindows/`,
WINDOWS docs). `npm start` launches the web app; `start-sarvis.bat` builds,
starts the server, and opens the browser.

## Current Phase
Complete.

## Next Step
No required project work remains. Google Cloud OAuth credentials are the only environment-specific setup; optional CI and production hardening remain documented.

## Phases
### Phase 1: Recover Status
Status: complete
- Read Obsidian vault progress notes.
- Inspect README/setup/build files.
- Preserve existing uncommitted work.

### Phase 2: Complete Code
Status: complete
- Fix compile/runtime blockers.
- Fill missing integration points that are documented as incomplete.
- Redirect: WPF stability fixes, web-app server, dual-transport UI,
  voice converse mode, offline hear, provider consistency.

### Phase 3: Verify
Status: complete
- Run available TypeScript, server, and browser build/test checks.
- Record any environment-only limitations.
- npm test 43/43, npm run build OK, build.bat OK,
  web smoke test OK (health/UI/hear/WS/reminder).

### Phase 4: Update Vault And GitHub
Status: complete
- Update Obsidian progress.
- Commit all project changes.
- Push to origin.

### Phase 5: Agentic Computer Control
Status: complete
- Add ordered local tool planning for opening apps/URLs, typing, file creation, file opening, and safe project commands.
- Route agent tasks through the normal `hear` path and return step-by-step execution results.
- Add parser/execution tests and run live browser + Computer Use verification.
- Update the vault and push the verified fix to GitHub.

### Phase 6: Web + Desktop Product
Status: complete
- Support unlimited custom API key entries with masked status and local persistence.
- Replace the fixed provider settings UI with a minimal dynamic key manager.
- Add a minimal desktop app shell that shares the web UI and brain.
- Run build, tests, web smoke checks, and desktop launch verification before pushing.

### Phase 7: Consentful Awareness And Personal Setup
Status: complete
- Add metadata-only app/file awareness behind explicit user consent.
- Persist the confirmed user profile and use it as bounded LLM context.
- Add a first-run personality quiz with a review/correction step.
- Add separate brain-model and voice-input-model settings.
- Add setup/status APIs, a re-run setup control, tests, and documentation.

## Phase 8: Final Awareness Verification
Status: complete
- Build and test the consentful setup implementation.
- Verify setup, scan, profile, and model settings APIs with a live server.
- Verify the browser quiz/review/model workflow.
- Remove temporary smoke-test profile data and update project notes.

### Phase 9: Google And Optional Personalization Integrations
Status: complete
- Add Google OpenID Connect sign-in with CSRF state and in-memory tokens.
- Add an incremental YouTube read-only connection and sanitized activity signals.
- Add an explicit Google My Activity/Takeout search-topic import because direct history API access is unavailable.
- Add connected-source status, consent copy, disconnect/delete controls, tests, and documentation.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Computer Use Antigravity launch did not immediately expose a window | Launch via Computer Use | Re-listed windows and located the target Antigravity window |
| Windows build missing `System.Management` | First `dotnet build` | Added package reference |

## Decisions Made
| Decision | Reason |
|----------|--------|
| Preserve existing worktree changes | They include the active web-only product redirect and documentation updates |
| Provider keys appeared configured but chat degraded | Reused the AgentBrain rotator for status, ignored placeholder values, corrected OpenCode Zen endpoint, and moved Gemini to the currently working model |
| SARVIS answered but did not act on natural computer requests | Added a bounded computer-agent layer instead of exposing arbitrary shell execution through chat |
| Direct GUI executable launch blocked the request while waiting for the app to exit | Switched GUI aliases to detached Windows `start` commands and verified a real Notepad window |
