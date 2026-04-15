export function updateMotors(motors, cfg){
  const max = (cfg && cfg.MOTOR_MAX) || 6;
  const sat = motors.sat || [false,false,false,false];
  ['m1','m2','m3','m4'].forEach((k,i) => {
    const el = document.querySelector(`.motor[data-motor="${k}"]`);
    if(!el) return;
    const v = motors[k] ?? 0;
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    el.querySelector('.fill').style.width = pct + '%';
    el.querySelector('.val').textContent = v.toFixed(2);
    el.classList.toggle('sat', !!sat[i]);
  });
}

export function updateThrottle(v){
  // v in [-1, 1]. Center = 0 = hover. Left half = descend, right = climb.
  const fill = document.getElementById('throttle-fill');
  const label = document.getElementById('throttle-val');
  if(!fill) return;
  const pct = Math.min(Math.abs(v), 1) * 50;
  if(v >= 0){
    fill.style.left = '50%';
    fill.style.width = pct + '%';
    fill.style.background = 'var(--accent)';
  } else {
    fill.style.left = (50 - pct) + '%';
    fill.style.width = pct + '%';
    fill.style.background = 'var(--warn)';
  }
  label.textContent = (v >= 0 ? '+' : '') + (v*100).toFixed(0) + '%';
}
