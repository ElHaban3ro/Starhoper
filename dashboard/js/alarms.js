const active = new Map();   // rule_id -> event

export function renderAlarmRules(rules, send){
  const root = document.getElementById('alarm-rules');
  root.innerHTML = '';
  for(const [rule_id, r] of Object.entries(rules || {})){
    const div = document.createElement('div');
    div.className = 'alarm-rule';
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" ${r.enabled ? 'checked' : ''}/> ${r.label}`;
    const num = document.createElement('input');
    num.type = 'number';
    num.step = 'any';
    num.value = r.threshold;
    const cb = lbl.querySelector('input');
    cb.addEventListener('change', () => send({type:'set_alarm', rule: rule_id, enabled: cb.checked}));
    num.addEventListener('change', () => send({type:'set_alarm', rule: rule_id, threshold: parseFloat(num.value)||0}));
    div.appendChild(lbl);
    div.appendChild(num);
    root.appendChild(div);
  }
}

export function applyAlarmEvent(ev){
  if(ev.active) active.set(ev.rule, ev);
  else active.delete(ev.rule);
  renderActive();
}

export function setAllActiveAlarms(list){
  active.clear();
  for(const ev of list) active.set(ev.rule, ev);
  renderActive();
}

export function renderActive(){
  const root = document.getElementById('alarm-active');
  root.innerHTML = '';
  if(active.size === 0){
    root.textContent = '(none)';
    root.classList.add('muted');
    return;
  }
  root.classList.remove('muted');
  for(const ev of active.values()){
    const div = document.createElement('div');
    div.className = 'alarm-active-item';
    div.textContent = `${ev.label}  (value=${(+ev.value).toFixed(2)}, threshold=${ev.threshold})`;
    root.appendChild(div);
  }
}

// re-exported name kept for main.js
export { renderActive as renderActiveAlarms };
