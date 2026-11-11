# AI-watch Agent Instructions

## Agent Quick Card

- **Real-device product**: `api8-watch/` — HarmonyOS API 8 wearable FA app, package `com.aiwatch.watch`.
- **Stage preview**: `entry/` — ArkUI preview/prototype, not the device release entry.
- **Android probe**: `android-watch/` — diagnostic probe only; do not treat it as the watch product.
- **Web visual studies**: `prototypes/particles-nova/` and `prototypes/aurora-watch/` — design prototypes only; not HAP release entries.
- **Local voice service**: `scripts/ai_service.py`; start it with `powershell -ExecutionPolicy Bypass -File scripts\start-ai-service.ps1`.
- **Regression checks**: `npm run check:source`, `npm run check:core`, `npm run check:api8`.
- **HAP build**: follow `api8-watch/README.md` (DevEco/Hvigor, API 8, local SDK paths).
- **Device validation**: only for microphone, voice service, TTS, wearable interaction, or packaged HAP behavior.
- **Search skip**: `node_modules/`, `build/`, `.gradle/`, `.idea/`, and generated HAP output.
- **Never commit**: HAPs, signing material, API keys, captured audio, device credentials, or local SDK paths.

## Scope

This repository is a HarmonyOS wearable prototype with a PC-local voice service. Keep preview, device, and Android-probe code paths separate. A Previewer result is not a physical-watch result.
