import { memo } from 'react'
import { useTelemetry } from '@/store/telemetry'
import type { SonarDir } from '@/lib/ws-types'

const DIRS: { key: SonarDir; label: string }[] = [
  { key: 'down', label: 'Down' },
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
]

// Precomputed static class strings
const CELL_VALID = 'flex flex-col gap-0.5 rounded-md border border-border bg-secondary/60 px-3 py-2.5'
const CELL_INVALID = CELL_VALID + ' opacity-80'
const LBL = 'text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground'
const VAL_VALID = 'font-mono font-semibold text-lg tabular-nums text-foreground'
const VAL_INVALID = 'font-mono font-semibold text-lg tabular-nums text-muted-foreground'
const STATUS_OK = 'text-[10px] text-success'
const STATUS_WARN = 'text-[10px] text-warning'

const SonarCell = memo(function SonarCell({
  label,
  valid,
  distance,
  status,
}: {
  label: string
  valid: boolean
  distance: number
  status: string
}) {
  return (
    <div className={valid ? CELL_VALID : CELL_INVALID}>
      <span className={LBL}>{label}</span>
      <b className={valid ? VAL_VALID : VAL_INVALID}>
        {valid ? `${distance.toFixed(2)} m` : '—'}
      </b>
      <small className={valid ? STATUS_OK : STATUS_WARN}>{status}</small>
    </div>
  )
})

export function SonarGrid() {
  const sonars = useTelemetry((s) => s.sonars)
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
      {DIRS.map(({ key, label }) => {
        const s = sonars?.[key]
        return (
          <SonarCell
            key={key}
            label={label}
            valid={!!s?.valid}
            distance={s?.distance ?? 0}
            status={s?.status ?? 'init'}
          />
        )
      })}
    </div>
  )
}
