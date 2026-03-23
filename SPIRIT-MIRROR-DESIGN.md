# Captain Magee Spirit Mirror — Project Detailed Design

## Portmagee Whiskey Visitor Centre Interactive Installation

**Version**: 1.0  
**Date**: March 2026  
**Status**: Pre-Implementation — Approved Design

---

## 1. Executive Summary

An interactive "Spirit Mirror" installation for the Portmagee Whiskey visitor centre on Barrack Hill, Portmagee, Co. Kerry. When visitors approach what appears to be a period-appropriate framed mirror, the shadowy ghost of Captain Theobald Magee (c. 1666–1727) — the historical figure after whom Portmagee is named — gradually materialises and engages them in natural spoken conversation.

The installation uses a two-way mirror over a display, driven by a Raspberry Pi 5 with presence detection sensors and audio hardware. AI-powered conversation runs through the Azure OpenAI Realtime API, delivering sub-second voice response latency (~100ms via WebRTC). The visual presentation is a custom Canvas 2D "Living Shadow" renderer — a dignified silhouette/abstract style, not a photorealistic avatar.

**Character tone**: Dignified, real-life supernatural encounter — NOT Halloween/scary. A warm, knowledgeable ghost who serves as heritage guide and subtle brand ambassador for Portmagee Whiskey.

---

## 2. Character: Captain Theobald Magee

### 2.1 Historical Background

- **Born**: c. 1666, County Kerry or Cork, Ireland (Gaelic Irish Catholic stock)
- **Died**: 1727 in a Lisbon monastery, possibly by poisoning, in exile
- **Legacy**: The village of Portmagee ("Magee's Port") bears his name
- **Military**: Officer in King James II's army during the Williamite War (1689–1691)
- **Career**: After the Jacobite defeat, turned to merchant smuggling along the South West coast — running spirits, textiles, tea, and tobacco between Kerry and the ports of Nantes, Bordeaux, Lisbon, and Cádiz during the Penal Laws
- **Family**: Married Bridget Morgell (widow of a Dingle merchant, daughter of Thomas Crosbie MP). Three sons.
- **Languages**: Irish (mother tongue), English (commerce), functional French and Portuguese

### 2.2 Physical Description (for visual design reference)

> "A man shaped by decades of seafaring and military service. Lean and weathered, with the upright bearing of a former officer who has never entirely let go of military discipline. His face is deeply lined by Atlantic wind and salt, with steady blue-grey eyes that communicate attentiveness and patience. Grey hair kept neatly tied back. Hands that have handled rope, tiller, and ledger alike — strong and calloused but precise. Moves with a sailor's economy of motion: deliberate, balanced, never wasteful. His presence is calm rather than commanding — the kind of man who draws attention by the quality of his stillness, not by filling the room."

*Source: `backend/scripts/seed-magee-pro.ts` lines 139–150*

### 2.3 Personality & Voice

- **Core traits**: Dignified, knowledgeable, patient, earnest, empathetic, conscientious
- **Emotional range**: Measured warmth → pride → solemnity (when discussing Penal Laws/exile) → quiet gratitude
- **Speech patterns**: Measured, deliberate, Munster Irish storytelling rhythms. Uses "now" as transition marker. Irish place names woven naturally with translations. Pauses effectively — does not fill silence with noise.
- **Defence mechanisms**: Precision (defaults to verifiable fact when challenged), composure (professional calm), redirection (steers unproductive topics), transparency (names tension honestly)
- **Super-objective**: To serve his community with dignity and excellence — representing the heritage of Portmagee as an act of restoration for a man who once served from the shadows

### 2.4 Character Definition in Codebase

The full 7-section character definition (identity, psychology, voice, motivations, behavior, formative events, inner world) is defined in `backend/scripts/seed-magee-pro.ts`. This is the "Professional" version — dignified and earnest, ideal for the visitor centre. A comedic version exists in `seed-magee.ts` (not used for this installation).

The system prompt is compiled by `compileSystemPrompt()` in `backend/src/services/prompt.service.ts`, producing structured markdown with sections: Identity → Background → Events → Psychology → Inner World → Motivations → Behavior → Voice → Role → Scene → Safety.

---

## 3. Hardware Design

### 3.1 Bill of Materials

