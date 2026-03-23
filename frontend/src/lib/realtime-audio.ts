// ============================================================
// The Casting Room — Realtime Audio (WebSocket + Web Audio API)
// Connects to Azure OpenAI Realtime API via backend WS relay.
// Browser captures mic → PCM16 base64 → WS → backend → Azure.
// Azure → backend → WS → PCM16 decode → AudioContext playback.
// ============================================================

export interface RealtimeCallbacks {
  onStateChange: (state: "connecting" | "connected" | "disconnected" | "error") => void;
  onSpeechStarted: () => void;
  onSpeechStopped: () => void;
  onResponseStarted: () => void;
  onResponseDone: () => void;
  onTranscriptDelta: (role: "user" | "assistant", text: string, isFinal: boolean) => void;
  onAmplitude: (rms: number) => void;
  onError: (error: string) => void;
}

// Realtime API uses 24kHz 16-bit mono PCM
const REALTIME_SAMPLE_RATE = 24000;

export class RealtimeAudioSession {
  private ws: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private captureWorklet: AudioWorkletNode | null = null;
  private amplitudeIntervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: RealtimeCallbacks;
  private destroyed = false;

  // Playback queue — schedule PCM16 chunks for gapless output
  private playbackTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  // Mic ducking — stop forwarding mic while AI audio plays to prevent echo triggers
  private micForwardingPaused = false;
  private localRmsAboveThreshold = 0;
  private resumeForwardingTimeout: ReturnType<typeof setTimeout> | null = null;
  // Echo through speakers is typically 0.05–0.15 RMS at the mic; real speech is 0.2–0.6
  private static readonly RMS_THRESHOLD = 0.3;
  private static readonly RMS_FRAMES_REQUIRED = 6;
  private static readonly RESUME_GRACE_MS = 800;
  // After stopping playback on interruption, keep mic muted to let echo/reverb decay
  private static readonly POST_INTERRUPT_MUTE_MS = 250;

  // Track whether the server has an active response in flight
  private responseActive = false;

  // Track current response output item for truncation on interruption
  private currentResponseItemId: string | null = null;
  private responseAudioMs = 0;
  private responseAudioStartTime = 0;

  // Accumulated transcripts
  private userTranscriptBuffer = "";
  private assistantTranscriptBuffer = "";
  private transcripts: Array<{ role: "user" | "assistant"; content: string; timestamp: string }> = [];

  constructor(callbacks: RealtimeCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to the backend WebSocket relay.
   * @param wsUrl Full WebSocket URL including auth token query param
   */
  async connect(wsUrl: string) {
    if (this.destroyed) return;
    this.callbacks.onStateChange("connecting");

    try {
      // Get microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: REALTIME_SAMPLE_RATE },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Single AudioContext for both capture and playback — improves browser AEC
      // (echo cancellation correlates playback output with mic input in one context)
      this.audioCtx = new AudioContext({ sampleRate: REALTIME_SAMPLE_RATE });
      const source = this.audioCtx.createMediaStreamSource(this.localStream);

      // AudioWorklet for mic capture → PCM16 base64
      const processorCode = `
        class CaptureProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const ch = inputs[0]?.[0];
            if (ch && ch.length > 0) {
              this.port.postMessage(ch);
            }
            return true;
          }
        }
        registerProcessor('capture-processor', CaptureProcessor);
      `;
      const blob = new Blob([processorCode], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      await this.audioCtx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.captureWorklet = new AudioWorkletNode(this.audioCtx, "capture-processor");
      this.captureWorklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;

        if (this.micForwardingPaused) {
          // Mic is ducked — check local amplitude for real speech (interruption)
          const rms = computeRms(ev.data);
          if (rms > RealtimeAudioSession.RMS_THRESHOLD) {
            this.localRmsAboveThreshold++;
            if (this.localRmsAboveThreshold >= RealtimeAudioSession.RMS_FRAMES_REQUIRED) {
              this.handleLocalInterruption();
              // Don't forward this frame — it was captured while AI audio was
              // still playing and likely contains echo. Clean audio will flow
              // after the post-interruption mute expires.
            }
          } else {
            this.localRmsAboveThreshold = 0;
          }
          return;
        }

        const pcm16 = float32ToPcm16Base64(ev.data);
        this.ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: pcm16,
        }));
      };
      source.connect(this.captureWorklet);
      // AudioWorklet needs a destination to keep processing
      this.captureWorklet.connect(this.audioCtx.destination);

