import { initAttitude, updateAttitude } from './attitude.js';
import { initCharts, pushTelemetry } from './charts.js';
import { updateMotors, updateThrottle } from './motors.js';
import { renderParams, updateParamValue } from './params.js';
import { renderProfiles, bindProfileButtons } from './profiles.js';
import { initVelocity, updateVelocity } from './velocity.js';
import { bindControls, setArmed, setRecording } from './controls.js';
import { renderAlarmRules, renderActiveAlarms, applyAlarmEvent, setAllActiveAlarms } from './alarms.js';
import { appendLog, replayLog } from './log.js';
import { handleStepResult } from './steptest.js';
import { initPilot } from './pilot.js';

const wsUrl = `ws://${location.hostname || 'localhost'}:3031`;
let ws = null;
let reconnectTimer = null;
let schema = [];
let lastConfig = {};

function send(obj){
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(obj));
  }
}
window.send = send;  // debug

function connect(){
  clearTimeout(reconnectTimer);
  setChip('chip-dash', 'connecting…', 'warn');
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    setChip('chip-dash', '● Dashboard', 'ok');
    send({type:'hello'});
  };
  ws.onmessage = ev => {
    let msg;
    try{ msg = JSON.parse(ev.data); } catch { return; }
    route(msg);
  };
  ws.onclose = () => {
    setChip('chip-dash', '● Dashboard (disconnected)', 'err');
    setChip('chip-unity', '● Unity', '');
    reconnectTimer = setTimeout(connect, 1500);
  };
  ws.onerror = () => {/* close handler will retry */};
}

function route(msg){
  switch(msg.type){
    case 'hello':
      schema = msg.schema;
      lastConfig = msg.config;
      renderParams(schema, lastConfig, send);
      renderProfiles(msg.profiles);
      renderAlarmRules(msg.alarm_rules, send);
      setAllActiveAlarms(msg.active_alarms || []);
      setArmed(msg.armed);
      setRecording(msg.recording, null);
      break;
    case 'telemetry':
      onTelemetry(msg);
      break;
    case 'param_applied':
      lastConfig[msg.key] = msg.value;
      updateParamValue(msg.key, msg.value);
      break;
    case 'profile_list':
      renderProfiles(msg.profiles);
      break;
    case 'profile_applied':
      lastConfig = msg.config;
      renderParams(schema, lastConfig, send);
      break;
    case 'armed_state':
      _lastArmed = msg.armed;
      setArmed(msg.armed, _lastLandingActive || false);
      break;
    case 'landing_state': {
      const ls = document.getElementById('landing-state');
      if (ls) ls.textContent = msg.state;
      _lastLandingActive = !!msg.active;
      setArmed(_lastArmed ?? false, _lastLandingActive);
      break;
    }
    case 'recording_state':
      setRecording(msg.active, msg.filename);
      break;
    case 'alarm':
      applyAlarmEvent(msg);
      break;
    case 'alarm_rules':
      renderAlarmRules(msg.rules, send);
      break;
    case 'step_result':
      handleStepResult(msg);
      break;
    case 'log':
      appendLog(msg.line);
      break;
    case 'log_snapshot':
      replayLog(msg.lines);
      break;
    case 'integral_reset':
      /* info only */
      break;
    case 'error':
      console.warn('server error:', msg.message);
      break;
  }
}

let _lastArmed = null;
let _lastLandingActive = null;
function onTelemetry(t){
  setChip('chip-unity', t.connected_unity ? '● Unity' : '● Unity', t.connected_unity ? 'ok' : '');
  show('chip-failsafe', t.failsafe);
  show('chip-rec', t.recording);
  const landingActive = !!(t.landing && t.landing.active);
  if (t.armed !== _lastArmed || landingActive !== _lastLandingActive) {
    _lastArmed = t.armed;
    _lastLandingActive = landingActive;
    setArmed(t.armed, landingActive);
  }

  updateAttitude(t.euler);
  updateMotors(t.motors, lastConfig);
  updateThrottle(t.pilot.throttle);
  pushTelemetry(t);
  updateVelocity(t);
  setReadout(t);
}

function setReadout(t){
  const r = t.euler[0].toFixed(1);
  const p = t.euler[1].toFixed(1);
  const y = t.euler[2].toFixed(1);
  const ti = t.tilt.toFixed(1);
  document.getElementById('ro-roll').textContent  = r;
  document.getElementById('ro-pitch').textContent = p;
  document.getElementById('ro-yaw').textContent   = y;
  document.getElementById('ro-tilt').textContent  = ti;
  document.getElementById('hd-roll').textContent  = r;
  document.getElementById('hd-pitch').textContent = p;
  document.getElementById('hd-yaw').textContent   = y;
  document.getElementById('hd-tilt').textContent  = ti;
  const thrPct = Math.round((t.pilot?.throttle ?? 0) * 100);
  document.getElementById('hd-thr').textContent = thrPct;
  const sonars = t.sonars || {};
  for (const dir of ['down','front','back','left','right']) {
    const s = sonars[dir] || {distance:-1, valid:false, status:'init'};
    const valEl = document.getElementById('sn-' + dir);
    const stEl  = document.getElementById('ss-' + dir);
    if (valEl && stEl) {
      valEl.textContent = s.valid ? `${s.distance.toFixed(2)} m` : '—';
      stEl.textContent = s.status;
      stEl.className = s.valid ? 'ok' : 'warn';
      valEl.parentElement.classList.toggle('invalid', !s.valid);
    }
    const hdEl = document.getElementById('hd-' + dir);
    if (hdEl) {
      hdEl.textContent = s.valid ? s.distance.toFixed(2) : '—';
      hdEl.parentElement.classList.toggle('invalid', !s.valid);
    }
  }
  const a = t.accel;
  const mag = Math.hypot(a[0], a[1], a[2]);
  document.getElementById('ro-accel').textContent = mag.toFixed(2);
  if (t.landing) {
    const ls = document.getElementById('landing-state');
    if (ls) ls.textContent = t.landing.state;
    show('chip-landing', !!t.landing.active);
  }
}

function setChip(id, text, cls){
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove('ok','warn','err');
  if(cls) el.classList.add(cls);
}
function show(id, visible){
  const el = document.getElementById(id);
  el.classList.toggle('hidden', !visible);
}

initAttitude(document.getElementById('attitude-canvas'));
initCharts();
initVelocity(document.getElementById('velocity-canvas'));
initPilot(send);
bindControls(send);
bindProfileButtons(send, () => lastConfig);

connect();
