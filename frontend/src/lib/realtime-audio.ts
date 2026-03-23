// ============================================================
// The Casting Room — Realtime Audio (WebRTC + Audio Playback)
// Connects to Azure OpenAI Realtime API via WebRTC
// ============================================================

export interface RealtimeTokenData {
  token: string;
  endpoint: string;
  expiresAt: string;
}

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

export class RealtimeAudioSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private amplitudeIntervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: RealtimeCallbacks;
  private destroyed = false;
  private model: string;

  // Accumulated transcripts
  private userTranscriptBuffer = "";
  private assistantTranscriptBuffer = "";
  private transcripts: Array<{ role: "user" | "assistant"; content: string; timestamp: string }> = [];

  constructor(callbacks: RealtimeCallbacks, model: string) {
    this.callbacks = callbacks;
    this.model = model;
  }

  async connect(tokenData: RealtimeTokenData) {
    if (this.destroyed) return;
    this.callbacks.onStateChange("connecting");

    try {
      // Get microphone
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create peer connection
      this.pc = new RTCPeerConnection();

      // Add mic track
      for (const track of this.localStream.getAudioTracks()) {
        this.pc.addTrack(track, this.localStream);
      }

      // Handle remote audio (AI voice)
      this.audioElement = document.createElement("audio");
      this.audioElement.autoplay = true;

      this.pc.ontrack = (ev) => {
        if (this.audioElement && ev.streams[0]) {
          this.audioElement.srcObject = ev.streams[0];
          this.setupAmplitudeAnalysis(ev.streams[0]);
        }
      };

      // Data channel for Realtime API events
      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onopen = () => {
        this.callbacks.onStateChange("connected");
      };
      this.dc.onmessage = (ev) => this.handleDataChannelMessage(ev);
      this.dc.onclose = () => {
        if (!this.destroyed) {
          this.callbacks.onStateChange("disconnected");
        }
      };

      // Create and set local offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Send SDP to Azure OpenAI Realtime API
      const baseUrl = tokenData.endpoint.replace(/\/$/, "");
      const sdpUrl = `${baseUrl}/openai/realtimeConnections?api-version=2025-04-01-preview&deployment=${this.model}`;

      const sdpRes = await fetch(sdpUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpRes.ok) {
        const err = await sdpRes.text();
        throw new Error(`SDP exchange failed (${sdpRes.status}): ${err}`);
      }

      const answerSdp = await sdpRes.text();
      await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
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

  /** Send an event through the data channel */
  private sendEvent(event: Record<string, unknown>) {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(event));
    }
  }

  private handleDataChannelMessage(ev: MessageEvent) {
    try {
      const event = JSON.parse(ev.data);
      switch (event.type) {
        case "session.created":
          // Session ready
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

  private setupAmplitudeAnalysis(stream: MediaStream) {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.amplitudeIntervalId = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.callbacks.onAmplitude(rms);
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

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }

    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }

    if (this.audioElement) {
      this.audioElement.srcObject = null;
      this.audioElement = null;
    }
  }
}
