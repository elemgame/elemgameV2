type AudioCue =
  | 'moveSelect'
  | 'commit'
  | 'roundWin'
  | 'roundLose'
  | 'roundDraw'
  | 'matchWin'
  | 'matchLose'
  | 'matchDraw'
  | 'overclock'
  | 'timerTick';

const STORAGE_KEY = 'elmental.soundEnabled';

let audioContext: AudioContext | null = null;
let lastTimerTickAt = 0;

export function isAudioEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAudioEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures; audio can still follow the in-memory Zustand state.
  }
  if (enabled) void resumeAudio();
}

export function playSound(cue: AudioCue): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);

  const now = ctx.currentTime + 0.01;
  switch (cue) {
    case 'moveSelect':
      tone(ctx, 620, now, 0.055, 'triangle', 0.055);
      tone(ctx, 930, now + 0.035, 0.05, 'triangle', 0.035);
      break;
    case 'commit':
      sweep(ctx, 240, 520, now, 0.16, 'sine', 0.045);
      break;
    case 'roundWin':
      tone(ctx, 523, now, 0.09, 'triangle', 0.055);
      tone(ctx, 659, now + 0.08, 0.11, 'triangle', 0.055);
      tone(ctx, 784, now + 0.17, 0.13, 'triangle', 0.05);
      break;
    case 'roundLose':
      sweep(ctx, 180, 82, now, 0.2, 'sawtooth', 0.05);
      break;
    case 'roundDraw':
      tone(ctx, 392, now, 0.08, 'sine', 0.04);
      tone(ctx, 392, now + 0.12, 0.08, 'sine', 0.035);
      break;
    case 'matchWin':
      tone(ctx, 523, now, 0.11, 'triangle', 0.06);
      tone(ctx, 659, now + 0.11, 0.11, 'triangle', 0.06);
      tone(ctx, 784, now + 0.22, 0.14, 'triangle', 0.06);
      tone(ctx, 1046, now + 0.36, 0.22, 'triangle', 0.055);
      break;
    case 'matchLose':
      sweep(ctx, 220, 92, now, 0.36, 'sawtooth', 0.055);
      tone(ctx, 73, now + 0.2, 0.16, 'sine', 0.035);
      break;
    case 'matchDraw':
      tone(ctx, 330, now, 0.14, 'sine', 0.045);
      tone(ctx, 440, now + 0.14, 0.14, 'sine', 0.045);
      break;
    case 'overclock':
      noise(ctx, now, 0.18, 0.045);
      sweep(ctx, 860, 160, now, 0.18, 'square', 0.035);
      break;
    case 'timerTick':
      if (Date.now() - lastTimerTickAt < 450) return;
      lastTimerTickAt = Date.now();
      tone(ctx, 880, now, 0.035, 'square', 0.025);
      break;
  }
}

export async function resumeAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  await ctx.resume().catch(() => undefined);
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext = new AudioContextCtor();
  return audioContext;
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function sweep(
  ctx: AudioContext,
  from: number,
  to: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(ctx: AudioContext, start: number, duration: number, volume: number): void {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration);
}
