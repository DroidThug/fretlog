// AudioWorklet: forwards raw mono input in 512-sample chunks with the sample-accurate start frame,
// so onset times share the AudioContext clock used to schedule the metronome.
class SampleTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(512); this.n = 0; this.start = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        if (this.n === 0) this.start = currentFrame + i;
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage({ start: this.start, data: this.buf }); this.buf = new Float32Array(512); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("sample-tap", SampleTap);
