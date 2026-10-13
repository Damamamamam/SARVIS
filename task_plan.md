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
No required code work remains for this pass. Handoff items are the Computer Use host-runtime failure, upstream provider availability, and optional Google OAuth configuration.

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

### Phase 10: Windows Computer Use Verification
Status: complete_with_limitations
- Launch the desktop app through the installed Windows workflow.
- Exercise setup/profile/model/API-key and agent-control paths through Computer Use.
- Record every observed error, unavailable integration, and environment-only limitation.
- Rerun automated tests/build, update progress notes, and push the handoff state.
- Direct fallback verification: desktop process/window, root/status/setup/auth endpoints, shortcuts, build, tests, and diff check all passed.
- Computer Use UI interaction was blocked before app inspection by the host runtime error recorded below.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Computer Use Antigravity launch did not immediately expose a window | Launch via Computer Use | Re-listed windows and located the target Antigravity window |
| Windows build missing `System.Management` | First `dotnet build` | Added package reference |
| Computer Use `node_repl` could not initialize: `failed to write kernel assets: The system cannot find the path specified. (os error 3)` | Windows UI verification initialization, including one clean kernel reset and retry | Logged as an environment limitation; continued with the available Computer Use surface and terminal verification |
| Computer Use `cua_repl` reported the same kernel-assets path error before exposing any Windows state | Fallback Computer Use surface initialization | Logged as the same host/runtime limitation; no UI interaction was claimed |
| Gemini provider timed out during the live desktop status run; rotator recorded `cooldown: timeout` | `/api/status` after the running desktop process had attempted provider work | Logged as an upstream/runtime provider failure; code/test gates still pass and the rotator exposes cooldown state |
| OpenCode provider returned `HTTP 400: Upstream request failed: Model is unavailable.` for `nemotron-3-ultra-free` | Same live desktop provider run | Logged for handoff; replace the configured model with one currently available to that OpenCode account |
| YouTube feed returned `401 Unauthorized` without a signed-in Google/YouTube session | `GET /api/integrations/youtube/feed` without OAuth credentials | Expected consent/auth protection, not a code regression; Google OAuth remains unconfigured in this environment |
| `GET /api/setup/profile` returned `404 Not Found` | Endpoint smoke probe used the wrong HTTP method | Endpoint is POST-only by design; no code change needed |

## Decisions Made
| Decision | Reason |
|----------|--------|
| Preserve existing worktree changes | They include the active web-only product redirect and documentation updates |
| Provider keys appeared configured but chat degraded | Reused the AgentBrain rotator for status, ignored placeholder values, corrected OpenCode Zen endpoint, and moved Gemini to the currently working model |
| SARVIS answered but did not act on natural computer requests | Added a bounded computer-agent layer instead of exposing arbitrary shell execution through chat |
| Direct GUI executable launch blocked the request while waiting for the app to exit | Switched GUI aliases to detached Windows `start` commands and verified a real Notepad window |
