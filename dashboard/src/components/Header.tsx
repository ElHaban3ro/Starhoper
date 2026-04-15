import { memo } from 'react'
import { Rocket, Radio, Shield, Video, ArrowDown, AlertTriangle } from 'lucide-react'
import { useTelemetry } from '@/store/telemetry'
import { StatusChip } from './StatusChip'

// ---- static class strings (avoid running cn()/twMerge on every frame) ----
const TELE_BASE =
  'inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] tabular-nums whitespace-nowrap'
const TELE_WARN = TELE_BASE + ' !border-warning/50 !text-warning'
const TELE_LBL = 'text-muted-foreground'
const TELE_VAL = 'font-semibold text-foreground'
const TELE_VAL_WARN = 'font-semibold text-warning'

// ---- Tele (memoized leaf): only re-renders when its primitive props change ----
const Tele = memo(function Tele({
  label,
  value,
  unit,
  warn,
}: {
  label: string
  value: string
  unit?: string
  warn?: boolean
}) {
  return (
    <span className={warn ? TELE_WARN : TELE_BASE}>
      <span className={TELE_LBL}>{label}</span>
      <b className={warn ? TELE_VAL_WARN : TELE_VAL}>{value}</b>
      {unit && <span className={TELE_LBL}>{unit}</span>}
    </span>
  )
})

// ---- Status chips: subscribes only to low-frequency state (no 20Hz telemetry) ----
const HeaderStatus = memo(function HeaderStatus() {
  const wsStatus = useTelemetry((s) => s.wsStatus)
  const unity = useTelemetry((s) => s.unityConnected)
  const armed = useTelemetry((s) => s.armed)
  const failsafe = useTelemetry((s) => s.failsafe)
  const recording = useTelemetry((s) => s.recording)
  const landingActive = useTelemetry((s) => s.landing.active)

  const wsChip = {
    idle: { v: 'idle' as const, t: '● Dashboard' },
    connecting: { v: 'warn' as const, t: '● Connecting…' },
    open: { v: 'ok' as const, t: '● Dashboard' },
    closed: { v: 'err' as const, t: '● Disconnected' },
  }[wsStatus]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <StatusChip variant={wsChip.v}>{wsChip.t}</StatusChip>
      <StatusChip variant={unity ? 'ok' : 'idle'}>
        <Radio className="h-3 w-3" /> Unity
      </StatusChip>
      <StatusChip variant={armed ? 'ok' : 'idle'}>
        <Shield className="h-3 w-3" /> {armed ? 'Armed' : 'Disarmed'}
      </StatusChip>
      {failsafe && (
        <StatusChip variant="err" pulse>
          <AlertTriangle className="h-3 w-3" /> FAILSAFE
        </StatusChip>
      )}
      {recording && (
        <StatusChip variant="warn" pulse>
          <Video className="h-3 w-3" /> REC
        </StatusChip>
      )}
      {landingActive && (
        <StatusChip variant="warn" pulse>
          <ArrowDown className="h-3 w-3" /> LANDING
        </StatusChip>
      )}
    </div>
  )
})

// ---- Telemetry row: this is the hot path (re-renders at 20Hz). Keep it lean. ----
const HeaderTelemetry = memo(function HeaderTelemetry() {
  const euler = useTelemetry((s) => s.euler)
  const tilt = useTelemetry((s) => s.tilt)
  const sonars = useTelemetry((s) => s.sonars)
  const throttle = useTelemetry((s) => s.pilot?.throttle ?? 0)

  const sVal = (dir: 'down' | 'front' | 'back' | 'left' | 'right'): string => {
    const s = sonars?.[dir]
    return s && s.valid ? s.distance.toFixed(2) : '—'
  }

  return (
    <div className="border-t border-border/70 bg-background/40 px-6 py-2 flex flex-wrap gap-1.5">
      <Tele label="Roll" value={euler[0].toFixed(1)} unit="°" />
      <Tele label="Pitch" value={euler[1].toFixed(1)} unit="°" />
      <Tele label="Yaw" value={euler[2].toFixed(1)} unit="°" />
      <Tele label="Tilt" value={tilt.toFixed(1)} unit="°" warn={tilt > 30} />
      <Tele label="Down" value={sVal('down')} unit="m" />
      <Tele label="Front" value={sVal('front')} unit="m" />
      <Tele label="Back" value={sVal('back')} unit="m" />
      <Tele label="Left" value={sVal('left')} unit="m" />
      <Tele label="Right" value={sVal('right')} unit="m" />
      <Tele label="Thr" value={String(Math.round(throttle * 100))} unit="%" />
    </div>
  )
})

// ---- Brand block: pure static, never re-renders ----
const HeaderBrand = memo(function HeaderBrand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Rocket className="h-5 w-5" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">StarHoper</span>
        <span className="text-sm font-semibold">Mission Control</span>
      </div>
    </div>
  )
})

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex items-center justify-between gap-4 px-6 py-3 flex-wrap">
        <HeaderBrand />
        <HeaderStatus />
      </div>
      <HeaderTelemetry />
    </header>
  )
}
