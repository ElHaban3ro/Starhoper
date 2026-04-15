/** On-screen pilot controls + optional browser keyboard capture.
 *  State is a single {throttle,pitch,roll,yaw} object in [-1,1] per axis.
 *  Every change is debounced-coalesced and sent as {type:'pilot_input', ...}
 *  to Python via WebSocket. */

const KEY_MAP = {
  'w': {axis: 'pitch',    dir:  1},
  's': {axis: 'pitch',    dir: -1},
  'd': {axis: 'roll',     dir:  1},
  'a': {axis: 'roll',     dir: -1},
  'e': {axis: 'yaw',      dir:  1},
  'q': {axis: 'yaw',      dir: -1},
  'ArrowUp':   {axis: 'throttle', dir:  1},
  'ArrowDown': {axis: 'throttle', dir: -1},
};

// Track individual button (mouse) state so combined axis value = sum of
// pressed directions. Key state tracked separately.
const mouseDown = new Set();   // "axis:dir"
const keyDown = new Set();     // "axis:dir"

let sendFn = null;
let lastSent = {throttle:0, pitch:0, roll:0, yaw:0};

export function initPilot(send){
  sendFn = send;

  // Bind on-screen buttons.
  document.querySelectorAll('.pkey').forEach(btn => {
    const axis = btn.dataset.axis;
    const dir = parseInt(btn.dataset.dir, 10);
    const press = () => { mouseDown.add(keyOf(axis, dir)); btn.classList.add('active'); syncState(); };
    const release = () => { mouseDown.delete(keyOf(axis, dir)); btn.classList.remove('active'); syncState(); };
    btn.addEventListener('mousedown', e => { e.preventDefault(); press(); });
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
    btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, {passive: false});
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
  });

  // Keyboard on the whole window. Ignore when typing into an input/select.
  window.addEventListener('keydown', e => {
    if(isTypingTarget(e.target)) return;
    const m = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
    if(!m) return;
    e.preventDefault();
    keyDown.add(keyOf(m.axis, m.dir));
    highlight(m.axis, m.dir, true);
    syncState();
  });
  window.addEventListener('keyup', e => {
    const m = KEY_MAP[e.key] || KEY_MAP[e.key.toLowerCase()];
    if(!m) return;
    keyDown.delete(keyOf(m.axis, m.dir));
    highlight(m.axis, m.dir, false);
    syncState();
  });
  // Safety: if the window loses focus, clear everything.
  window.addEventListener('blur', () => {
    keyDown.clear();
    mouseDown.clear();
    document.querySelectorAll('.pkey.active').forEach(el => el.classList.remove('active'));
    syncState();
  });
}

function keyOf(axis, dir){ return `${axis}:${dir}`; }

function isTypingTarget(el){
  if(!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function highlight(axis, dir, on){
  const btn = document.querySelector(`.pkey[data-axis="${axis}"][data-dir="${dir}"]`);
  if(btn) btn.classList.toggle('active', on);
}

function readAxis(axis){
  let v = 0;
  if(mouseDown.has(keyOf(axis,  1)) || keyDown.has(keyOf(axis,  1))) v += 1;
  if(mouseDown.has(keyOf(axis, -1)) || keyDown.has(keyOf(axis, -1))) v -= 1;
  return v;
}

function syncState(){
  const state = {
    throttle: readAxis('throttle'),
    pitch: readAxis('pitch'),
    roll: readAxis('roll'),
    yaw: readAxis('yaw'),
  };
  if(state.throttle === lastSent.throttle && state.pitch === lastSent.pitch
     && state.roll === lastSent.roll && state.yaw === lastSent.yaw){
    return;
  }
  lastSent = state;
  if(sendFn) sendFn({type: 'pilot_input', ...state});
}
