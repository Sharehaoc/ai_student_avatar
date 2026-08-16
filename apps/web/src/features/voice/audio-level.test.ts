import { describe, expect, it } from "vitest";

import {
  calculateTimeDomainRms,
  normalizeTimeDomainRms,
  normalizeVoiceLevel,
  smoothAudioLevel,
} from "./audio-level.js";


describe("audio level", () => {
  it("從實際音軌樣本計算 RMS，並移除背景底噪", () => {
    expect(calculateTimeDomainRms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(normalizeTimeDomainRms(0.01)).toBe(0);
    expect(normalizeTimeDomainRms(0.18)).toBe(1);
  });

  it("音量一律限制在可安全套用介面的 0 到 1", () => {
    expect(normalizeVoiceLevel(-1)).toBe(0);
    expect(normalizeVoiceLevel(0.48)).toBe(0.48);
    expect(normalizeVoiceLevel(2)).toBe(1);
    expect(normalizeVoiceLevel(Number.NaN)).toBe(0);
  });

  it("上升快、下降慢，避免語音動畫在字與字之間閃爍", () => {
    const rising = smoothAudioLevel(0, 1, 70);
    const falling = smoothAudioLevel(1, 0, 70);
    expect(rising).toBeGreaterThan(1 - falling);
    expect(rising).toBeGreaterThan(0);
    expect(falling).toBeLessThan(1);
  });
});