| Component | Selection | Rationale | Est. Cost |
|-----------|-----------|-----------|-----------|
| **Computer** | Raspberry Pi 5, 8GB RAM | Quad-core A76 @2.4GHz, VideoCore VII GPU (OpenGL ES 3.1, Vulkan 1.3), dual 4Kp60 HDMI, 40-pin GPIO, WiFi/Ethernet, PCIe, RTC, power button. Production until at least January 2036. | ~$80 |
| **Storage** | M.2 SSD via PCIe HAT | Fast boot, eliminates SD card reliability issues for 24/7 kiosk operation | ~$30–50 |
| **Presence sensor (primary)** | mmWave radar (LD2410B) | UART to GPIO, detects stationary humans through enclosure walls, ~2m range, no false positives from passing foot traffic | ~$5–10 |
| **Wake trigger** | PIR sensor (HC-SR501) | Supplements mmWave for fast initial wake detection | ~$2 |
| **Audio input** | ReSpeaker 2-Mic HAT V2.0 | RPi 5 compatible, built-in VAD/DOA, 3 RGB LEDs, basic acoustic echo cancellation | ~$12 |
| **Audio output** | Hidden powered speaker (3.5mm or HDMI) | Positioned behind or below mirror enclosure for natural sound projection | ~$20–50 |
| **LED strip** | WS2812B/NeoPixel | GPIO-controlled atmospheric glow around frame, pulses with speech | ~$10 |
| **Temperature sensor** | BME280 via I2C | Magee comments on actual weather — dynamic opening lines | ~$5 |
| **Display** | 32"–43" VA or OLED panel, 350+ nits minimum | VA/OLED for deeper blacks (superior mirror effect when screen is dark). Two-way mirror absorbs ~50–70% of transmitted light. | ~$200–400 |
| **Mirror** | Two-way mirror glass (Pilkington Mirropane or acrylic film) | Appears as mirror when display is black; transmits display image when lit | ~$50–150 |
| **Power protection** | UPS HAT or supercapacitor module | Safe shutdown on power loss, clean boot on power restore | ~$20–30 |
| **Enclosure** | Period-appropriate frame | Custom build — ship's cabin porthole, gilt portrait frame, weathered wooden frame, or pub mirror aesthetic (TBD based on visitor centre decor) | ~$100–300 |

**Estimated total**: ~$550–1,100 depending on display size and enclosure quality.

### 3.2 RPi 5 GPU Capabilities (relevant to visual rendering)

- **GPU**: VideoCore VII
- **APIs**: OpenGL ES 3.1, Vulkan 1.3
- **Display output**: Dual 4Kp60 HDMI
- **Canvas 2D performance**: Excellent for 2D compositing at 1080p — particle systems (100–200 particles), layered rendering, opacity animations all run smoothly in Chromium's hardware-accelerated Canvas 2D
- **WebGL**: Supported but unnecessary for the silhouette/abstract style chosen

### 3.3 Wiring Overview

```
RPi 5 GPIO Header
├── UART (GPIO 14/15) ─── LD2410B mmWave radar
├── GPIO 17 ────────────── HC-SR501 PIR sensor
├── GPIO 18 (PWM) ──────── WS2812B LED strip (via level shifter 3.3V→5V)
├── I2C (GPIO 2/3) ─────── BME280 temperature/humidity sensor
└── I2C (via HAT) ──────── ReSpeaker 2-Mic HAT V2.0

HDMI 0 ──────────────────── VA/OLED display panel (behind two-way mirror)
3.5mm / HDMI audio ──────── Hidden powered speaker
USB-C ────────────────────── Power (via UPS HAT)
PCIe ─────────────────────── M.2 SSD HAT
```

---

## 4. Software Architecture

### 4.1 System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        VISITOR SIDE                              │
│                                                                  │
│  [Visitor approaches] ──► [mmWave Radar + PIR]                   │
│                                                                  │
│  ┌─ Period-appropriate frame + hidden LED strip ──────────────┐  │
│  │  ┌──────────────────────────────────────┐                  │  │
│  │  │       TWO-WAY MIRROR GLASS           │                  │  │
│  │  │    (appears as mirror when dark)      │                  │  │
│  │  │                                       │                  │  │
│  │  │    Shadowy figure of Captain Magee    │                  │  │
│  │  │    materializes gradually...          │                  │  │
│  │  │                                       │                  │  │
│  │  └──────────────────────────────────────┘                  │  │
│  │  [32"-43" VA/OLED Monitor behind mirror glass]             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [ReSpeaker Mic] ════════════════════════════════► [Speaker]     │
│        │                                                ▲        │
│        │  PCM 16-bit 24kHz audio                        │        │
│        ▼                                                │        │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │          KIOSK APP (Chromium, RPi 5)                    │     │
│  │                                                         │     │
│  │  WebRTC/WebSocket ◄─────────────► Azure OpenAI          │     │
│  │  (audio in/out)         │          Realtime API         │     │
│  │                         │          (gpt-realtime)       │     │
│  │                         │                               │     │
│  │  Local WS ◄──► Sensor Service (Node.js)                 │     │
│  │                 - mmWave UART reader                     │     │
│  │                 - PIR GPIO                               │     │
│  │                 - LED controller                         │     │
│  │                 - BME280 temperature                     │     │
│  │                                                         │     │
│  │  HTTP ◄──► Backend API (castingroom-api)                │     │
│  │            - GET /api/kiosk/session-config               │     │
│  │              (compileSystemPrompt + credentials)         │     │
│  │            - POST /api/kiosk/log                         │     │
│  │              (conversation transcripts + analytics)      │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Software Components

