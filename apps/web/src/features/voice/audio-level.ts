export function normalizeVoiceLevel(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(Math.max(numericValue, 0), 1);
}

export function calculateTimeDomainRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sumOfSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Number(samples[index]);
    if (Number.isFinite(sample)) sumOfSquares += sample * sample;
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

export function normalizeTimeDomainRms(
  value: unknown,
  { noiseFloor = 0.015, speechCeiling = 0.18 } = {},
): number {
  const rms = Number(value);
  if (!Number.isFinite(rms) || rms <= noiseFloor) return 0;
  const usableRange = Math.max(0.001, speechCeiling - noiseFloor);
  return normalizeVoiceLevel((rms - noiseFloor) / usableRange);
}

export function smoothAudioLevel(
  previous: unknown,
  target: unknown,
  elapsedMs: unknown,
): number {
  const from = normalizeVoiceLevel(previous);
  const to = normalizeVoiceLevel(target);
  const duration = Math.max(0, Number(elapsedMs) || 0);
  const timeConstantMs = to > from ? 70 : 180;
  const amount = 1 - Math.exp(-duration / timeConstantMs);
  return from + ((to - from) * amount);
}
