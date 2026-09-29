// AudioWorklet: converts mic Float32 frames to 16-bit PCM and posts ~100ms chunks.
// The AudioContext is created at 16 kHz, which is what the Gemini Live API expects.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1600; // 100ms @ 16kHz
    this.buf = new Int16Array(this.size);
    this.i = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      const s = Math.max(-1, Math.min(1, ch[k]));
      this.buf[this.i++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.i === this.size) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(this.size);
        this.i = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
