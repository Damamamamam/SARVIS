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
Phase 4 - Finalize and Push.

## Next Step
Commit the verified web-only project and push the completed state to GitHub.

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
  voice converse mode, offline hear, 9-key consistency.

### Phase 3: Verify
Status: complete
- Run available TypeScript, server, and browser build/test checks.
- Record any environment-only limitations.
- npm test 43/43, npm run build OK, build.bat OK,
  web smoke test OK (health/UI/hear/WS/reminder).

### Phase 4: Update Vault And GitHub
Status: in_progress
- Update Obsidian progress.
- Commit all project changes.
- Push to origin.

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
