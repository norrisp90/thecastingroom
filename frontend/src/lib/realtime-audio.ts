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
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private captureWorklet: AudioWorkletNode | null = null;
  private amplitudeIntervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: RealtimeCallbacks;
  private destroyed = false;

  // Playback queue — schedule PCM16 chunks for gapless output
  private playbackTime = 0;

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
        audio: { sampleRate: { ideal: REALTIME_SAMPLE_RATE }, channelCount: 1, echoCancellation: true },
      });

      // Set up capture AudioContext
      this.captureCtx = new AudioContext({ sampleRate: REALTIME_SAMPLE_RATE });
      const source = this.captureCtx.createMediaStreamSource(this.localStream);

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
      await this.captureCtx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.captureWorklet = new AudioWorkletNode(this.captureCtx, "capture-processor");
      this.captureWorklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const pcm16 = float32ToPcm16Base64(ev.data);
          this.ws.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: pcm16,
          }));
        }
      };
      source.connect(this.captureWorklet);
      // AudioWorklet needs a destination to keep processing
      this.captureWorklet.connect(this.captureCtx.destination);

      // Set up playback AudioContext at 24kHz
      this.playbackCtx = new AudioContext({ sampleRate: REALTIME_SAMPLE_RATE });
      this.playbackTime = this.playbackCtx.currentTime;

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

        case "response.created":
          this.callbacks.onResponseStarted();
          this.assistantTranscriptBuffer = "";
          break;

        case "response.done":
          this.callbacks.onResponseDone();
          break;

        case "error":
          this.callbacks.onError(event.error?.message || "Realtime API error");
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }

  /** Decode base64 PCM16 and schedule for gapless playback */
  private playAudioChunk(base64Pcm16: string) {
    if (!this.playbackCtx) return;

    const pcm16 = base64ToInt16Array(base64Pcm16);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }

    const buffer = this.playbackCtx.createBuffer(1, float32.length, REALTIME_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = this.playbackCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackCtx.destination);

    // Schedule after previous chunk for gapless playback
    const now = this.playbackCtx.currentTime;
    const startAt = Math.max(now, this.playbackTime);
    source.start(startAt);
    this.playbackTime = startAt + buffer.duration;
  }

  private setupAmplitudeAnalysis() {
    if (!this.playbackCtx) return;

    // Use an AnalyserNode on the playback destination to measure output amplitude
    const analyser = this.playbackCtx.createAnalyser();
    analyser.fftSize = 256;

    // We can't tap into destination directly, but we measure from scheduled sources
    // via a gain node splitter. For simplicity, estimate from playback timing.
    // Instead, measure from the capture stream (mic) for input and use playback timing for output.
    // For the shadow renderer, we use a combined approach:
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    this.amplitudeIntervalId = setInterval(() => {
      // If playback is actively happening, provide non-zero amplitude
      if (this.playbackCtx && this.playbackTime > this.playbackCtx.currentTime) {
        // Audio is playing — estimate amplitude
        this.callbacks.onAmplitude(0.3 + Math.random() * 0.2);
      } else {
        this.callbacks.onAmplitude(0);
      }
    }, 33); // ~30fps
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

    if (this.captureWorklet) {
      this.captureWorklet.disconnect();
      this.captureWorklet = null;
    }

    if (this.captureCtx) {
      this.captureCtx.close().catch(() => {});
      this.captureCtx = null;
    }

    if (this.playbackCtx) {
      this.playbackCtx.close().catch(() => {});
      this.playbackCtx = null;
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
