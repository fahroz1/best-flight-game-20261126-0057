// input.js — keyboard + mouse state for menus and flight controls.

export function createInput() {
  const keys = {};
  const pressed = {}; // edge-triggered, consumed by the game loop
  const mouse = { x: 0, y: 0, clicked: false, clickX: 0, clickY: 0 };

  const KEYMAP = {
    ArrowUp: 'pitchUp', ArrowDown: 'pitchDown',
    ArrowLeft: 'rollLeft', ArrowRight: 'rollRight',
    KeyW: 'throttleUp', KeyS: 'throttleDown',
    KeyC: 'camera', KeyP: 'pause', KeyR: 'restart', KeyM: 'mute',
    Escape: 'pause', Enter: 'confirm',
  };

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (action) {
      if (!keys[action]) pressed[action] = true;
      keys[action] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    }
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) keys[action] = false;
  }
  function onMouseMove(e) { mouse.x = e.clientX; mouse.y = e.clientY; }
  function onMouseDown(e) {
    mouse.clicked = true; mouse.clickX = e.clientX; mouse.clickY = e.clientY;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);

  return {
    // Held keys.
    get pitchUp() { return !!keys.pitchUp; },
    get pitchDown() { return !!keys.pitchDown; },
    get rollLeft() { return !!keys.rollLeft; },
    get rollRight() { return !!keys.rollRight; },
    get throttleUp() { return !!keys.throttleUp; },
    get throttleDown() { return !!keys.throttleDown; },
    // Edge-triggered: true once after the key goes down.
    consume(action) {
      if (pressed[action]) { pressed[action] = false; return true; }
      return false;
    },
    consumeClick() {
      if (mouse.clicked) {
        mouse.clicked = false;
        return { x: mouse.clickX, y: mouse.clickY };
      }
      return null;
    },
    // Flight stick values from held keys: pitch -1..1 (up positive), roll -1..1.
    stick() {
      return {
        pitch: (this.pitchUp ? 1 : 0) - (this.pitchDown ? 1 : 0),
        roll: (this.rollLeft ? 1 : 0) - (this.rollRight ? 1 : 0),
        throttleDelta: (this.throttleUp ? 0.55 : 0) - (this.throttleDown ? 0.55 : 0),
      };
    },
  };
}
