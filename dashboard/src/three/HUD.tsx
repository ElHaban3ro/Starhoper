import { useTelemetry } from '@/store/telemetry'

export function HUD() {
  const euler = useTelemetry((s) => s.euler)
  const tilt = useTelemetry((s) => s.tilt)
  const sonarDown = useTelemetry((s) => s.sonars?.down)
  const throttle = useTelemetry((s) => s.pilot?.throttle ?? 0)
  const armed = useTelemetry((s) => s.armed)
  const unityConnected = useTelemetry((s) => s.connectedUnity)

  const altTxt = sonarDown?.valid ? `${sonarDown.distance.toFixed(2)} m` : '—'
  const gndMode = !!sonarDown?.valid && sonarDown.distance < 25

  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-[11px] tracking-tight select-none">
      {/* top center — heading */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 px-3 py-1 rounded border border-primary/40 bg-background/65 backdrop-blur-sm">
        <span className="text-primary">HDG</span>{' '}
        <span className="text-foreground tabular-nums">{euler[2].toFixed(1)}°</span>
      </div>

      {/* left — alt, tilt */}
      <div className="absolute top-6 left-4 flex flex-col gap-1">
        <div className="px-2 py-1 rounded border border-primary/40 bg-background/65 backdrop-blur-sm">
          <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">ALT</div>
          <div className="text-primary tabular-nums">{altTxt}</div>
        </div>
        <div className="px-2 py-1 rounded border border-border bg-background/65 backdrop-blur-sm">
          <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">TILT</div>
          <div className={'tabular-nums ' + (tilt > 30 ? 'text-warning' : 'text-foreground')}>
            {tilt.toFixed(1)}°
          </div>
        </div>
      </div>

      {/* right — roll/pitch, throttle */}
      <div className="absolute top-6 right-4 flex flex-col gap-1 text-right">
        <div className="px-2 py-1 rounded border border-border bg-background/65 backdrop-blur-sm">
          <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">ROLL / PITCH</div>
          <div className="text-foreground tabular-nums">
            {euler[0].toFixed(1)}° / {euler[1].toFixed(1)}°
          </div>
        </div>
        <div className="px-2 py-1 rounded border border-border bg-background/65 backdrop-blur-sm">
          <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">THR</div>
          <div className="text-foreground tabular-nums">{(throttle * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* bottom center — status */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        <span className={'px-2.5 py-1 rounded border bg-background/65 backdrop-blur-sm ' +
          (armed ? 'border-success/50 text-success' : 'border-border text-muted-foreground')}>
          ● {armed ? 'ARMED' : 'DISARMED'}
        </span>
        <span className={'px-2.5 py-1 rounded border bg-background/65 backdrop-blur-sm ' +
          (unityConnected ? 'border-success/50 text-success' : 'border-warning/50 text-warning')}>
          Unity {unityConnected ? 'OK' : 'off'}
        </span>
      </div>

      {/* mode tag */}
      <div className="absolute bottom-3 right-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {gndMode ? 'GND' : 'IN FLIGHT'}
      </div>

      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 opacity-60">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary -translate-x-1/2" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-primary -translate-y-1/2" />
      </div>
    </div>
  )
}