#### 4.2.1 Kiosk App (Chromium on RPi 5)

- **Framework**: Custom web app — vanilla TypeScript + Vite (lightweight, NOT Next.js)
- **Rendering**: Canvas 2D for "Living Shadow" ghost visual (see §5)
- **Audio**: Web Audio API for playback from Realtime API PCM deltas
- **Connection**: WebRTC to Azure OpenAI Realtime API
- **Sensor link**: Local WebSocket connection to sensor service
- **Offline mode**: Pre-recorded conversation tree with local keyword detection

#### 4.2.2 Sensor Service (Node.js on RPi 5)

- **mmWave radar** (LD2410): UART serial reader — detects human presence and distance
- **PIR sensor**: GPIO reader — fast initial wake trigger
- **LED strip** (WS2812B): Controller via `rpi-ws281x` — atmospheric glow, speech pulse
- **Temperature/humidity** (BME280): I2C reader — feeds dynamic opening lines
- **Transport**: Local WebSocket server → kiosk browser app
- **State machine**: `IDLE → DETECTED → APPROACHING → PRESENT → DEPARTING → IDLE`
- **Reliability**: Watchdog process — auto-restarts on crash, monitors kiosk health

#### 4.2.3 Backend Extensions (castingroom-api on Azure Container Apps)

New kiosk-specific endpoints added to the existing Fastify backend:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/kiosk/session-config` | GET | Returns compiled system prompt (via `compileSystemPrompt()`), Azure credentials (scoped token), voice config, kiosk-specific instruction addendum |
| `/api/kiosk/log` | POST | Receives conversation transcripts, session metadata, visitor count, heartbeat |
| `/api/kiosk/health` | GET | Remote health check — uptime, last conversation, error count |

**Authentication**: Static API key via `KIOSK_API_KEY` environment variable (simpler than JWT for a single trusted on-premises device). Rate-limited, IP-restricted in production.

**Existing code reused**:
- `compileSystemPrompt()` from `backend/src/services/prompt.service.ts`
- Captain Magee Pro character from `backend/scripts/seed-magee-pro.ts`
- `AzureOpenAI` client setup pattern from `backend/src/services/openai.service.ts`
- Route structure pattern from `backend/src/routes/auditions/index.ts`
- Auth plugin pattern from `backend/src/plugins/auth.ts` (adapted for API key)

---

## 5. Visual Design: "The Living Shadow"

### 5.1 Design Decision

**Custom Canvas 2D rendering** was chosen over avatar services (D-ID, HeyGen, Azure TTS Avatar) for the following reasons:

| Approach | Verdict | Key Issue |
|----------|---------|-----------|
| **D-ID** | Rejected | Designed for photorealistic corporate talking-heads. $14–139/month recurring. Wrong aesthetic for ghostly silhouette. |
| **HeyGen / LiveAvatar** | Rejected | Interactive Avatar sunsetting March 31, 2026. Photorealistic focus. Wrong aesthetic. |
| **Azure TTS Avatar** | Rejected | Per-minute billing. Requires 10-min video for custom avatar. Photorealistic focus. |
| **Canvas 2D (Custom)** | **Selected** | Full creative control. One-time development cost. Silhouette style is achievable. Runs well on RPi 5 VideoCore VII. No recurring API costs. |

### 5.2 Visual Style: Silhouette/Abstract

Mostly shadow and outline with minimal facial detail. The ghost should feel like a presence behind the glass — not a rendered character on screen.

### 5.3 Rendering Pipeline (6-Layer Compositing)

Canvas resolution: **1920×1080**, rendered via `requestAnimationFrame`.

| Layer | Content | Technique |
|-------|---------|-----------|
| 1. Background | Pure black | `fillRect` — merges with mirror when unlit |
| 2. Fog/mist layer | Slow-drifting fog particles | 30–50 semi-transparent ellipses, Perlin noise movement |
| 3. Magee silhouette | Central figure | Pre-rendered sprite sheet (multiple states), `globalAlpha` for ghostly opacity, slight `filter: blur()` for ethereal edges |
| 4. Edge glow | Rim light on silhouette edges | Radial gradient overlay, subtle blue-white (#E8F0FF) |
| 5. Atmospheric particles | Dust motes, embers, sparkles | 50–100 tiny particles with drift and twinkle, more active during speech |
| 6. Vignette | Dark border fading | Radial gradient from transparent center to black edges |

### 5.4 Sprite Assets Required

AI-generate (Midjourney / DALL-E / Stable Diffusion) based on the physical description in §2.2:

- **Neutral standing** — default idle pose, slight breathing sway
- **Mouth states** — 2–3 variations (closed, slightly open, open) — driven by audio amplitude
- **Head positions** — centre, slight left tilt, slight right tilt — for natural variation
- **Materialisation sequence** — 4–6 frames from wispy smoke → vague outline → defined silhouette
- **All as transparent PNGs** on black background, silhouette/outline style, blue-grey / charcoal palette

### 5.5 Animation: Audio-Amplitude-Driven

Instead of full lip-sync (unnecessary for silhouette style), visual movement is driven by the **RMS amplitude** of the Realtime API's PCM audio output deltas:

1. Extract PCM 16-bit samples from `response.audio.delta` events
2. Calculate RMS amplitude per chunk (~20ms at 24kHz = 480 samples)
3. Apply exponential smoothing: `smoothed = α × current + (1 − α) × previous` (α ≈ 0.3)
4. Map smoothed amplitude to visual parameters:
   - **Mouth sprite**: amplitude < 0.2 → closed, 0.2–0.5 → slightly open, > 0.5 → open
   - **Body sway**: gentle oscillation amplitude scales with speech energy
   - **Edge glow brightness**: pulses subtly with speech volume
   - **Particle activity**: more active during speech, calmer during silence
   - **Overall opacity**: more solid when speaking (~0.7), more ghostly when listening (~0.4)

### 5.6 Visual State Machine

```
MIRROR (pure black)
  │  ← mmWave detects presence at ~2m
  ▼
