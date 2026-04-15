const WINDOW_S = 10;

const charts = [
  {id:'chart-attitude', series: [
    {key:'euler0', label:'roll',  color:'#3dd6d0'},
    {key:'euler1', label:'pitch', color:'#7a7cff'},
    {key:'euler2', label:'yaw',   color:'#ffb454'},
    {key:'tilt',   label:'tilt',  color:'#ff5871'},
  ]},
  {id:'chart-gyro', series: [
    {key:'gyro0', label:'gx', color:'#3dd6d0'},
    {key:'gyro1', label:'gy', color:'#7a7cff'},
    {key:'gyro2', label:'gz', color:'#ffb454'},
  ]},
  {id:'chart-pid', series: [
    {key:'p1', label:'P pitch', color:'#3dd6d0'},
    {key:'i1', label:'I pitch', color:'#7a7cff'},
    {key:'d1', label:'D pitch', color:'#ffb454'},
  ]},
];

const buffers = {};   // key -> array of {t, v}
let started = null;

export function initCharts(){
  started = performance.now() / 1000;
  for(const c of charts){
    for(const s of c.series) buffers[s.key] = [];
  }
  requestAnimationFrame(loop);
}

export function pushTelemetry(t){
  const now = performance.now() / 1000;
  push('euler0', now, t.euler[0]);
  push('euler1', now, t.euler[1]);
  push('euler2', now, t.euler[2]);
  push('tilt',   now, t.tilt);
  push('gyro0',  now, t.gyro[0]);
  push('gyro1',  now, t.gyro[1]);
  push('gyro2',  now, t.gyro[2]);
  push('p1', now, t.pid_split.p[1]);
  push('i1', now, t.pid_split.i[1]);
  push('d1', now, t.pid_split.d[1]);
}

function push(key, t, v){
  const buf = buffers[key];
  buf.push({t, v});
  const cutoff = t - WINDOW_S;
  while(buf.length && buf[0].t < cutoff) buf.shift();
}

function loop(){
  for(const c of charts) draw(c);
  requestAnimationFrame(loop);
}

function draw(chart){
  const cvs = document.getElementById(chart.id);
  if(!cvs) return;
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  ctx.clearRect(0,0,W,H);

  // bg
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = '#182230';
  ctx.lineWidth = 1;
  // horizontal grid
  for(let y=0; y<=4; y++){
    const yy = (H/4)*y;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }

  const now = performance.now()/1000;
  const tMin = now - WINDOW_S, tMax = now;

  // find y range across all series
  let yMin = Infinity, yMax = -Infinity;
  for(const s of chart.series){
    for(const pt of buffers[s.key]){
      if(pt.v < yMin) yMin = pt.v;
      if(pt.v > yMax) yMax = pt.v;
    }
  }
  if(!isFinite(yMin)) { yMin = -1; yMax = 1; }
  if(yMax - yMin < 1) { const m = (yMax+yMin)/2; yMin = m-0.5; yMax = m+0.5; }
  const pad = (yMax - yMin)*0.1;
  yMin -= pad; yMax += pad;

  // zero line
  if(yMin < 0 && yMax > 0){
    const y0 = H - ((0 - yMin)/(yMax - yMin))*H;
    ctx.strokeStyle = '#2a3650';
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
    ctx.setLineDash([]);
  }

  // plot series
  for(const s of chart.series){
    const buf = buffers[s.key];
    if(buf.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let first = true;
    for(const pt of buf){
      const x = ((pt.t - tMin)/(tMax - tMin)) * W;
      const y = H - ((pt.v - yMin)/(yMax - yMin)) * H;
      if(first){ ctx.moveTo(x,y); first = false; }
      else      { ctx.lineTo(x,y); }
    }
    ctx.stroke();
  }

  // legend
  ctx.font = '11px -apple-system,sans-serif';
  let lx = 8;
  for(const s of chart.series){
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, 6, 10, 3);
    ctx.fillStyle = '#8893a8';
    ctx.fillText(s.label, lx + 14, 12);
    lx += 14 + ctx.measureText(s.label).width + 12;
  }
  // y range text
  ctx.fillStyle = '#4d5770';
  ctx.fillText(`${yMin.toFixed(1)}..${yMax.toFixed(1)}`, W - 80, 12);
}
