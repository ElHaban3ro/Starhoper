import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useTelemetry } from '@/store/telemetry'
import { useWs } from '@/store/ws'
import { AlertTriangle } from 'lucide-react'

export function Alarms() {
  const rules = useTelemetry((s) => s.alarmRules)
  const active = useTelemetry((s) => s.activeAlarms)
  const send = useWs((s) => s.send)

  const entries = Object.entries(rules)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">No rules.</p>}
        {entries.map(([rule, r]) => (
          <div
            key={rule}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-border bg-secondary/60 px-3 py-2 text-xs"
          >
            <label className="font-medium text-foreground">{r.label}</label>
            <Input
              type="number"
              value={r.threshold}
              step={0.1}
              className="h-7 w-24 font-mono text-xs"
              onChange={(e) => send({ type: 'set_alarm', rule, threshold: parseFloat(e.target.value) || 0 })}
            />
            <Switch
              checked={r.enabled}
              onCheckedChange={(v) => send({ type: 'set_alarm', rule, enabled: v })}
            />
          </div>
        ))}
      </div>

      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground m-0">Active</h3>
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">(none)</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {active.map((a) => (
            <div
              key={a.rule}
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="flex-1">{a.label}</span>
              <span className="font-mono tabular-nums">{a.value.toFixed(2)} / {a.threshold.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
