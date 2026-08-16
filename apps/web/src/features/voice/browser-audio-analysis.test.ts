import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserVoiceAudioAnalysis } from "./browser-audio-analysis.js";


afterEach(() => vi.unstubAllGlobals());

describe("BrowserVoiceAudioAnalysis", () => {
  it("從 MediaStreamTrack 建立分析器並讀取真實時域音量", async () => {
    const disconnect = vi.fn();
    const close = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    class FakeAudioContext {
      state: AudioContextState = "running";
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect };
      }
      createAnalyser() {
        return {
          fftSize: 4,
          smoothingTimeConstant: 0,
          getFloatTimeDomainData(samples: Float32Array) {
            for (let index = 0; index < samples.length; index += 1) {
              samples[index] = index % 2 === 0 ? 0.1 : -0.1;
            }
          },
        };
      }
      close = close;
      resume = resume;
    }
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    vi.stubGlobal("MediaStream", class {
      constructor(_tracks: MediaStreamTrack[]) {}
    });
    const analysis = new BrowserVoiceAudioAnalysis();
    const track = {} as MediaStreamTrack;

    expect(analysis.attach("USER", track)).toBe(true);
    expect(analysis.readLevel("USER", 0)).toBeGreaterThan(0);
    analysis.detach("USER", track);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await analysis.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
