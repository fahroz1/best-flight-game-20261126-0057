// input.js — Keyboard (panah/WASD, P, R, M) + mouse (klik menu).
(function (global) {
  'use strict';

  function Input(canvas) {
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.clicks = []; // antrean klik {x, y} dalam koordinat canvas 1280x720
    this.onFirstGesture = null;
    this._gestured = false;
    var self = this;

    function markGesture() {
      if (!self._gestured) {
        self._gestured = true;
        if (typeof self.onFirstGesture === 'function') self.onFirstGesture();
      }
    }

    global.addEventListener('keydown', function (e) {
      markGesture();
      self.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) {
        e.preventDefault();
      }
    });
    global.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });
    global.addEventListener('blur', function () { self.keys = {}; });

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      self.mouseX = (e.clientX - r.left) * (1280 / r.width);
      self.mouseY = (e.clientY - r.top) * (720 / r.height);
    });
    canvas.addEventListener('click', function (e) {
      markGesture();
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * (1280 / r.width);
      var y = (e.clientY - r.top) * (720 / r.height);
      self.clicks.push({ x: x, y: y });
    });
  }

  Input.prototype.isDown = function (code) { return !!this.keys[code]; };

  // Tekan sekali (edge): dipakai untuk P / R / M.
  Input.prototype.pressedOnce = function (code) {
    if (this.keys[code]) { this.keys[code] = false; return true; }
    return false;
  };

  Input.prototype.pitchUp = function () {
    return this.isDown('ArrowUp') || this.isDown('KeyW');
  };
  Input.prototype.pitchDown = function () {
    return this.isDown('ArrowDown') || this.isDown('KeyS');
  };
  Input.prototype.throttleUp = function () {
    return this.isDown('ArrowRight') || this.isDown('KeyD');
  };
  Input.prototype.throttleDown = function () {
    return this.isDown('ArrowLeft') || this.isDown('KeyA');
  };

  // Ambil klik berikutnya (atau null). Dipanggil tiap frame oleh game.
  Input.prototype.nextClick = function () {
    return this.clicks.length ? this.clicks.shift() : null;
  };

  Input.prototype.clearClicks = function () { this.clicks.length = 0; };

  global.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
