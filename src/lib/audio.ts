// Audio helpers: one shared AudioContext, UI sounds, microphone capture with
// voice activity detection, and playback that reports its level to the orb.

export type JarvisSoundType = 'wake' | 'start' | 'stop' | 'success' | 'process' | 'error';

let sharedCtx: AudioContext | null = null;

// Chromium caps how many AudioContexts a page may hold, so every sound and every
// playback goes through this one instead of creating (and leaking) a new one.
export function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    sharedCtx = new Ctx();
  }
  if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, peak: number, type: OscillatorType = 'sine', endFreq?: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur * 0.8);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playJarvisSound(type: JarvisSoundType) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime + 0.01;
    switch (type) {
      case 'wake':
        [587.33, 880, 1174.66].forEach((f, i) => tone(ctx, f, now + i * 0.045, 0.28, 0.1));
        break;
      case 'start':
        tone(ctx, 659.25, now, 0.16, 0.08, 'sine', 1318.51);
        tone(ctx, 987.77, now, 0.16, 0.04, 'triangle', 1975.53);
        break;
      case 'stop':
        tone(ctx, 880, now, 0.15, 0.07, 'sine', 440);
        break;
      case 'success':
        [783.99, 1318.51].forEach((f, i) => tone(ctx, f, now + i * 0.05, 0.22, 0.08));
        break;
      case 'process':
        tone(ctx, 523.25, now, 0.12, 0.04);
        break;
      case 'error':
        tone(ctx, 330, now, 0.14, 0.07, 'triangle', 220);
        tone(ctx, 247, now + 0.12, 0.2, 0.06, 'triangle', 165);
        break;
    }
  } catch (e) {
    console.warn('[JARVIS] sound error', e);
  }
}

/* --------------------------------------------------------------------------
   Microphone capture with voice activity detection
   -------------------------------------------------------------------------- */

export type RecordingEnd =
  | { reason: 'speech'; wavBase64: string; durationMs: number }
  | { reason: 'no-speech' | 'cancelled' };

export interface RecorderOptions {
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  /** Silence after speech that ends the utterance */
  endSilenceMs?: number;
  /** Give up if nobody speaks for this long */
  noSpeechTimeoutMs?: number;
  maxDurationMs?: number;
  /** Lowest RMS level that can count as speech (raise it to ignore quiet background sound) */
  minLevel?: number;
  /** How long sound must last before it counts as speech */
  startAfterMs?: number;
  /** Utterances shorter than this are dropped */
  minSpeechMs?: number;
}

const TARGET_RATE = 16000;

export class MicRecorder {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private finished = false;
  private resolveEnd: ((r: RecordingEnd) => void) | null = null;

  /** Resolves once the utterance ends (or nothing was said). */
  async record(opts: RecorderOptions = {}): Promise<RecordingEnd> {
    const endSilenceMs = opts.endSilenceMs ?? 1300;
    const noSpeechTimeoutMs = opts.noSpeechTimeoutMs ?? 8000;
    const maxDurationMs = opts.maxDurationMs ?? 25000;
    const minLevel = opts.minLevel ?? 0.012;
    const startAfterMs = opts.startAfterMs ?? 120;
    const minSpeechMs = opts.minSpeechMs ?? 250;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (this.finished) {
      // Cancelled while the permission prompt / device was opening
      this.stream.getTracks().forEach(t => t.stop());
      return { reason: 'cancelled' };
    }

    const ctx = getAudioContext();
    await ctx.resume().catch(() => {});
    const rate = ctx.sampleRate;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.processor = ctx.createScriptProcessor(2048, 1, 1);
    // ScriptProcessor only runs while connected to the destination; keep it silent.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(ctx.destination);

    const frameMs = (2048 / rate) * 1000;
    const preRollFrames = Math.ceil(400 / frameMs);
    let elapsed = 0;
    let noiseFloor = 0.004;
    let calibrated = 0;
    let speaking = false;
    let speechMs = 0;
    let loudRun = 0;
    let silenceMs = 0;

    return new Promise<RecordingEnd>((resolve) => {
      this.resolveEnd = resolve;
      this.processor!.onaudioprocess = (ev) => {
        if (this.finished) return;
        const frame = new Float32Array(ev.inputBuffer.getChannelData(0));
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        const rms = Math.sqrt(sum / frame.length);
        elapsed += frameMs;
        opts.onLevel?.(Math.min(1, rms * 9));

        // Learn the room's noise level during the first ~250 ms, then keep adapting slowly
        if (calibrated < 250) {
          noiseFloor = calibrated === 0 ? rms : noiseFloor * 0.7 + rms * 0.3;
          calibrated += frameMs;
        } else if (!speaking) {
          noiseFloor = noiseFloor * 0.97 + Math.min(rms, noiseFloor * 2) * 0.03;
        }
        const threshold = Math.max(minLevel, noiseFloor * 2.8);
        const loud = rms > threshold;

        if (!speaking) {
          this.preRoll.push(frame);
          if (this.preRoll.length > preRollFrames) this.preRoll.shift();
          loudRun = loud ? loudRun + frameMs : 0;
          // ~120 ms of sustained sound counts as speech, so clicks don't trigger it
          if (loudRun >= startAfterMs) {
            speaking = true;
            this.chunks.push(...this.preRoll);
            this.preRoll = [];
            opts.onSpeechStart?.();
          } else if (elapsed > noSpeechTimeoutMs) {
            this.finish({ reason: 'no-speech' });
          }
          return;
        }

        this.chunks.push(frame);
        speechMs += frameMs;
        silenceMs = loud ? 0 : silenceMs + frameMs;
        if (silenceMs >= endSilenceMs || speechMs >= maxDurationMs) {
          if (speechMs - silenceMs < minSpeechMs) {
            this.finish({ reason: 'no-speech' });
          } else {
            const wavBase64 = encodeWav(this.chunks, rate);
            this.finish({ reason: 'speech', wavBase64, durationMs: speechMs });
          }
        }
      };
    });
  }

