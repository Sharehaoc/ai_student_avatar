import {
  calculateTimeDomainRms,
  normalizeTimeDomainRms,
  normalizeVoiceLevel,
} from "./audio-level.js";


export type VoiceSpeaker = "AGENT" | "USER";

export interface VoiceAudioAnalysisPort {
  attach(speaker: VoiceSpeaker, track: MediaStreamTrack): boolean;
  detach(speaker: VoiceSpeaker, track?: MediaStreamTrack): void;
  hasSource(speaker: VoiceSpeaker): boolean;
  readLevel(speaker: VoiceSpeaker, fallbackLevel: number): number;
  resume(): Promise<void>;
  close(): Promise<void>;
}

interface AnalyserEntry {
  track: MediaStreamTrack;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}

type AudioContextConstructor = new(options?: AudioContextOptions) => AudioContext;

export class BrowserVoiceAudioAnalysis implements VoiceAudioAnalysisPort {
  readonly #entries = new Map<VoiceSpeaker, AnalyserEntry>();
  #context: AudioContext | null = null;

  attach(speaker: VoiceSpeaker, track: MediaStreamTrack): boolean {
    this.detach(speaker);
    if (typeof window === "undefined" || typeof MediaStream === "undefined") return false;
    const browserWindow = window as typeof window & {
      webkitAudioContext?: AudioContextConstructor;
    };
    const AudioContextClass = window.AudioContext ?? browserWindow.webkitAudioContext;
    if (!AudioContextClass) return false;

    try {
      const context = this.#context && this.#context.state !== "closed"
        ? this.#context
        : new AudioContextClass({ latencyHint: "interactive" });
      this.#context = context;
      const stream = new MediaStream([track]);
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      this.#entries.set(speaker, {
        track,
        stream,
        source,
        analyser,
        samples: new Float32Array(analyser.fftSize),
      });
      void this.resume();
      return true;
    } catch {
      this.detach(speaker);
      return false;
    }
  }

  detach(speaker: VoiceSpeaker, track?: MediaStreamTrack): void {
    const entry = this.#entries.get(speaker);
    if (!entry || (track && entry.track !== track)) return;
    try {
      entry.source.disconnect();
    } catch {
      // 瀏覽器可能已自行釋放音訊節點。
    }
    this.#entries.delete(speaker);
  }

  hasSource(speaker: VoiceSpeaker): boolean {
    return this.#entries.has(speaker);
  }

  readLevel(speaker: VoiceSpeaker, fallbackLevel: number): number {
    const fallback = normalizeVoiceLevel(fallbackLevel);
    const entry = this.#entries.get(speaker);
    if (!entry || this.#context?.state !== "running") return fallback;
    try {
      entry.analyser.getFloatTimeDomainData(entry.samples);
      return normalizeTimeDomainRms(calculateTimeDomainRms(entry.samples));
    } catch {
      return fallback;
    }
  }

  async resume(): Promise<void> {
    if (this.#context && this.#context.state === "suspended") {
      await this.#context.resume().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    this.detach("AGENT");
    this.detach("USER");
    const context = this.#context;
    this.#context = null;
    if (context && context.state !== "closed") {
      await context.close().catch(() => undefined);
    }
  }
}
