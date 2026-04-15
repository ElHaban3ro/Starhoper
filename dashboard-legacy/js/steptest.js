export function handleStepResult(r){
  const el = document.getElementById('step-result');
  const parts = [
    `<b>${r.axis}</b> @ ${r.amplitude_deg}°`,
    `rise: ${r.rise_ms ?? '—'} ms`,
    `settle: ${r.settle_ms ?? '—'} ms`,
    `overshoot: ${r.overshoot_pct ?? '—'}%`,
    `samples: ${(r.samples || []).length}`,
  ];
  el.innerHTML = parts.join(' · ');
}
