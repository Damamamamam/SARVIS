# SARVIS Desktop Assistant — System Architecture

> **Version**: 0.1.0  
> **Generated**: SARVIS Framework Architecture Blueprint  
> **Target Platform**: Windows 10+  
> **Brain Runtime**: Node.js / TypeScript (bridged over localhost WebSocket)

---

## §1 — High-Level System Diagram

```mermaid
graph TD
    subgraph Windows["Windows App Layer (Kotlin)"]
        ACC["Accessibility Service"]
        MIC["MediaRecorder / AudioRecord"]
        CAM["CameraX Front Camera"]
        TTS["Windows TTS Engine"]
        UI["SARVIS UI / Overlay"]
    end

    subgraph Brain["SARVIS Brain (TypeScript / Node)"]
        AB["AgentBrain"]
        AR["APIRotatorService"]
        DC["DeviceControlService"]
        AAR["AmbientAudioRecorder"]
        OTD["OwnerTalkDetector"]
        FT["Free Tools Registry"]
    end

    subgraph Providers["LLM Providers (Free Tier)"]
        P1["Gemini Flash"]
        P2["Groq"]
        P3["OpenRouter"]
        P4["Cerebras"]
        P5["Mistral Free"]
        P6["Together AI"]
        P7["Cohere"]
        P8["DeepSeek Free"]
    end

    subgraph Tools["Free External APIs"]
        T1["Open-Meteo (Weather)"]
        T2["Wikipedia REST"]
        T3["NewsAPI"]
        T4["Nominatim (Places)"]
        T5["DuckDuckGo Instant"]
        T6["Open Library"]
        T7["IP Geolocation"]
        T8["Dictionary API"]
    end

    UI -- "user interaction" --> AB
    MIC -- "audio chunks" --> AAR
    CAM -- "video frames" --> OTD
    ACC -- "device state" --> DC

    AAR -- "transcribed text" --> AB
    OTD -- "TalkState signal" --> AB
    AB -- "device commands" --> DC
    DC -- "command protocol (WS)" --> ACC

    AB -- "LLM requests" --> AR
    AR -- "failover chain" --> P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8
    AB -- "tool calls" --> FT
    FT --> T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8

    AB -- "voice reply" --> TTS
    TTS -- "audio output" --> UI
```

---

## §2 — Module Inventory

| ID | Module | Language | File | Layer |
|----|--------|----------|------|-------|
| A | APIRotatorService | TypeScript | `src/services/api_rotator.ts` | Brain |
| B | DeviceControlService | TypeScript | `src/services/device_control.ts` | Brain |
| C | AmbientAudioRecorder | TypeScript | `src/services/audio_recorder.ts` | Brain |
| D | OwnerTalkDetector | TypeScript | `src/services/vision_tracker.ts` | Brain |
| E | AgentBrain | TypeScript | `src/services/agent_brain.ts` | Brain |
| F | Free Tools Registry | TypeScript | `src/tools/free_tools.ts` | Brain |
| G | Type Definitions | TypeScript | `src/services/types.ts` | Brain |
| H | Windows Bridge | Kotlin | `android/` (future) | Native |

---

## §3 — Communication Protocol

### Brain ↔ Windows Bridge

All communication between the TypeScript brain and the Windows native layer uses **JSON messages over a local WebSocket** (`ws://localhost:9741`).

```
┌──────────────────────────────────────────────────────┐
│ Message Envelope                                      │
├──────────────────────────────────────────────────────┤
│ {                                                    │
│   "id": "msg_<nanoid>",                              │
│   "type": "command" | "event" | "ack" | "error",    │
│   "module": "device" | "audio" | "vision" | "brain", │
│   "payload": { ... },                                │
│   "ts": 1723574400000                                │
│ }                                                    │
└──────────────────────────────────────────────────────┘
```

**Command flow:**
1. Brain sends `{ type: "command", module: "device", payload: { action: "launchApp", pkg: "com.example" } }`
2. Windows bridge executes via Accessibility Service
3. Bridge replies `{ type: "ack", id: "<same-id>", payload: { success: true } }`
4. On failure: `{ type: "error", id: "<same-id>", payload: { code: "APP_NOT_FOUND", message: "..." } }`

---

## §4 — Module Deep Dives

### §4.1 — APIRotatorService (Module A) ✅ BUILT

**State Machine:**

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> ACTIVE : promoted by rotator
    ACTIVE --> COOLDOWN : 429 / timeout / 5xx
    COOLDOWN --> IDLE : health check passes (cooldown expired)
    IDLE --> ACTIVE : next key promoted on failover
```

**Key design decisions:**
- Max 8 keys, exactly 1 ACTIVE at any time
- Conversation state is **external** to the rotator (stateless HTTP completions)
- Escalating cooldown: `base + (min(failures, 8) × 5s)`
- Background health check reinstates keys after cooldown window

### §4.2 — DeviceControlService (Module B)

**Command taxonomy:**

```mermaid
graph LR
    subgraph Commands
        APP["App Management"]
        SCREEN["Screen Interaction"]
        SYSTEM["System Toggles"]
        COMMS["Call / SMS"]
    end

    APP --> Launch & Close & Switch
    SCREEN --> Tap & Scroll & Swipe & InputText
    SYSTEM --> WiFi & Bluetooth & Flashlight & Volume & Brightness & DND & Notifications
    COMMS --> Dial & ReadSMS & SendSMS & AnswerCall & RejectCall
