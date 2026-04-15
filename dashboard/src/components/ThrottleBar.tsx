import { useTelemetry } from '@/store/telemetry'

export function ThrottleBar() {
  const throttle = useTelemetry((s) => s.pilot?.throttle ?? 0)
  const pct = Math.max(-1, Math.min(1, throttle))
  const width = Math.abs(pct) * 50
  const left = pct >= 0 ? 50 : 50 - width

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 h-2.5 rounded-full border border-border bg-secondary overflow-hidden">
        <div
          className="absolute top-0 h-full bg-primary transition-[width,left] duration-100"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div className="absolute top-0 left-1/2 w-px h-full bg-muted-foreground/50" />
      </div>
      <span className="font-mono tabular-nums text-xs text-muted-foreground min-w-[48px] text-right">
        {pct > 0 ? '+' : ''}
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}
