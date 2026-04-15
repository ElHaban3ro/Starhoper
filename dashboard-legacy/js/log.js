const MAX = 200;

export function appendLog(line){
  const body = document.getElementById('log-body');
  const el = document.createElement('div');
  el.className = 'line';
  if(/error|traceback|exception/i.test(line)) el.classList.add('err');
  else if(/warn/i.test(line)) el.classList.add('warn');
  el.textContent = line;
  body.appendChild(el);
  while(body.children.length > MAX) body.removeChild(body.firstChild);
  body.scrollTop = body.scrollHeight;
}

export function replayLog(lines){
  const body = document.getElementById('log-body');
  body.innerHTML = '';
  for(const l of lines) appendLog(l);
}