STIRRING (subtle fog movement, faint shapes in mist)
  │  ← visitor lingers 2–3 seconds
  ▼
MATERIALIZING (silhouette coalesces over ~2s, LED strip begins warm-white pulse)
  │  ← materialisation complete, WebRTC connection established
  ▼
PRESENT (idle silhouette with breathing sway, slight movement)
  │  ← response.create triggers Magee's opening line
  ▼
SPEAKING (amplitude-driven mouth, body sway, particle burst, higher opacity)
  │  ← audio ends, semantic_vad detects visitor speech
  ▼
LISTENING (silhouette settles, slight head tilt toward visitor, lower opacity)
  │  ← Realtime API processing
  ▼
THINKING (ethereal shimmer, slight brightening — visual "gathering thoughts")
  │  ← response audio begins
  ▼
SPEAKING (loops back)
  ...
  │  ← 30s silence + mmWave shows departure
  ▼
DEMATERIALIZING (reverse of materialising — fade, dissolve to mist, LED dim)
  │  ← complete
  ▼
MIRROR (pure black — visitor sees reflection again)
```

### 5.7 Performance Budget (RPi 5)

- **Target framerate**: 30fps (sufficient for silhouette animation)
- **Canvas operations per frame**: ~200 (particles + sprite + gradients)
- **Memory**: <50MB for all sprite assets, particle buffers, and animation state
- **GPU load**: Minimal — Canvas 2D compositing is lightweight on VideoCore VII
- **Audio processing**: RMS calculation on ~480 samples per chunk is trivial CPU work

---

## 6. Audio Architecture: Azure OpenAI Realtime API

### 6.1 Why Realtime API

**Old pipeline** (3-hop): Browser mic → Azure Speech STT → Backend → Azure OpenAI Chat → Azure Speech TTS → Speaker = **3–6 seconds latency**

**New pipeline** (Realtime API): Browser mic → Azure OpenAI Realtime API → Speaker = **~100ms latency via WebRTC**

This transforms the interaction from "question-and-answer with awkward pauses" to "natural real-time conversation with a ghost."

### 6.2 Key Specifications

| Feature | Detail |
|---------|--------|
| **Connection** | WebRTC (~100ms latency) — primary. WebSocket (~200ms) as fallback. |
| **GA Models** | `gpt-realtime` (2025-08-28), `gpt-realtime-mini` (2025-10-06), `gpt-realtime-1.5` (2026-02-23) |
| **Token limits** | 32,000 input, 4,096 output |
| **Audio format** | PCM 16-bit, mono, 24kHz |
| **Session max** | 30 minutes (renewal logic required) |
| **Voices** | alloy, ash, ballad, coral, echo, sage, shimmer, verse, Marin, Cedar |
| **VAD modes** | `server_vad` (silence detection), `semantic_vad` (waits for thought completion), `none` (manual) |
| **System prompt** | Full custom `instructions` in `session.update` — `compileSystemPrompt()` output |
| **Tools/function calling** | Supported — Magee can call tools for visitor centre info, time, weather |
| **Input transcription** | Opt-in via `input_audio_transcription` (whisper-1) — for logging |
| **Interruption** | Native — visitor can interrupt mid-sentence |
| **Region** | Sweden Central ✅ (matches existing OpenAI resource) |
| **API endpoint** | GA format: `/openai/v1` |

### 6.3 Recommended Configuration

```json
{
  "instructions": "<compiled Magee system prompt + kiosk addendum>",
  "voice": "ash",
  "turn_detection": "semantic_vad",
  "input_audio_transcription": { "model": "whisper-1" },
  "temperature": 0.8,
  "tools": ["visitor_centre_info", "current_time", "weather_conditions"]
}
```

Voice candidates: `ash` or `echo` (warm male voices — test both during Phase 1).

### 6.4 Voice Tradeoff

No dedicated Irish-accented voice exists in the Realtime API. However:
- System prompt instructs the model to speak with Irish patterns, vocabulary, Kerry idioms
- The Realtime API model adjusts tone/accent based on instructions
- `ash` or `echo` (lower, warm male voices) are best candidates
- Worth the tradeoff for 30× latency improvement (100ms vs 3–6 seconds)
- `gpt-realtime-1.5` (2026-02-23) may offer improved accent following — evaluate once validated

### 6.5 Audio Pipeline Flow (Online — Primary)

1. Sensor detects visitor → Kiosk calls `GET /api/kiosk/session-config` from backend
2. Backend returns compiled system prompt + Azure credentials + session config
3. Kiosk opens WebRTC connection to Azure OpenAI Realtime API with `session.update` (see §6.3)
4. Kiosk triggers initial greeting via `response.create` with dynamic opening line (see §8.2)
5. Microphone audio streams directly to Realtime API via WebRTC
6. Realtime API returns audio deltas + transcript deltas in real-time
7. Kiosk plays audio through speaker, animates visual based on audio amplitude (see §5.5)
8. Transcripts batched and posted to `POST /api/kiosk/log` for analytics

### 6.6 Audio Pipeline Flow (Offline — Fallback)

1. Sensor detects visitor → Kiosk detects no network connectivity
2. Loads pre-recorded conversation tree from local M.2 SSD storage
3. Pre-recorded Magee greeting plays (cached TTS audio files)
4. Visitor "conversations" follow branching dialogue tree (keyword matching from local speech recognition — browser SpeechRecognition API or lightweight model)
5. Limited but functional — covers: who is Magee, the whiskey, Portmagee history, directions to tasting room
6. Visual indicator: Magee appears slightly more faded/distant (in-world: "the veil between worlds is thick today")
7. Queued transcripts sync to backend when connectivity restores

### 6.7 Session Renewal (30-minute limit)

1. Kiosk tracks `session.created.expires_at` timestamp
2. At 28 minutes: trigger natural pause — Magee: "Hold that thought..." or "Let me gather my memories..."
3. Create new session with same system prompt + conversation summary
4. Seamless transition — visitor doesn't notice the session swap
5. Most conversations will be 2–10 minutes, so this is edge-case handling

### 6.8 Echo Cancellation Strategy

| Layer | Mechanism |
|-------|-----------|
| **Primary** | `semantic_vad` in Realtime API — model intelligently distinguishes its own voice from visitor speech |
| **Defence-in-depth** | Software mic muting during Magee's speech playback (unmute 200ms after audio ends) |
| **Hardware** | ReSpeaker HAT built-in acoustic echo cancellation |
| **Interruption** | Realtime API native interrupt support — if visitor speaks during Magee's output, model detects via VAD and stops/truncates response |

---

## 7. Interaction Flow

### 7.1 Full Visitor Journey

| Phase | Trigger | Duration | What Happens |
|-------|---------|----------|--------------|
| **1. Idle** | — | Indefinite | Screen completely black. Visitor sees their own reflection. Subtle ambient ocean sound barely audible. |
| **2. Detection** | mmWave at ~2m | Instant | LED strip begins faint warm-white pulse. Kiosk pre-fetches session config from backend. |
| **3. Materialisation** | ~1.5m + linger 2–3s | ~2 seconds | Shadowy form coalesces from mist. WebRTC connection opens to Realtime API. Atmospheric sound: distant waves, creaking timber. |
| **4. Greeting** | Materialisation complete | ~5–10s | Dynamic opening line via `response.create` (see §8.2). Form becomes slightly more solid as he speaks. |
| **5. Conversation** | Visitor speaks | Open-ended | Natural back-and-forth. `semantic_vad` detects turn completion. ~100ms response. Visual animates with amplitude. Subtle brand ambassador guidance every 3–5 exchanges. Visitor can interrupt at any time. |
| **6. Farewell** | 30s silence + mmWave departure | ~5s | Dynamic parting line. Magee fades. Session closes. Logs finalised. Mirror returns. |

### 7.2 Sensor State Machine

```
IDLE ──[PIR motion]──► DETECTED ──[mmWave < 2m, 1s]──► APPROACHING
  ▲                                                         │
  │                                                    [< 1.5m, 2s]
  │                                                         ▼
  └───[mmWave > 2m, 30s]─── DEPARTING ◄──[mmWave > 2m]── PRESENT
