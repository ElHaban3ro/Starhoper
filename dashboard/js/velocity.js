let ctx, W, H;
let lastT = null;
let vx = 0, vz = 0;   // integrated world velocity (horizontal only)
const DAMP = 0.98;    // mild drag so it decays without Unity velocity channel

export function initVelocity(canvas){
  ctx = canvas.getContext('2d');
  W = canvas.width; H = canvas.height;
}

export function updateVelocity(t){
  const now = t.t;
  const dt = lastT == null ? 0 : Math.max(0, Math.min(0.1, now - lastT));
  lastT = now;

  // Accel from IMU (world-frame approximation, stripped of gravity).
  const ax = t.accel[0], az = t.accel[2];
  vx = vx * DAMP + ax * dt;
  vz = vz * DAMP + az * dt;

  const mag = Math.hypot(vx, vz);
  const scale = 40;  // px per m/s

  ctx.clearRect(0,0,W,H);
  // bg
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0,0,W,H);
  // grid
  ctx.strokeStyle = '#1a2438';
  ctx.lineWidth = 1;
  for(let r=30; r<W/2; r+=30){
    ctx.beginPath(); ctx.arc(W/2, H/2, r, 0, Math.PI*2); ctx.stroke();
  }
  // crosshair
  ctx.strokeStyle = '#2a3650';
  ctx.beginPath();
  ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
  ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
  ctx.stroke();
  // labels
  ctx.fillStyle = '#4d5770';
  ctx.font = '10px -apple-system,sans-serif';
  ctx.fillText('N', W/2 + 4, 10);
  ctx.fillText('E', W - 10, H/2 - 4);
  ctx.fillText('S', W/2 + 4, H - 2);
  ctx.fillText('W', 2, H/2 - 4);

  // velocity vector (dx = vx east, dy = -vz north up in canvas)
  const dx = Math.max(-W/2, Math.min(W/2, vx * scale));
  const dy = Math.max(-H/2, Math.min(H/2, -vz * scale));
  const cx = W/2, cy = H/2;
  const ex = cx + dx, ey = cy + dy;
  ctx.strokeStyle = mag > 0.1 ? '#3dd6d0' : '#4d5770';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
  ctx.stroke();
  // arrowhead
  const ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - 8*Math.cos(ang - Math.PI/7), ey - 8*Math.sin(ang - Math.PI/7));
  ctx.lineTo(ex - 8*Math.cos(ang + Math.PI/7), ey - 8*Math.sin(ang + Math.PI/7));
  ctx.closePath();
  ctx.fillStyle = '#3dd6d0';
  ctx.fill();

  // magnitude text
  ctx.fillStyle = '#8893a8';
  ctx.font = '11px -apple-system,sans-serif';
  ctx.fillText(`|v|≈${mag.toFixed(2)} m/s`, 6, H - 6);
}
