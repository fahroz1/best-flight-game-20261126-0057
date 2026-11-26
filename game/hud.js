// hud.js — DOM HUD (altitude, speed, heading, fuel, damage, score, rings) + attitude indicator.

export function createHud(doc) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    alt: $('hud-alt'), spd: $('hud-spd'), hdg: $('hud-hdg'), fuel: $('hud-fuel'),
    fuelBar: $('hud-fuelbar'), dmg: $('hud-dmg'), dmgBar: $('hud-dmgbar'),
    score: $('hud-score'), rings: $('hud-rings'), msg: $('hud-msg'),
    compass: $('hud-compass'), att: $('hud-att'),
  };
  const attCtx = el.att.getContext('2d');

  function compassStrip(headingDeg) {
    // Ticks every 15 deg across +-45 deg; labels only on 45-deg cardinals.
    const dirs = { 0: 'U', 45: 'TL', 90: 'T', 135: 'TG', 180: 'S', 225: 'BD', 270: 'B', 315: 'BL' };
    let out = '';
    for (let d = -45; d <= 45; d += 15) {
      let h = (headingDeg + d) % 360;
      if (h < 0) h += 360;
      const snapped = Math.round(h / 45) * 45 % 360;
      const isCardinal = Math.abs(h - snapped) < 8 || Math.abs(h - snapped) > 352;
      const label = isCardinal ? (dirs[snapped] || String(snapped)) : '|';
      const off = (d / 45) * 46;
      out += `<span style="left:${50 + off}%">${label}</span>`;
    }
    return out;
  }

  function drawAttitude(pitch, roll) {
    const c = attCtx, W = 140, H = 140, cx = W / 2, cy = H / 2;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(cx, cy, 64, 0, Math.PI * 2); c.clip();
    c.translate(cx, cy);
    c.rotate(-roll);
    const py = pitch * 90;
    c.fillStyle = '#2f7fd0'; c.fillRect(-80, -80 + py, 160, 80 - py + 80);
    c.fillStyle = '#7a5a34'; c.fillRect(-80, py, 160, 160);
    c.fillStyle = '#fff';
    c.fillRect(-46, py - 1, 92, 2);
    c.fillRect(-46, py - 26, 30, 2); c.fillRect(16, py - 26, 30, 2);
    c.fillRect(-46, py + 24, 30, 2); c.fillRect(16, py + 24, 30, 2);
    c.restore();
    // Fixed aircraft symbol.
    c.strokeStyle = '#ffe14d'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx - 34, cy); c.lineTo(cx - 8, cy); c.moveTo(cx + 8, cy); c.lineTo(cx + 34, cy);
    c.moveTo(cx, cy); c.lineTo(cx, cy + 8);
    c.stroke();
    c.beginPath(); c.arc(cx, cy, 64, 0, Math.PI * 2);
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
  }

  return {
    update(f, level, ringsLeft, timeSec) {
      const hdgDeg = Math.round(((-f.yaw * 180 / Math.PI) % 360 + 360) % 360);
      el.alt.textContent = Math.max(0, Math.round(f.y * 3.28)) + ' ft';
      el.spd.textContent = Math.round(f.speed * 1.94) + ' kt';
      el.hdg.textContent = String(hdgDeg).padStart(3, '0') + '°';
      el.compass.innerHTML = compassStrip(hdgDeg);
      el.fuel.textContent = Math.round(f.fuel) + '%';
      el.fuelBar.style.width = Math.max(0, f.fuel) + '%';
      el.fuelBar.style.background = f.fuel < 25 ? '#ff5040' : '#37d67a';
      el.dmg.textContent = Math.round(f.damage) + '%';
      el.dmgBar.style.width = Math.min(100, f.damage) + '%';
      el.score.textContent = String(f.score);
      el.rings.textContent = ringsLeft + ' / ' + level.rings.length;
      drawAttitude(f.pitch, f.roll);
    },
    message(text, ms) {
      el.msg.textContent = text;
      el.msg.style.opacity = '1';
      if (ms) setTimeout(() => { el.msg.style.opacity = '0'; }, ms);
    },
    clearMessage() { el.msg.textContent = ''; },
  };
}
