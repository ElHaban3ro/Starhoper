/**
 * Sequencer card: editable ordered list of stages with HTML5 drag-and-drop.
 * Sync strategy: client edits the in-memory stages (server `set_sequence`
 * on every change). Run/Stop map to run_sequence / stop_sequence. Save/
 * Load/Delete operate on named JSON files server-side.
 */

let sendFn = null;
let stages = [];
let savedList = [];
let dragFromIdx = null;

export function bindSequencer(send) {
  sendFn = send;
  document.getElementById('btn-seq-add').addEventListener('click', onAdd);
  document.getElementById('btn-seq-run').addEventListener('click', () => {
    const loop = document.getElementById('seq-loop').checked;
    sendFn({ type: 'run_sequence', stages, loop });
  });
  document.getElementById('btn-seq-stop').addEventListener('click', () => {
    sendFn({ type: 'stop_sequence' });
  });
  document.getElementById('btn-seq-load').addEventListener('click', onLoad);
  document.getElementById('btn-seq-save').addEventListener('click', onSave);
  document.getElementById('btn-seq-delete').addEventListener('click', onDelete);
}

export function setSequenceList(list) {
  savedList = list || [];
  const sel = document.getElementById('seq-select');
  const prev = sel.value;
  sel.innerHTML = '';
  for (const s of savedList) {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.name;
    sel.appendChild(opt);
  }
  if (savedList.some(s => s.name === prev)) sel.value = prev;
}

export function setStages(newStages) {
  stages = Array.isArray(newStages) ? newStages.map(s => ({ ...s })) : [];
  renderStages();
}

export function updateRunState(snap) {
  const statusEl = document.getElementById('seq-status');
  const bar = document.getElementById('seq-progress-bar');
  if (!snap || !snap.active) {
    statusEl.textContent = 'idle';
    statusEl.className = 'muted';
    bar.style.width = '0%';
    document.querySelectorAll('#seq-stages .seq-row').forEach(r => r.classList.remove('running'));
    return;
  }
  const idx = snap.current_idx;
  const total = snap.total_stages;
  const type = snap.current_type || '';
  const dur = snap.current_duration_s || 0;
  const el = snap.elapsed_s || 0;
  let label = `[${idx + 1}/${total}] ${type}`;
  if (dur > 0) label += ` ${el.toFixed(1)}s / ${dur.toFixed(1)}s`;
  if (snap.state === 'waiting_landing') label += ' (waiting landing)';
  statusEl.textContent = label;
  statusEl.className = 'ok';
  const pct = dur > 0 ? Math.min(100, (el / dur) * 100) : (snap.state === 'waiting_landing' ? 100 : 0);
  bar.style.width = `${pct}%`;
  document.querySelectorAll('#seq-stages .seq-row').forEach((r, i) => {
    r.classList.toggle('running', i === idx);
  });
}

function onAdd() {
  const type = document.getElementById('seq-add-type').value;
  stages.push(defaultStage(type));
  pushStages();
  renderStages();
}

function defaultStage(type) {
  if (type === 'throttle') return { type, duration_s: 5, value: 0, pitch_deg: 0, roll_deg: 0 };
  if (type === 'attitude') return { type, duration_s: 3, pitch_deg: 0, roll_deg: 0 };
  if (type === 'heading') return { type, duration_s: 3, direction: 'N' };
  if (type === 'wait') return { type, duration_s: 2 };
  if (type === 'landing') return { type, direction: '', controlled: false, pitch_deg: 0, roll_deg: 0 };
  return { type };
}

function onLoad() {
  const name = document.getElementById('seq-select').value;
  if (!name) return;
  sendFn({ type: 'load_sequence', name });
}

function onSave() {
  const suggested = document.getElementById('seq-select').value || 'sequence';
  const name = prompt('Sequence name:', suggested);
  if (!name) return;
  sendFn({ type: 'save_sequence', name, stages });
}

function onDelete() {
  const name = document.getElementById('seq-select').value;
  if (!name) return;
  if (!confirm(`Delete sequence "${name}"?`)) return;
  sendFn({ type: 'delete_sequence', name });
}

function pushStages() {
  // Keep server's in-memory stages in sync with UI edits.
  sendFn({ type: 'set_sequence', stages });
}

function renderStages() {
  const root = document.getElementById('seq-stages');
  root.innerHTML = '';
  stages.forEach((stage, i) => root.appendChild(renderStageRow(stage, i)));
}

