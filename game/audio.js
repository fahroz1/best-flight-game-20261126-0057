// audio.js — synthesized WebAudio: engine hum follows throttle, ring chime, wind noise.

export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineGain = null, windSrc = null, windGain = null;
  let muted = false, started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 82;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(lp); osc2.connect(lp);
      lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); osc2.start();
      // Wind: looped noise buffer through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf; windSrc.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0.0;
      windSrc.connect(bp); bp.connect(windGain); windGain.connect(master);
      windSrc.start();
      started = true;
      return true;
    } catch (e) { return false; }
  }

  return {
    // Call from a user gesture (menu click / keypress) to satisfy autoplay policy.
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    update(throttle, speed, maxSpeed) {
      if (!started || !ctx) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(45 + throttle * 75, t, 0.1);
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.05 + throttle * 0.10, t, 0.1);
      windGain.gain.setTargetAtTime(muted ? 0 : 0.02 + (speed / maxSpeed) * 0.08, t, 0.2);
    },
    ring() {
      if (!started || !ctx || muted) return;
      const t = ctx.currentTime;
      [880, 1318].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.5);
        o.connect(g); g.connect(master);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.55);
      });
    },
    thud() {
      if (!started || !ctx || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.32);
    },
    fanfare() {
      if (!started || !ctx || muted) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.6);
        o.connect(g); g.connect(master);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.65);
      });
    },
  };
}
