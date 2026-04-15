import { useEffect, useMemo, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTelemetry } from '@/store/telemetry'
import { useWs } from '@/store/ws'
import type { ParamSchema } from '@/lib/ws-types'
import { Info } from 'lucide-react'

const DEBOUNCE_MS = 150
const ACTIVE_TAB_KEY = 'paramsActiveTab'

function ScalarParam({ p, value, onChange }: {
  p: ParamSchema
  value: number
  onChange: (v: number) => void
}) {
  const min = p.min ?? 0
  const max = p.max ?? 1
  const step = p.step ?? (p.type === 'int' ? 1 : 0.01)
  return (
    <div className="flex items-center gap-2">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        disabled={p.derived}
        className="flex-1"
      />
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        readOnly={p.derived}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-24 h-8 text-xs font-mono"
      />
    </div>
  )
}

function Vec3Param({ p, value, onChange }: { p: ParamSchema; value: [number, number, number]; onChange: (v: [number, number, number]) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {(['x', 'y', 'z'] as const).map((_, i) => (
        <Input
          key={i}
          type="number"
          value={value[i]}
          step={p.step ?? 0.01}
          readOnly={p.derived}
          onChange={(e) => {
            const next = [...value] as [number, number, number]
            next[i] = parseFloat(e.target.value) || 0
            onChange(next)
          }}
          className="h-8 text-xs font-mono"
        />
      ))}
    </div>
  )
}

function Row({ p, value, onChange }: { p: ParamSchema; value: unknown; onChange: (v: unknown) => void }) {
  const displayVal = Array.isArray(value)
    ? `[${value.map((x) => Number(x).toFixed(2)).join(', ')}]`
    : typeof value === 'boolean'
    ? value ? 'true' : 'false'
    : typeof value === 'number'
    ? value.toFixed(3)
    : String(value ?? '—')

  return (
    <div className="flex flex-col gap-1.5 py-2 border-b border-border/60 last:border-0">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5 text-foreground font-medium">
          {p.label || p.key}
          {p.tooltip && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-[11px]">{p.tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {p.derived && <Badge variant="outline" className="text-[9px] h-4 px-1">derived</Badge>}
        </div>
        <span className="text-muted-foreground font-mono tabular-nums">{displayVal}</span>
      </div>
      {p.type === 'bool' ? (
        <Switch
          checked={!!value}
          onCheckedChange={(v) => onChange(v)}
          disabled={p.derived}
        />
      ) : p.type === 'vec3' ? (
        <Vec3Param p={p} value={(value as [number, number, number]) ?? [0, 0, 0]} onChange={onChange} />
      ) : (
        <ScalarParam p={p} value={typeof value === 'number' ? value : 0} onChange={onChange} />
      )}
    </div>
  )
}

export function Params() {
  const schema = useTelemetry((s) => s.schema)
  const config = useTelemetry((s) => s.config)
  const send = useWs((s) => s.send)
  const pending = useRef<Map<string, number>>(new Map())

  const sections = useMemo(() => {
    const map = new Map<string, ParamSchema[]>()
    for (const p of schema) {
      const arr = map.get(p.section) ?? []
      arr.push(p)
      map.set(p.section, arr)
    }
    return Array.from(map.entries())
  }, [schema])

  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem(ACTIVE_TAB_KEY) ?? '')
  useEffect(() => {
    if (!activeTab && sections.length) setActiveTab(sections[0][0])
  }, [sections, activeTab])
  useEffect(() => {
    if (activeTab) localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
  }, [activeTab])

  if (!schema.length) return <p className="text-xs text-muted-foreground">Waiting for schema…</p>

  const onChange = (key: string, value: unknown) => {
    const t = pending.current.get(key)
    if (t !== undefined) window.clearTimeout(t)
    const id = window.setTimeout(() => {
      send({ type: 'set_param', key, value })
      pending.current.delete(key)
    }, DEBOUNCE_MS)
    pending.current.set(key, id)
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="flex flex-wrap h-auto w-full bg-transparent border-b border-border rounded-none justify-start p-0 gap-0">
        {sections.map(([name]) => (
          <TabsTrigger
            key={name}
            value={name}
            className="text-[11px] capitalize rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2 h-auto"
          >
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      {sections.map(([name, params]) => (
        <TabsContent key={name} value={name} className="pt-2">
          {params.map((p) => (
            <Row
              key={p.key}
              p={p}
              value={config[p.key]}
              onChange={(v) => onChange(p.key, v)}
            />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  )
}
