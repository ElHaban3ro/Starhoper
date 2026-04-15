let sendFn = null;
let recording = false;

export function bindControls(send){
  sendFn = send;
  document.getElementById('btn-arm').addEventListener('click', () => send({type:'arm'}));
  document.getElementById('btn-stop').addEventListener('click', () => send({type:'emergency_stop'}));
  document.getElementById('btn-reset-i').addEventListener('click', () => send({type:'reset_integral'}));
  document.getElementById('btn-rec').addEventListener('click', () => {
    if(recording) send({type:'stop_recording'});
    else          send({type:'start_recording', filename: `session-${Date.now()}`});
  });
  document.getElementById('btn-step').addEventListener('click', () => {
    const axis = document.getElementById('step-axis').value;
    const amp  = parseFloat(document.getElementById('step-amp').value) || 10;
    const dur  = parseFloat(document.getElementById('step-dur').value) || 3;
    send({type:'run_step_test', axis, amplitude_deg: amp, duration_s: dur});
    document.getElementById('step-result').textContent = `Running step test: ${axis} ${amp}° for ${dur}s…`;
  });
}

export function setArmed(armed){
  const arm = document.getElementById('btn-arm');
  const stop = document.getElementById('btn-stop');
  const chip = document.getElementById('chip-armed');
  if(armed){
    arm.disabled = true;
    stop.disabled = false;
    chip.textContent = '● Armed';
    chip.classList.remove('err');
    chip.classList.add('ok');
  } else {
    arm.disabled = false;
    stop.disabled = true;
    chip.textContent = '● Disarmed';
    chip.classList.remove('ok');
    chip.classList.add('err');
  }
}

export function setRecording(active, filename){
  recording = !!active;
  const btn = document.getElementById('btn-rec');
  btn.classList.toggle('active', recording);
  btn.textContent = recording ? '■ STOP REC' : '● REC';
  const label = document.getElementById('rec-file');
  label.textContent = filename ? (recording ? `writing: ${short(filename)}` : `saved: ${short(filename)}`) : '';
}

function short(p){
  return p.split('/').slice(-1)[0];
}
