'use client';

export function bufToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToInt16(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Splits an analyser's spectrum into `n` bands (0–1), focused on the speech range. */
export function readBands(analyser: AnalyserNode | null, n: number): number[] {
  if (!analyser) return new Array(n).fill(0);
  const d = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(d);
  const usable = Math.floor(d.length * 0.6); // skip the top of the spectrum (little speech energy)
  const per = Math.max(1, Math.floor(usable / n));
  const out: number[] = [];
  for (let b = 0; b < n; b++) {
    let sum = 0;
    for (let i = b * per; i < (b + 1) * per; i++) sum += d[i] ?? 0;
    out.push(Math.min(1, sum / per / 200));
  }
  return out;
}

/** Microphone → 16 kHz PCM16 chunks (with echo cancellation so the user can barge in over the speaker). */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  enabled = true;

  async start(onChunk: (b64: string) => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule('/worklets/pcm-capture.js');
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.node = new AudioWorkletNode(this.ctx, 'pcm-capture');
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.enabled) onChunk(bufToBase64(e.data));
    };
    src.connect(this.analyser);
    src.connect(this.node);
  }

  level() {
    if (!this.analyser) return 0;
    const d = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(d);
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v - 128));
    return peak / 128;
  }

  bands(n: number) {
    return this.enabled ? readBands(this.analyser, n) : new Array(n).fill(0);
  }

  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = this.stream = this.node = this.analyser = null;
  }
}

/** Gapless 24 kHz PCM16 playback queue; `interrupt()` stops everything instantly (barge-in). */
export class Player {
  private ctx: AudioContext | null = null;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private out: AnalyserNode | null = null;
  onIdle?: () => void;

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 24000 });
      // All speech goes through an analyser so the UI can draw a live equalizer.
      this.out = this.ctx.createAnalyser();
      this.out.fftSize = 128;
      this.out.smoothingTimeConstant = 0.6;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Call from a user gesture so mobile browsers allow audio. */
  unlock() {
    this.ensure();
  }

  play(b64: string, mimeType?: string) {
    const ctx = this.ensure();
    const rate = Number(/rate=(\d+)/.exec(mimeType ?? '')?.[1]) || 24000;
    const pcm = base64ToInt16(b64);
    const f = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 0x8000;
    const buf = ctx.createBuffer(1, f.length, rate);
    buf.copyToChannel(f, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out ?? ctx.destination);
    const at = Math.max(this.next, ctx.currentTime + 0.02);
    src.start(at);
    this.next = at + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (!this.sources.size) this.onIdle?.();
    };
  }

  bands(n: number) {
    return this.sources.size ? readBands(this.out, n) : new Array(n).fill(0);
  }

  get speaking() {
    return this.sources.size > 0;
  }

  interrupt() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.next = 0;
  }

  close() {
    this.interrupt();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.out = null;
  }
}
