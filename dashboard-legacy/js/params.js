/**
 * Auto-generates slider+input widgets from SCHEMA entries.
 * Groups by section. Debounced set_param on any change.
 */

const DEBOUNCE_MS = 150;

let sendFn = null;
let pending = new Map();  // key -> timeout id
const widgets = new Map();  // key -> {el, refresh(val)}

const ACTIVE_TAB_KEY = 'paramsActiveTab';

export function renderParams(schema, config, send){
  sendFn = send;
  const root = document.getElementById('params-body');
  root.innerHTML = '';
  widgets.clear();

  const sections = {};
  for(const entry of schema){
    const s = entry.section || 'Misc';
    (sections[s] = sections[s] || []).push(entry);
  }

  const tabBar = document.createElement('div');
  tabBar.className = 'param-tabs';
  const panes = document.createElement('div');
  panes.className = 'param-panes';

  const names = Object.keys(sections);
  const remembered = localStorage.getItem(ACTIVE_TAB_KEY);
  const initial = names.includes(remembered) ? remembered : names[0];

  for(const name of names){
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'param-tab';
    tab.dataset.tab = name;
    tab.textContent = name;
    tab.addEventListener('click', () => activate(name));
    tabBar.appendChild(tab);

    const pane = document.createElement('div');
    pane.className = 'param-pane';
    pane.dataset.tab = name;
    for(const e of sections[name]){
      pane.appendChild(renderOne(e, config[e.key]));
    }
    panes.appendChild(pane);
  }

  function activate(name){
    localStorage.setItem(ACTIVE_TAB_KEY, name);
    tabBar.querySelectorAll('.param-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    panes.querySelectorAll('.param-pane').forEach(p => {
      p.classList.toggle('active', p.dataset.tab === name);
    });
  }

  root.appendChild(tabBar);
  root.appendChild(panes);
  activate(initial);
}

function renderOne(entry, value){
  const wrap = document.createElement('div');
  wrap.className = 'param';

  const lbl = document.createElement('div');
  lbl.className = 'param-label';
  lbl.innerHTML = `<span class="k">${entry.label}${entry.derived ? ' <span class="readonly-tag">auto</span>' : ''}</span><span class="v"></span>`;
  wrap.appendChild(lbl);
  const valEl = lbl.querySelector('.v');

  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.textContent = entry.tooltip || '';
  wrap.appendChild(tip);

  const ctrl = document.createElement('div');
  ctrl.className = 'param-ctrl';

  let refresh;

  if(entry.type === 'bool'){
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    cb.disabled = !!entry.derived;
    cb.addEventListener('change', () => emit(entry.key, cb.checked));
    ctrl.appendChild(cb);
    refresh = v => { cb.checked = !!v; valEl.textContent = v ? 'true' : 'false'; };
  } else if(entry.type === 'vec3'){
    const grid = document.createElement('div');
    grid.className = 'vec3';
    const inputs = [0,1,2].map(i => {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.step = entry.step ?? 0.001;
      inp.min = entry.min;
      inp.max = entry.max;
      inp.disabled = !!entry.derived;
      inp.value = (value && value[i] != null) ? value[i] : 0;
      inp.addEventListener('input', () => {
        const vec = inputs.map(x => parseFloat(x.value) || 0);
        emit(entry.key, vec);
      });
      grid.appendChild(inp);
      return inp;
    });
    ctrl.appendChild(grid);
    refresh = v => {
      for(let i=0;i<3;i++){
        inputs[i].value = (v && v[i] != null) ? v[i] : 0;
      }
      valEl.textContent = Array.isArray(v) ? `[${v.map(x => (+x).toFixed(3)).join(', ')}]` : '';
    };
  } else {
    const isInt = entry.type === 'int';
    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = entry.min;
    rng.max = entry.max;
    rng.step = entry.step ?? (isInt ? 1 : 0.01);
    rng.value = value ?? 0;
    rng.disabled = !!entry.derived;
    const num = document.createElement('input');
    num.type = 'number';
    num.step = entry.step ?? (isInt ? 1 : 0.01);
    num.min = entry.min;
    num.max = entry.max;
    num.value = value ?? 0;
    num.disabled = !!entry.derived;
    rng.addEventListener('input', () => { num.value = rng.value; emit(entry.key, parseFloat(rng.value)); });
    num.addEventListener('input', () => { rng.value = num.value; emit(entry.key, parseFloat(num.value)); });
    ctrl.appendChild(rng);
    ctrl.appendChild(num);
    refresh = v => {
      rng.value = v ?? 0;
      num.value = v ?? 0;
      valEl.textContent = (+v).toPrecision(4);
    };
  }
  wrap.appendChild(ctrl);
  refresh(value);
  widgets.set(entry.key, { refresh });
  return wrap;
}

function emit(key, value){
  if(!sendFn) return;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => {
    sendFn({type: 'set_param', key, value});
  }, DEBOUNCE_MS));
}

export function updateParamValue(key, value){
  const w = widgets.get(key);
  if(w) w.refresh(value);
}
