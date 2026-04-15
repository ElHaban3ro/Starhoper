let sendFn = null;
let lastList = [];
let configRef = null;   // latest live config snapshot (mutated by main.js)

export function bindProfileButtons(send, getConfig){
  sendFn = send;
  configRef = getConfig;

  const sel = document.getElementById('profile-select');

  // Auto-apply on change.
  sel.addEventListener('change', () => {
    const name = sel.value;
    if(name) send({type:'apply_profile', name});
    refreshButtonState();
  });

  document.getElementById('btn-save-profile').addEventListener('click', () => {
    const name = sel.value;
    const entry = lastList.find(p => p.name === name);
    if(!entry || entry.readonly) return;
    if(!confirm(`Overwrite profile "${name}" with the current live values?`)) return;
    send({type:'save_profile', name, data: configRef()});
  });

  document.getElementById('btn-reload-profile').addEventListener('click', () => {
    const name = sel.value;
    if(name) send({type:'apply_profile', name});
  });

  document.getElementById('btn-new-profile').addEventListener('click', () => {
    const name = prompt('New profile name (alphanumeric, _, -, 1-32 chars):');
    if(!name) return;
    if(!/^[A-Za-z0-9_\-]{1,32}$/.test(name)){
      alert('Invalid name.'); return;
    }
    if(name === 'default'){
      alert('"default" is reserved.'); return;
    }
    if(lastList.find(p => p.name === name)){
      if(!confirm(`Profile "${name}" already exists. Overwrite?`)) return;
    }
    send({type:'save_profile', name, data: configRef()});
  });

  document.getElementById('btn-delete-profile').addEventListener('click', () => {
    const name = sel.value;
    const entry = lastList.find(p => p.name === name);
    if(!entry || entry.readonly) return;
    if(!confirm(`Delete profile "${name}"? This cannot be undone.`)) return;
    send({type:'delete_profile', name});
  });
}

export function renderProfiles(list){
  lastList = list;
  const sel = document.getElementById('profile-select');
  const prev = sel.value;
  sel.innerHTML = '';
  for(const p of list){
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.readonly ? `${p.name} (readonly)` : p.name;
    sel.appendChild(opt);
  }
  if(list.find(p => p.name === prev)) sel.value = prev;
  refreshButtonState();
}

function refreshButtonState(){
  const name = document.getElementById('profile-select').value;
  const entry = lastList.find(p => p.name === name);
  const tag = document.getElementById('profile-tag');
  const readonly = !entry || !!entry.readonly;

  document.getElementById('btn-save-profile').disabled = readonly;
  document.getElementById('btn-delete-profile').disabled = readonly;

  tag.textContent = readonly ? 'readonly' : 'editable';
  tag.style.color = readonly ? 'var(--muted)' : 'var(--ok)';
}