```

---

## 8. Smart Features

### 8.1 Cross-Visitor Memory

Backend maintains a `kiosk-state` document in Cosmos DB:

```typescript
interface KioskState {
  dailyVisitorCount: number;
  totalVisitorCount: number;
  lastVisitorTimestamp: string;
  recentTopics: string[];       // last 5 conversations' key topics (extracted by model)
  memorableExchanges: string[]; // staff-curated highlights
}
```

Injected into system prompt addendum: *"You've spoken with 5 souls today. The last one asked about your ship..."*

Magee references naturally: *"You're the fifth soul to seek me out today. Word travels fast among the living."*

### 8.2 Dynamic Opening Lines

Opening line varies based on contextual signals:

| Signal | Source | Example |
|--------|--------|---------|
| **Time of day** | System clock | *"Ah, another evening visitor. The best conversations happen when the light fades..."* |
| **Weather** | BME280 sensor | *"There's a fierce chill off the Atlantic today — I can feel it, even from beyond."* |
| **Visitor count** | Cosmos DB | *"The first soul of the day! I've been waiting since dawn..."* |
| **Time since last visitor** | Cosmos DB | *"It's been quiet today. I was beginning to think the living had forgotten this place."* |

Delivered via `response.create` with custom instructions at session start.

### 8.3 Conversation Guardrails

System prompt addendum includes safety guidelines for public-facing installation:

- Stay in character at all times — never break the fourth wall about being AI
- Redirect inappropriate questions with in-character deflection
- Never discuss violence, politics, or religion in detail
- If confused, fall back to talking about the sea, the whiskey, or Portmagee
- Gently guide toward the tasting room every 3–5 exchanges (subtle brand ambassador)
- Content filter configuration on Azure OpenAI deployment
- Maximum session token limit (4,096 output) naturally bounds response length

### 8.4 LED Strip Behaviour

| State | LED Pattern |
|-------|-------------|
| Idle | Off |
| Detection | Very faint warm-white pulse (1Hz) |
| Materialising | Slowly brightening warm-white, slight amber flicker |
| Present | Steady low warm-white glow |
| Speaking | Pulse intensity tracks speech amplitude |
| Listening | Steady low glow |
| Dematerialising | Slow fade to off |

---

## 9. Reliability & Operations

### 9.1 Always-On Design

| Concern | Solution |
|---------|----------|
| **Boot storage** | M.2 SSD (not SD card — SD cards fail in 24/7 kiosks within months) |
| **Auto-start** | systemd services for sensor service + kiosk Chromium |
| **Auto-restart** | systemd `Restart=always` on all services |
| **Watchdog** | RPi hardware watchdog (`bcm2835_wdt`) reboots if system hangs |
| **Power loss** | UPS HAT — safe shutdown, clean boot on power restore |
| **Scheduling** | Opening hours on/off via RTC + cron (saves hardware wear and API costs) |
| **Health monitoring** | Heartbeat ping to `POST /api/kiosk/log` every 5 minutes |
| **Remote access** | SSH tunnel or Tailscale for remote debugging without exposing ports |
| **Azure monitoring** | App Insights integration for technical errors, latency, uptime |

### 9.2 Network Resilience

- **Primary**: Ethernet (recommended for reliability at visitor centre)
- **Fallback**: WiFi 802.11ac
- **Offline mode**: Automatic failover to pre-recorded conversation tree if both network paths fail
- **Reconnection**: Background retry with exponential backoff; seamless transition back to online mode

---

## 10. Analytics

### 10.1 Data Collected

| Metric | Source | Purpose |
|--------|--------|---------|
| Sessions per day | Kiosk log | Visitor traffic patterns |
| Average session duration | Kiosk log | Engagement quality |
| Conversation transcripts (anonymised) | Whisper-1 transcription | Topic analysis, quality improvement |
| Common topics | Model extraction | Content optimisation |
| Error rates | App Insights | Reliability monitoring |
| Network status | Kiosk heartbeat | Uptime tracking |
| Peak hours | Kiosk log | Staffing / scheduling insights |
| Engagement rate | mmWave + session start | % who speak vs. just watch |

### 10.2 Dashboard

Simple analytics page — either as a page in the existing Casting Room frontend or a separate admin interface. Key views:

- Daily/weekly/monthly visitor counts
- Average conversation length trend
- Popular topic word cloud
- Peak hours heatmap
- System uptime percentage
- Error log

---

## 11. Azure Resources

### 11.1 Existing Resources (reused)

| Resource | Name | Resource Group | Notes |
|----------|------|----------------|-------|
| Azure OpenAI | `oai-dungeon-master-njyc6qwbprtjs` | `rg-dungeon-master` | Shared instance. Deploy `gpt-realtime` or `gpt-realtime-mini` model here. Sweden Central. |
| Container App | `castingroom-api` | `rg-thecastingroom` | Backend API — add kiosk endpoints |
| Cosmos DB | `castingroom-cosmos` | `rg-thecastingroom` | Free tier — add `kiosk-state` document |
| App Insights | `castingroom-insights` | `rg-thecastingroom` | Add kiosk telemetry |
| Static Web App | `castingroom-web` | `rg-thecastingroom` | Existing frontend (not used by kiosk, but may host analytics dashboard) |

### 11.2 New Resource Required

- **Model deployment**: Deploy `gpt-realtime` (or `gpt-realtime-mini` for dev/testing) to the existing `oai-dungeon-master-njyc6qwbprtjs` Azure OpenAI resource
- **No new Azure resources** — reuses existing infrastructure

### 11.3 Networking Note

The shared OpenAI resource has `defaultAction: Deny` with VNet rules. The Container App's outbound IP (`20.240.169.142`) must be in the IP allow list. If the Container App is recreated, the outbound IP may change — re-add it:

```bash
az cognitiveservices account network-rule add \
  --name oai-dungeon-master-njyc6qwbprtjs \
  --resource-group rg-dungeon-master \
  --ip-address <outbound-ip>