```

**Command Queue State Machine:**

```mermaid
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> EXECUTING : dequeued
    EXECUTING --> COMPLETED : ack received
    EXECUTING --> FAILED : error or timeout
    FAILED --> QUEUED : retry (max 2)
    FAILED --> DEAD : retries exhausted
    COMPLETED --> [*]
    DEAD --> [*]
```

**Concurrency model:** Serial command queue (one command executes at a time via the Accessibility Service). Commands timeout after 10s if no ack is received.

### §4.3 — AmbientAudioRecorder (Module C)

**Rolling Buffer Architecture:**

```
Time →  [Chunk 0][Chunk 1][Chunk 2][Chunk 3][Chunk 4] ...
         ←─────── 30s rolling window ─────────→
         oldest                              newest
         (overwritten)                        (recording)
```

Each chunk = 5 seconds of PCM audio. Buffer holds 6 chunks = 30s total. When chunk 7 arrives, chunk 0 is discarded.

**Kill Switch State Machine:**

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> ARMED : user arms recording
    ARMED --> RECORDING : start() called
    RECORDING --> KILLED : kill switch toggled
    KILLED --> IDLE : explicit re-arm required
    RECORDING --> PAUSED : temporary pause
    PAUSED --> RECORDING : resume
    PAUSED --> KILLED : kill switch toggled
    
    note right of KILLED
        Buffer immediately zeroed.
        Mic hardware released.
        Cannot restart without
        explicit re-arm.
    end note
```

**Security guarantees:**
1. Kill switch is a **hard stop** — zeroes all buffer memory, releases mic hardware
2. Cannot transition from `KILLED` → `RECORDING` without explicit `arm()` call
3. Kill switch activation emits a `kill_switch_activated` event to all listeners
4. No audio data persists to disk — buffer is memory-only

### §4.4 — OwnerTalkDetector (Module D)

**Detection Pipeline:**

```mermaid
flowchart LR
    FRAME["Camera Frame\n(low-res)"] --> FACE["Face\nDetection"]
    FACE -->|no face| NF["NO_FACE"]
    FACE -->|face found| GAZE["Gaze\nEstimation"]
    GAZE -->|not facing lens| RC["ROOM_CONVERSATION"]
    GAZE -->|facing lens| LIP["Lip Movement\nTracking"]
    LIP -->|mouth moving| TJ["TALKING_TO_SARVIS"]
    LIP -->|mouth still| RC2["ROOM_CONVERSATION"]
```

**Lip Movement Detection Algorithm:**
1. Extract mouth landmarks (MediaPipe FaceMesh points 13, 14 for inner lips)
2. Compute Mouth Aspect Ratio (MAR): `MAR = vertical_dist / horizontal_dist`
3. Track MAR deltas over a rolling window of 10 frames
4. If `stddev(MAR_deltas) > threshold` → mouth is moving
5. Combined with gaze angle `< 30°` from lens axis → `TALKING_TO_SARVIS`

**Thresholds (configurable):**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `mouthOpenRatio` | 0.3 | MAR threshold for "open" |
| `gazeAngleTolerance` | 30° | Max yaw from camera axis |
| `movementDeltaThreshold` | 0.05 | Min stddev for "talking" |
| `frameSlidingWindow` | 10 | Frames for smoothing |

---

## §5 — Data Schemas

All shared types are defined in `src/services/types.ts`. Key schemas:

- **KeyConfig** — API key configuration (provider, endpoint, limits)
- **Conversation** — Persisted transcript for context continuity across failovers
- **Reminder** — Voice-extracted tasks with due times
- **BehaviorProfile** — Owner habits, routines, tone preferences
- **TalkState** — Vision classifier output enum
- **ToolResult** — Standardized free tool response format
- **ScreenTimeEntry** — App usage tracking for nudge system

---

## §6 — Security Model

```mermaid
flowchart TD
    subgraph Principles
        P1["No API keys hardcoded"]
        P2["Audio never persisted to disk"]
        P3["Kill switch is irrevocable without re-arm"]
        P4["Camera frames processed in-memory only"]
        P5["WebSocket is localhost-only"]
    end

    subgraph Enforcement
        E1["Keys loaded from env / Windows Keystore"]
        E2["Rolling buffer zeroed on kill"]
        E3["State machine prevents KILLED→RECORDING"]
        E4["No frame serialization to storage"]
        E5["WS binds to 127.0.0.1:9741 only"]
    end

    P1 --> E1
    P2 --> E2
    P3 --> E3
    P4 --> E4
    P5 --> E5
```

---

## §7 — Free Tool API Coverage

| Tool | API | Key Required | Rate Limit | Status |
|------|-----|:---:|------------|--------|
| Weather | Open-Meteo | ❌ | Unlimited | ✅ Built |
| Wikipedia | REST v1 | ❌ | Reasonable use | ✅ Built |
| News | NewsAPI.org | ✅ (free) | 100/day | ✅ Built |
| Places | Nominatim | ❌ | 1 req/s | ✅ Built |
| Web Search | DuckDuckGo Instant | ❌ | Reasonable use | 🔨 Building |
| Books | Open Library | ❌ | Unlimited | 🔨 Building |
| Geolocation | ip-api.com | ❌ | 45/min | 🔨 Building |
| Dictionary | Free Dictionary | ❌ | Unlimited | 🔨 Building |
| Quotes | quotable.io | ❌ | Unlimited | 🔨 Building |

---

## §8 — Build & Test Strategy

```bash
# Type check
npm run build

# Run all tests
npm test

# Run specific test suite
npm run test:rotator
npm run test:device
npm run test:audio
npm run test:vision
```

All tests use Node.js built-in `node:test` runner — zero external test dependencies.
