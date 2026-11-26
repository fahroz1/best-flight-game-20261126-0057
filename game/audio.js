// audio.js — Suara synth WebAudio: mesin, angin, lonceng ring.
// Tanpa file audio. Tidak ada suara sebelum interaksi pertama user.
(function (global) {
  'use strict';

  function AudioEngine() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.windSource = null;
    this.windGain = null;
    this.windFilter = null;
    this.started = false;
  }

  // Harus dipanggil dari gesture user (klik / tombol) — anti autoplay.
  AudioEngine.prototype.ensure = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC();
    this.ctx = ctx;

    // Mesin: dua osilator sawtooth ber-detune lewat lowpass.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 70;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 71.5;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Angin: noise buffer putih lewat bandpass, gain mengikuti kecepatan.
    var len = ctx.sampleRate * 2;
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    this.windSource.start();
    this.started = true;
  };

  // Dipanggil tiap frame saat terbang: throttle 0..1, speed m/s.
  AudioEngine.prototype.updateFlight = function (throttle, speed) {
    if (!this.ctx || this.muted) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.windGain) this.windGain.gain.value = 0;
      return;
    }
    var t = this.ctx.currentTime;
    var rpm = 55 + throttle * 90;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.015, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(300 + throttle * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.045 + throttle * 0.06, t, 0.1);
    var windLevel = Math.min(0.12, Math.max(0, (speed - 20) * 0.0016));
    this.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(400 + speed * 9, t, 0.2);
  };

  AudioEngine.prototype.stopFlight = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.1);
  };

  AudioEngine.prototype._tone = function (freq, dur, type, vol, when) {
    if (!this.ctx || this.muted) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    var start = ctx.currentTime + (when || 0);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol || 0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  };

  // Lonceng ring: arpeggio tiga nada cerah.
  AudioEngine.prototype.ring = function () {
    this._tone(880, 0.35, 'sine', 0.2, 0);
    this._tone(1318.5, 0.4, 'sine', 0.16, 0.07);
    this._tone(1760, 0.5, 'sine', 0.12, 0.14);
  };

  AudioEngine.prototype.click = function () {
    this._tone(660, 0.08, 'triangle', 0.12, 0);
  };

  AudioEngine.prototype.crash = function () {
    if (!this.ctx || this.muted) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.65);
  };

  // Fanfare pendek saat mendarat mulus.
  AudioEngine.prototype.landed = function () {
    this._tone(523.25, 0.25, 'triangle', 0.18, 0);
    this._tone(659.25, 0.25, 'triangle', 0.18, 0.12);
    this._tone(783.99, 0.4, 'triangle', 0.2, 0.24);
    this._tone(1046.5, 0.6, 'triangle', 0.18, 0.38);
  };

  AudioEngine.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (m) this.stopFlight();
  };

  global.AudioEngine = AudioEngine;
})(typeof window !== 'undefined' ? window : globalThis);