function renderStageRow(stage, i) {
  const row = document.createElement('div');
  row.className = 'seq-row';
  row.draggable = true;
  row.dataset.idx = String(i);

  const handle = document.createElement('span');
  handle.className = 'seq-handle';
  handle.textContent = '⋮⋮';
  row.appendChild(handle);

  const idx = document.createElement('span');
  idx.className = 'seq-idx';
  idx.textContent = String(i + 1);
  row.appendChild(idx);

  const typeSel = document.createElement('select');
  typeSel.className = 'seq-type';
  for (const t of ['throttle', 'attitude', 'heading', 'wait', 'arm', 'disarm', 'landing']) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    if (t === stage.type) o.selected = true;
    typeSel.appendChild(o);
  }
  typeSel.addEventListener('change', () => {
    stages[i] = defaultStage(typeSel.value);
    pushStages();
    renderStages();
  });
  row.appendChild(typeSel);

  const params = document.createElement('span');
  params.className = 'seq-params';
  addParams(params, stage, i);
  row.appendChild(params);

  const del = document.createElement('button');
  del.className = 'seq-del';
  del.textContent = '✕';
  del.title = 'Remove stage';
  del.addEventListener('click', () => {
    stages.splice(i, 1);
    pushStages();
    renderStages();
  });
  row.appendChild(del);

  // Drag-and-drop handlers (HTML5 native).
  row.addEventListener('dragstart', (e) => {
    dragFromIdx = i;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    document.querySelectorAll('#seq-stages .seq-row').forEach(r => r.classList.remove('drop-target'));
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drop-target');
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drop-target');
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('drop-target');
    if (dragFromIdx === null || dragFromIdx === i) return;
    const moved = stages.splice(dragFromIdx, 1)[0];
    stages.splice(i, 0, moved);
    dragFromIdx = null;
    pushStages();
    renderStages();
  });

  return row;
}

function addParams(parent, stage, i) {
  const addCheckbox = (label, key, onChange) => {
    const wrap = document.createElement('label');
    wrap.className = 'seq-param';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!stage[key];
    cb.addEventListener('change', () => {
      stages[i][key] = cb.checked;
      pushStages();
      if (onChange) onChange();
    });
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' ' + label));
    parent.appendChild(wrap);
  };
  const addDirection = (label, key, optional) => {
    const wrap = document.createElement('label');
    wrap.className = 'seq-param';
    wrap.textContent = label + ' ';
    const sel = document.createElement('select');
    if (optional) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '—';
      sel.appendChild(o);
    }
    for (const d of ['N', 'E', 'S', 'W']) {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d;
      sel.appendChild(o);
    }
    sel.value = stage[key] ?? (optional ? '' : 'N');
    sel.addEventListener('change', () => {
      stages[i][key] = sel.value;
      pushStages();
    });
    wrap.appendChild(sel);
    parent.appendChild(wrap);
  };
  const addNumber = (label, key, step, min, max) => {
    const wrap = document.createElement('label');
    wrap.className = 'seq-param';
    wrap.textContent = label + ' ';
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = String(step);
    if (min !== undefined) inp.min = String(min);
    if (max !== undefined) inp.max = String(max);
    inp.value = stage[key] ?? 0;
    inp.addEventListener('input', () => {
      let v = parseFloat(inp.value);
      if (isNaN(v)) v = 0;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      stages[i][key] = v;
      pushStages();
    });
    wrap.appendChild(inp);
    parent.appendChild(wrap);
  };
  if (stage.type === 'throttle') {
    addNumber('dur(s)', 'duration_s', 0.5, 0);
    addNumber('value', 'value', 0.05, -1, 1);
    addNumber('pitch°', 'pitch_deg', 1, -45, 45);
    addNumber('roll°', 'roll_deg', 1, -45, 45);
    addDirection('dir', 'direction', true);
  } else if (stage.type === 'attitude') {
    addNumber('dur(s)', 'duration_s', 0.5, 0);
    addNumber('pitch°', 'pitch_deg', 1, -45, 45);
    addNumber('roll°', 'roll_deg', 1, -45, 45);
  } else if (stage.type === 'heading') {
    addNumber('dur(s)', 'duration_s', 0.5, 0);
    addDirection('dir', 'direction', false);
  } else if (stage.type === 'wait') {
    addNumber('dur(s)', 'duration_s', 0.5, 0);
  } else if (stage.type === 'landing') {
    addDirection('dir', 'direction', true);
    addCheckbox('controlled', 'controlled', () => renderStages());
    if (stage.controlled) {
      addNumber('pitch°', 'pitch_deg', 1, -45, 45);
      addNumber('roll°', 'roll_deg', 1, -45, 45);
    }
  }
}
