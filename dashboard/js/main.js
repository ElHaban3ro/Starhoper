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
      setArmed(msg.armed);
      break;
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

function onTelemetry(t){
  setChip('chip-unity', t.connected_unity ? '● Unity' : '● Unity', t.connected_unity ? 'ok' : '');
  show('chip-failsafe', t.failsafe);
  show('chip-rec', t.recording);

  updateAttitude(t.euler);
  updateMotors(t.motors, lastConfig);
  updateThrottle(t.pilot.throttle);
  pushTelemetry(t);
  updateVelocity(t);
  setReadout(t);
}

function setReadout(t){
  document.getElementById('ro-roll').textContent  = t.euler[0].toFixed(1);
  document.getElementById('ro-pitch').textContent = t.euler[1].toFixed(1);
  document.getElementById('ro-yaw').textContent   = t.euler[2].toFixed(1);
  document.getElementById('ro-tilt').textContent  = t.tilt.toFixed(1);
  const a = t.accel;
  const mag = Math.hypot(a[0], a[1], a[2]);
  document.getElementById('ro-accel').textContent = mag.toFixed(2);
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