      this.playbackTime = this.audioCtx.currentTime;

      // Set up amplitude analysis on the playback context
      this.setupAmplitudeAnalysis();

      // Connect WebSocket to backend relay
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.callbacks.onStateChange("connected");
      };

      this.ws.onmessage = (ev) => this.handleMessage(ev);

      this.ws.onclose = (ev) => {
        if (!this.destroyed) {
          this.callbacks.onStateChange("disconnected");
        }
      };

      this.ws.onerror = () => {
        this.callbacks.onError("WebSocket connection error");
        this.callbacks.onStateChange("error");
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.onError(msg);
      this.callbacks.onStateChange("error");
    }
  }

  /** Send a response.create event to trigger the AI to speak first (greeting) */
  triggerGreeting() {
    this.sendEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  }

  private sendEvent(event: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  private handleMessage(ev: MessageEvent) {
    try {
      const event = JSON.parse(ev.data);
      switch (event.type) {
        case "session.created":
        case "session.updated":
          break;

        case "input_audio_buffer.speech_started":
          this.callbacks.onSpeechStarted();
          this.userTranscriptBuffer = "";
          break;

        case "input_audio_buffer.speech_stopped":
          this.callbacks.onSpeechStopped();
          break;

        case "conversation.item.input_audio_transcription.completed":
          if (event.transcript) {
            this.userTranscriptBuffer = event.transcript;
            this.callbacks.onTranscriptDelta("user", event.transcript, true);
            this.transcripts.push({
              role: "user",
              content: event.transcript,
              timestamp: new Date().toISOString(),
            });
          }
          break;

        case "response.audio_transcript.delta":
          if (event.delta) {
            this.assistantTranscriptBuffer += event.delta;
            this.callbacks.onTranscriptDelta("assistant", this.assistantTranscriptBuffer, false);
          }
          break;

        case "response.audio_transcript.done":
          if (this.assistantTranscriptBuffer) {
            this.callbacks.onTranscriptDelta("assistant", this.assistantTranscriptBuffer, true);
            this.transcripts.push({
              role: "assistant",
              content: this.assistantTranscriptBuffer,
              timestamp: new Date().toISOString(),
            });
            this.assistantTranscriptBuffer = "";
          }
          break;

        case "response.audio.delta":
          if (event.delta) {
            this.playAudioChunk(event.delta);
          }
          break;

        case "response.output_item.added":
          if (event.item?.id) {
            this.currentResponseItemId = event.item.id;
            this.responseAudioMs = 0;
          }
          break;

        case "response.created":
          this.responseActive = true;
          this.responseAudioStartTime = this.audioCtx?.currentTime ?? 0;
          this.callbacks.onResponseStarted();
          this.assistantTranscriptBuffer = "";
          break;

        case "response.done":
          this.responseActive = false;
          this.callbacks.onResponseDone();
          break;

        case "error": {
          const errMsg: string = event.error?.message || "Realtime API error";
          const lower = errMsg.toLowerCase();
          // Suppress benign errors that don't affect functionality
          if (lower.includes("cancellation failed")) break;
          if (lower.includes("already shorter than")) break;
          this.callbacks.onError(errMsg);
          break;
        }
      }
    } catch {
      // Ignore malformed messages
    }
  }

  /** Decode base64 PCM16 and schedule for gapless playback */
  private playAudioChunk(base64Pcm16: string) {
    if (!this.audioCtx) return;

    const pcm16 = base64ToInt16Array(base64Pcm16);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.audioCtx.createBuffer(1, float32.length, REALTIME_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);

    // Schedule after previous chunk for gapless playback
    const now = this.audioCtx.currentTime;
    const startAt = Math.max(now, this.playbackTime);
    source.start(startAt);
    this.playbackTime = startAt + buffer.duration;

    // Accumulate audio duration in ms for truncation
    this.responseAudioMs += Math.round((float32.length / REALTIME_SAMPLE_RATE) * 1000);

    // Track source for interruption stop
    this.activeSources.push(source);
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx >= 0) this.activeSources.splice(idx, 1);
    };

    // Pause mic forwarding while AI audio is playing
    if (!this.micForwardingPaused) {
      this.micForwardingPaused = true;
      this.localRmsAboveThreshold = 0;
    }
    // Cancel any pending resume since new audio arrived
    if (this.resumeForwardingTimeout) {
      clearTimeout(this.resumeForwardingTimeout);
      this.resumeForwardingTimeout = null;
    }
  }

  private setupAmplitudeAnalysis() {
    if (!this.audioCtx) return;

    this.amplitudeIntervalId = setInterval(() => {
      // If playback is actively happening, provide non-zero amplitude
      if (this.audioCtx && this.playbackTime > this.audioCtx.currentTime) {
        // Audio is playing — estimate amplitude
        this.callbacks.onAmplitude(0.3 + Math.random() * 0.2);
      } else {
        this.callbacks.onAmplitude(0);
        // AI audio finished — schedule mic resume after grace period
        if (this.micForwardingPaused && !this.resumeForwardingTimeout) {
          this.resumeForwardingTimeout = setTimeout(() => {
            this.micForwardingPaused = false;
            this.localRmsAboveThreshold = 0;
            this.resumeForwardingTimeout = null;
          }, RealtimeAudioSession.RESUME_GRACE_MS);
        }
      }
    }, 33); // ~30fps
  }

  /** Stop all in-flight playback and truncate the server conversation per docs */
  private handleLocalInterruption() {
    // Calculate how much audio was actually played before interruption.
    // Clamp to responseAudioMs so we never ask the server to truncate beyond
    // the audio it actually sent (wall-clock includes pre-audio latency).
    let audioEndMs = 0;
    if (this.audioCtx) {
      const playedSeconds = Math.max(0, this.audioCtx.currentTime - this.responseAudioStartTime);
      audioEndMs = Math.min(Math.round(playedSeconds * 1000), this.responseAudioMs);
    }

    // Stop all scheduled audio sources
    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already ended */ }
    }
    this.activeSources = [];

    // Reset playback time
    if (this.audioCtx) {
      this.playbackTime = this.audioCtx.currentTime;
    }

    // Send conversation.item.truncate per docs to remove unplayed audio
    // The server auto-cancels the response when VAD detects speech
    if (this.currentResponseItemId) {
      this.sendEvent({
        type: "conversation.item.truncate",
        item_id: this.currentResponseItemId,
        content_index: 0,
        audio_end_ms: audioEndMs,
      });
    }
    this.responseActive = false;
    this.currentResponseItemId = null;
    this.responseAudioMs = 0;

    // Keep mic ducked briefly to let speaker echo/reverb decay before resuming.
    // The server already detected speech via VAD, so it knows the user is talking.
    // We schedule mic resume after a short mute to avoid feeding echo back in.
    this.localRmsAboveThreshold = 0;
    if (this.resumeForwardingTimeout) {
      clearTimeout(this.resumeForwardingTimeout);
    }
    this.resumeForwardingTimeout = setTimeout(() => {
      this.micForwardingPaused = false;
      this.localRmsAboveThreshold = 0;
      this.resumeForwardingTimeout = null;
    }, RealtimeAudioSession.POST_INTERRUPT_MUTE_MS);

    // Notify UI
    this.callbacks.onSpeechStarted();
  }

  getTranscripts() {
    return [...this.transcripts];
  }

  disconnect() {
    this.destroyed = true;

    if (this.amplitudeIntervalId) {
      clearInterval(this.amplitudeIntervalId);
      this.amplitudeIntervalId = null;
    }

    if (this.resumeForwardingTimeout) {
      clearTimeout(this.resumeForwardingTimeout);
      this.resumeForwardingTimeout = null;
    }

    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already ended */ }
    }
    this.activeSources = [];

    if (this.captureWorklet) {
      this.captureWorklet.disconnect();
      this.captureWorklet = null;
    }

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
  }
}

/* ── Audio encoding helpers ── */

function float32ToPcm16Base64(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToInt16Array(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function computeRms(float32: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) {
    sum += float32[i] * float32[i];
  }
  return Math.sqrt(sum / float32.length);
}
