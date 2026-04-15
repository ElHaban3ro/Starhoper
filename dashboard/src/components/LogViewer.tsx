import { useEffect, useRef } from 'react'
import { useTelemetry } from '@/store/telemetry'

// Precomputed static classes — avoid cn() per log line per render.
const ROW_INFO = 'whitespace-pre-wrap break-words text-muted-foreground'
const ROW_WARN = 'whitespace-pre-wrap break-words text-warning'
const ROW_ERR = 'whitespace-pre-wrap break-words text-destructive'

export function LogViewer() {
  const logs = useTelemetry((s) => s.logs)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Only auto-scroll if user hasn't scrolled up to read history.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) el.scrollTop = el.scrollHeight
  }, [logs])

  return (
    <div
      ref={ref}
      className="h-[220px] overflow-y-auto rounded-md border border-border bg-background font-mono text-[11px] p-3 leading-[1.5]"
    >
      {logs.map((l, i) => (
        <div key={i} className={l.cls === 'err' ? ROW_ERR : l.cls === 'warn' ? ROW_WARN : ROW_INFO}>
          {l.line}
        </div>
      ))}
      {logs.length === 0 && <div className="text-muted-foreground">—</div>}
    </div>
  )
}