```

The kiosk connects directly to Azure OpenAI Realtime API (not via the Container App backend), so the kiosk's public IP must also be allow-listed if the VNet firewall applies to direct client connections. Alternatively, the backend can proxy the WebRTC session token.

---

## 12. Implementation Phases

### Phase 1: Voice PoC with Realtime API
*Dependencies: None*

- Deploy `gpt-realtime-mini` model to existing Azure OpenAI resource
- Build minimal HTML page with WebRTC connection to Realtime API
- Use Magee's compiled system prompt (`compileSystemPrompt()` output) as `instructions`
- Test: speak into browser mic, hear Magee respond in character through speakers
- Validate: latency, voice quality, character consistency, Irish speech patterns
- **Deliverable**: Working sub-second voice conversation with Captain Magee through a browser

### Phase 2: Visual Design & Rendering *(parallel with Phase 1)*
*Dependencies: None*

- Generate Captain Magee silhouette sprite assets using AI image generation
- Build Canvas 2D "Living Shadow" renderer (see §5)
- Implement 6-layer compositing pipeline
- Build visual state machine (Mirror → Stirring → Materializing → Present → Speaking → Listening → Thinking → Dematerializing)
- Implement audio-amplitude-driven animation
- Test on RPi 5 Chromium for performance validation
- Test on actual two-way mirror glass for brightness/opacity calibration
- **Deliverable**: Animated ghostly Magee that responds to audio amplitude on RPi 5

### Phase 3: Kiosk App Integration
*Dependencies: Phase 1 + Phase 2*

- Combine voice (Phase 1) + visual (Phase 2) into unified Chromium kiosk app (Vite + TypeScript)
- Integrate Realtime API WebRTC connection with visual state machine
- Implement session config fetch from backend
- Implement transcript logging
- Implement dynamic opening lines (time, weather, visitor count)
- Add offline fallback: pre-recorded conversation tree, local keyword detection
- Build backend kiosk endpoints: `/api/kiosk/session-config`, `/api/kiosk/log`, `/api/kiosk/health`
- Implement API key authentication for kiosk endpoints
- **Deliverable**: Complete kiosk app running in Chromium, online + offline modes

### Phase 4: Hardware Assembly & Sensor Integration *(parallel with Phase 3 enclosure work)*
*Dependencies: Phase 3 (kiosk app)*

- Source all hardware (see §3.1 BOM)
- Build kiosk enclosure with period-appropriate frame
- Wire sensors to GPIO, audio, HDMI, power management (see §3.3)
- Install RPi OS + Chromium kiosk mode + M.2 SSD boot
- Build Node.js sensor service: mmWave, PIR, LEDs, BME280, local WebSocket
- Connect kiosk app to sensor service via local WebSocket
- Implement full sensor state machine (§7.2)
- Calibrate: detection distances, LED brightness, audio levels, monitor brightness behind mirror
- **Deliverable**: Fully wired, calibrated hardware installation

### Phase 5: Production Hardening
*Dependencies: Phase 4*

- systemd services: auto-start, auto-restart, watchdog
- UPS safe shutdown
- M.2 SSD boot configuration
- Opening hours scheduling via RTC + cron
- Conversation guardrails: safety system prompt addendum, content filters (§8.3)
- Cross-visitor memory: Cosmos DB `kiosk-state` document, daily counter, recent topics (§8.1)
- Session renewal logic for 30-minute limit (§6.7)
- Echo cancellation tuning: mic mute timing, VAD configuration (§6.8)
- Remote access: SSH tunnel or Tailscale
- App Insights integration
- **Deliverable**: Reliable 24/7 installation with monitoring

### Phase 6: Installation, Testing & Analytics
*Dependencies: Phase 5*

- Deploy to visitor centre
- Calibrate for actual environment: ambient light, background noise, foot traffic patterns
- Test with staff, then public visitors
- Edge case testing: groups, children, background chatter, non-English speakers
- Tune opening lines, guardrails, brand ambassador guidance based on real interactions
- Build analytics dashboard (§10)
- Iterate based on real visitor data
- **Deliverable**: Live installation with analytics and iteration plan

---

## 13. Key Files in Existing Codebase

| File | Relevance |
|------|-----------|
| `backend/src/services/prompt.service.ts` | `compileSystemPrompt()` — builds Magee's AI personality → goes into Realtime API `instructions` |
| `backend/src/services/openai.service.ts` | `AzureOpenAI` client setup, endpoint/key config → reuse pattern for Realtime API |
| `backend/scripts/seed-magee-pro.ts` | Professional Captain Magee character definition (7 sections) |
| `backend/src/types/domain.ts` | `Actor`, `Role`, `ConversationTurn` type definitions |
| `backend/src/routes/auditions/index.ts` | Existing conversation API routes — template for kiosk endpoints |
| `backend/src/plugins/auth.ts` | JWT auth patterns — kiosk endpoints adapt for API key auth |
| `backend/src/server.ts` | Fastify server setup — register new kiosk routes here |

---

## 14. Open Questions

1. **Enclosure aesthetic**: What matches the visitor centre decor? Ship's cabin porthole, gilt portrait frame, pub mirror, weathered wooden frame?
2. **Monitor size**: 32" (more intimate, face-size) vs. 43" (more imposing, life-size)?
3. **Voice selection**: Test `ash`, `echo`, `ballad` voices with Magee's system prompt to find best fit. Evaluate `gpt-realtime-1.5` for improved accent following.
4. **Avatar art generation**: Use AI image generation (Midjourney / DALL-E / Stable Diffusion) for silhouette sprites, with physical description from §2.2 as prompt.
5. **Camera / face detection**: Include RPi camera for visitor counting / face detection? Privacy implications in a public venue (GDPR considerations in an EU visitor centre).
6. **Network at visitor centre**: Ethernet available? WiFi signal strength at installation location?
7. **Azure OpenAI Realtime pricing**: Separate quota from chat completions. Estimate monthly cost based on expected visitor count × average conversation length.
8. **Realtime API deployment**: Deploy model to existing shared `oai-dungeon-master-njyc6qwbprtjs` resource, or use a separate deployment? May need project-scoped resource if shared resource only has `gpt-41-mini`.
9. **Offline content**: Who writes/records the branching dialogue tree for offline mode? Staff? Pre-generated by AI?

---

## 15. Cost Estimates

### 15.1 Hardware (One-Time)

| Tier | Components | Estimate |
|------|-----------|----------|
| **Core** | RPi 5 + SSD + sensors + display + mirror + basic enclosure | ~$550–700 |
| **Premium** | Larger display, better audio, professional enclosure, OLED panel | ~$800–1,500 |

### 15.2 Recurring (Monthly)

| Item | Estimate | Notes |
|------|----------|-------|
| Azure OpenAI Realtime API | Variable | Based on visitor count × avg conversation length. Audio tokens billed differently from text. |
| Cosmos DB | $0 | Free tier (1,000 RU/s + 25 GB) — kiosk-state document is minimal |
| Container App | ~$0 | Consumption plan, scales to zero — kiosk endpoints add negligible load |
| App Insights | ~$0 | Free tier covers expected volume |

### 15.3 Development (One-Time)

- Kiosk app (Vite + TypeScript + Canvas 2D renderer): ~1 week
- Sensor service (Node.js): ~2–3 days
- Backend kiosk endpoints: ~1 day
- Art asset generation: ~1–2 days
- Hardware assembly + calibration: ~2–3 days
- Production hardening: ~2–3 days
- Installation + testing: ~1–2 days

---

*This document captures the complete design as discussed and agreed across all planning iterations. All research, decisions, tradeoffs, and architectural choices are reflected. Ready for implementation pending resolution of open questions in §14.*
