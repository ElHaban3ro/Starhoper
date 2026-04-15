import { memo } from 'react'
import { useTelemetry } from '@/store/telemetry'

const MOTOR_LABEL: Record<string, string> = {
  m1: 'M1 FL',
  m2: 'M2 FR',
  m3: 'M3 RR',
  m4: 'M4 RL',
}
const KEYS = ['m1', 'm2', 'm3', 'm4'] as const

// Precomputed static strings — avoid cn()/twMerge on every frame.
const ROW = 'grid grid-cols-[60px_1fr_50px] items-center gap-2.5 text-[12px]'
const LABEL = 'text-muted-foreground font-medium'
const BAR_BASE = 'h-2 rounded-full overflow-hidden border border-border bg-secondary'
const BAR_SAT = BAR_BASE + ' ring-1 ring-destructive'
const FILL = 'h-full transition-[width] duration-75'
const VALUE = 'text-right font-mono tabular-nums text-foreground'
const FILL_GRADIENT =
  'linear-gradient(90deg, hsl(var(--success)), hsl(var(--primary)) 45%, hsl(var(--warning)) 80%, hsl(var(--destructive)))'

const MotorRow = memo(function MotorRow({
  label,
  pct,
  value,
  sat,
}: {
  label: string
  pct: number
  value: number
  sat: boolean
}) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <div className={sat ? BAR_SAT : BAR_BASE}>
        <div className={FILL} style={{ width: `${pct}%`, background: FILL_GRADIENT }} />
      </div>
      <span className={VALUE}>{value.toFixed(2)}</span>
    </div>
  )
})

export function MotorBars() {
  const motors = useTelemetry((s) => s.motors)
  const motorMax = useTelemetry((s) => (s.config?.MOTOR_MAX as number | undefined) ?? 6)

  return (
    <div className="grid grid-cols-2 gap-3">
      {KEYS.map((k, i) => {
        const v = motors[k] ?? 0
        const pct = Math.max(0, Math.min(100, (v / motorMax) * 100))
        const sat = !!motors.sat?.[i]
        return <MotorRow key={k} label={MOTOR_LABEL[k]} pct={pct} value={v} sat={sat} />
      })}
    </div>
  )
}
