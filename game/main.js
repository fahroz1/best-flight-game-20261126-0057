// main.js — Boot + game loop Langit Nusantara.
// Membaca ?shot=menu|cover|night|landing&seed=N untuk adegan screenshot
// deterministik, lalu menjalankan loop requestAnimationFrame.
(function (global) {
  'use strict';

  function boot() {
    var canvas = document.getElementById('game');
    if (!canvas || !canvas.getContext) {
      var fb = document.getElementById('fallback');
      if (fb) fb.style.display = 'block';
      return;
    }
    var game = new global.Game(canvas);
    global.__langitGame = game;

    var params = new URLSearchParams(global.location.search || '');
    var shot = params.get('shot');
    var seed = parseInt(params.get('seed') || '1', 10);
    if (shot) {
      game.setupShot(shot, isNaN(seed) ? 1 : seed);
    }

    var last = performance.now();
    function frame(now) {
      var dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp saat tab tidak aktif
      if (dt < 0) dt = 0;
      game.timeSec += dt;
      game.update(dt);
      game.render();
      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