  /** Stop now and send what was captured so far. */
  stopAndSend() {
    if (this.finished) return;
    if (this.chunks.length === 0) {
      this.finish({ reason: 'no-speech' });
      return;
    }
    const rate = getAudioContext().sampleRate;
    this.finish({ reason: 'speech', wavBase64: encodeWav(this.chunks, rate), durationMs: 0 });
  }

  cancel() {
    this.finish({ reason: 'cancelled' });
  }

  private finish(result: RecordingEnd) {
    if (this.finished) return;
    this.finished = true;
    try { if (this.processor) this.processor.onaudioprocess = null; } catch { /* ignore */ }
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { this.processor?.disconnect(); } catch { /* ignore */ }
    try { this.sink?.disconnect(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach(t => t.stop());
    this.chunks = [];
    this.preRoll = [];
    this.resolveEnd?.(result);
    this.resolveEnd = null;
  }
}

// 16 kHz mono 16-bit WAV: small, and a format Gemini accepts for audio input.
function encodeWav(chunks: Float32Array[], inputRate: number): string {
  let length = 0;
  for (const c of chunks) length += c.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }

  const ratio = inputRate / TARGET_RATE;
  const outLength = Math.floor(merged.length / ratio);
  const pcm = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    // Average the source samples that fall into this output sample (simple low-pass)
    const start = Math.floor(i * ratio);
    const end = Math.min(merged.length, Math.floor((i + 1) * ratio));
    let acc = 0;
    for (let j = start; j < end; j++) acc += merged[j];
    const s = Math.max(-1, Math.min(1, acc / Math.max(1, end - start)));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return bytesToBase64(new Uint8Array(wavFromPcm(pcm, TARGET_RATE)));
}

function wavFromPcm(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);
  return buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* --------------------------------------------------------------------------
   Playback through the shared context, with a live level for the orb
   -------------------------------------------------------------------------- */

export interface Playback {
  done: Promise<void>;
  stop: () => void;
}

export async function playAudio(bytes: Uint8Array, mimeType: string, onLevel?: (l: number) => void): Promise<Playback> {
  const ctx = getAudioContext();
  await ctx.resume().catch(() => {});

  let buffer: AudioBuffer;
  const isPcm = /audio\/(l16|pcm)/i.test(mimeType);
  if (isPcm) {
    // Raw little-endian 16-bit PCM (what Gemini TTS returns)
    const pcmRate = parseInt((mimeType.match(/rate=(\d+)/) || [])[1] || '24000', 10);
    const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
    const samples = new Int16Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 2));
    buffer = ctx.createBuffer(1, samples.length, pcmRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 0x8000;
  } else {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    buffer = await ctx.decodeAudioData(copy);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  src.connect(analyser);
  analyser.connect(ctx.destination);

  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 4));
    raf = requestAnimationFrame(tick);
  };

  const done = new Promise<void>((resolve) => {
    src.onended = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      onLevel?.(0);
      try { src.disconnect(); analyser.disconnect(); } catch { /* ignore */ }
      resolve();
    };
  });

  src.start();
  tick();

  return {
    done,
    stop: () => { try { src.stop(); } catch { /* already stopped */ } },
  };
}
