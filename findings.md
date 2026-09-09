# Findings

## Build
- `android/gradle/wrapper/gradle-wrapper.properties` exists (Gradle 8.2).
- ✅ `gradlew`, `gradlew.bat`, and `gradle-wrapper.jar` added — APK can now be assembled.
- Kotlin uses coroutines and `build.gradle.kts` includes `kotlinx-coroutines-android`.

## Protocol
- TS `DeviceCommand` includes `category` and names like `fromX`/`pullNotifications`/`setVolume`/`toggle`.
- ✅ Protocol mapping implemented in `src/protocol/android_payload.ts` with field aliases.
- Kotlin `sendAck` often omits `success: true`; TS treats missing success as failure.

## Runtime
- Phone `ws://localhost:9741` is the **phone**, not the PC. Emulator host is `10.0.2.2`.
- ✅ Node process binds `:9741` via `src/server/index.ts` with configurable binding.
- Camera frames are JPEG, not FaceLandmarks — vision events are ignored until Antigravity ships MediaPipe.

## Infrastructure (Cursor - Completed)
- ✅ TypeScript brain with all core services
- ✅ WebSocket server implementation
- ✅ Protocol mapping between TS and Android
- ✅ Android build system (gradlew)
- ✅ Unit tests for brain components
- ✅ README with setup instructions
- ✅ Environment configuration templates
- ✅ Build and startup scripts

## Android Native (Fully Integrated)
- ✅ STT integration (native SpeechRecognizer)
- ✅ TTS integration (native TextToSpeech)
- ✅ Runtime permission request UI (Compose-based)
- ✅ Configuration UI for brain host (Compose-based)
- ✅ Android Keystore integration (AES-GCM encryption)
- ✅ WebSocket reconnection logic (OkHttp with backoff)
- ✅ MediaPipe face processing (TalkState detection)
- ✅ Build system modernized (AGP 8.2.2, SDK 34, Kotlin 1.9.22)
