import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useTelemetry } from '@/store/telemetry'
import { useWs } from '@/store/ws'
import type { SequenceStage, StageType } from '@/lib/ws-types'
import { GripVertical, Play, Square, X, Plus, Save, FolderOpen, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STAGE_TYPES: StageType[] = ['throttle', 'attitude', 'heading', 'wait', 'arm', 'disarm', 'landing']

function idOf(i: number, s: SequenceStage) { return `${i}-${s.type}` }

function StageRow({
  index,
  stage,
  isRunning,
  onChange,
  onDelete,
}: {
  index: number
  stage: SequenceStage
  isRunning: boolean
  onChange: (s: SequenceStage) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: idOf(index, stage),
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const updateNum = (k: keyof SequenceStage, v: number) => onChange({ ...stage, [k]: v })
  const updateDir = (v: 'N' | 'E' | 'S' | 'W') => onChange({ ...stage, direction: v })
  const updateCtrl = (v: boolean) => onChange({ ...stage, controlled: v })

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 p-2 rounded-md border bg-secondary/50 text-xs flex-wrap',
        isRunning ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent'
      )}
    >
      <button className="cursor-grab text-muted-foreground" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="font-mono text-muted-foreground tabular-nums min-w-[24px] text-right">
        {index + 1}
      </span>
      <Select value={stage.type} onValueChange={(v) => onChange({ type: v as StageType })}>
        <SelectTrigger className="h-7 w-[110px] text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STAGE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1.5 flex-1 flex-wrap items-center">
        {['throttle', 'attitude', 'wait', 'heading'].includes(stage.type) && (
          <LabelledNum label="dur (s)" value={stage.duration_s ?? 0} onChange={(v) => updateNum('duration_s', v)} />
        )}
        {stage.type === 'throttle' && (
          <>
            <LabelledNum label="value" value={stage.value ?? 0} onChange={(v) => updateNum('value', v)} step={0.05} />
            <LabelledNum label="pitch°" value={stage.pitch_deg ?? 0} onChange={(v) => updateNum('pitch_deg', v)} />
            <LabelledNum label="roll°" value={stage.roll_deg ?? 0} onChange={(v) => updateNum('roll_deg', v)} />
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">dir</span>
              <Select
                value={stage.direction ?? '__none__'}
                onValueChange={(v) => onChange({ ...stage, direction: v === '__none__' ? undefined : (v as 'N' | 'E' | 'S' | 'W') })}
              >
                <SelectTrigger className="h-6 w-[60px] text-[10px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {(['N', 'E', 'S', 'W'] as const).map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {stage.type === 'attitude' && (
          <>
            <LabelledNum label="pitch°" value={stage.pitch_deg ?? 0} onChange={(v) => updateNum('pitch_deg', v)} />
            <LabelledNum label="roll°" value={stage.roll_deg ?? 0} onChange={(v) => updateNum('roll_deg', v)} />
          </>
        )}
        {stage.type === 'heading' && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">dir</span>
            <Select value={stage.direction ?? 'N'} onValueChange={(v) => updateDir(v as 'N' | 'E' | 'S' | 'W')}>
              <SelectTrigger className="h-6 w-[60px] text-[10px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['N', 'E', 'S', 'W'] as const).map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {stage.type === 'landing' && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">dir</span>
              <Select
                value={stage.direction ?? '__none__'}
                onValueChange={(v) => onChange({ ...stage, direction: v === '__none__' ? undefined : (v as 'N' | 'E' | 'S' | 'W') })}
              >
                <SelectTrigger className="h-6 w-[60px] text-[10px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {(['N', 'E', 'S', 'W'] as const).map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Checkbox
                checked={!!stage.controlled}
                onCheckedChange={(v) => updateCtrl(!!v)}
              />
              controlled
            </label>
            {stage.controlled && (
              <>
                <LabelledNum label="pitch°" value={stage.pitch_deg ?? 0} onChange={(v) => updateNum('pitch_deg', v)} />
                <LabelledNum label="roll°" value={stage.roll_deg ?? 0} onChange={(v) => updateNum('roll_deg', v)} />
              </>
            )}
          </>
        )}
      </div>

      <button
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function LabelledNum({ label, value, onChange, step = 0.1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
      {label}
      <Input
        type="number"
        value={value}
        step={step}
        className="h-6 w-[70px] text-[10px] font-mono px-1.5"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  )
}

export function Sequencer() {
  const send = useWs((s) => s.send)
  const stages = useTelemetry((s) => s.sequencerStages)
  const run = useTelemetry((s) => s.sequencerRun)
  const sequences = useTelemetry((s) => s.sequences)

  const [local, setLocal] = useState<SequenceStage[]>([])
  const [selected, setSelected] = useState<string>('')
  const [newType, setNewType] = useState<StageType>('throttle')
  const [loop, setLoop] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  useEffect(() => { setLocal(stages) }, [stages])

  const pushStages = (next: SequenceStage[]) => {
    setLocal(next)
    send({ type: 'set_sequence', stages: next })
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const oldIdx = local.findIndex((s, i) => idOf(i, s) === active.id)
    const newIdx = local.findIndex((s, i) => idOf(i, s) === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    pushStages(arrayMove(local, oldIdx, newIdx))
  }

  const addStage = () => {
    const defaults: Record<StageType, SequenceStage> = {
      throttle: { type: 'throttle', duration_s: 1, value: 0.2, pitch_deg: 0, roll_deg: 0 },
      attitude: { type: 'attitude', duration_s: 1, pitch_deg: 0, roll_deg: 0 },
      heading: { type: 'heading', duration_s: 1, direction: 'N' },
      wait: { type: 'wait', duration_s: 1 },
      arm: { type: 'arm' },
      disarm: { type: 'disarm' },
      landing: { type: 'landing', controlled: false },
    }
    pushStages([...local, defaults[newType]])
  }

  const onSaveAs = () => {
    const name = saveName.trim()
    if (!/^[A-Za-z0-9_\-]{1,32}$/.test(name)) return
    send({ type: 'save_sequence', name, stages: local })
    setSelected(name)
    setSaveOpen(false)
    setSaveName('')
  }

  const progress = run && run.total_stages > 0
    ? ((run.current_idx + (run.current_duration_s ? (run.elapsed_s ?? 0) / run.current_duration_s : 0)) / run.total_stages) * 100
    : 0

  const status = run?.active
    ? `running stage ${run.current_idx + 1}/${run.total_stages}${run.current_type ? ` — ${run.current_type}` : ''}`
    : 'idle'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs">Saved</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {sequences.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="secondary" onClick={() => selected && send({ type: 'load_sequence', name: selected })} disabled={!selected}>
          <FolderOpen className="h-3.5 w-3.5 mr-1" /> Load
        </Button>
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary">
              <Save className="h-3.5 w-3.5 mr-1" /> Save as…
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Save current sequence</DialogTitle></DialogHeader>
            <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="sequence name" />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button onClick={onSaveAs}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" disabled={!selected}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete sequence “{selected}”?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { send({ type: 'delete_sequence', name: selected }); setSelected('') }}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => send({ type: 'run_sequence', stages: local, loop })} disabled={local.length === 0 || run?.active}>
          <Play className="h-3.5 w-3.5 mr-1" /> Run
        </Button>
        <Button variant="destructive" onClick={() => send({ type: 'stop_sequence' })} disabled={!run?.active}>
          <Square className="h-3.5 w-3.5 mr-1" /> Stop
        </Button>
        <label className="flex items-center gap-2 text-xs ml-2">
          <Checkbox checked={loop} onCheckedChange={(v) => setLoop(!!v)} /> Loop
        </label>
        <span className="text-xs text-muted-foreground ml-auto font-mono">{status}</span>
      </div>

      <Progress value={progress} className="h-1" />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={local.map((s, i) => idOf(i, s))} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {local.map((s, i) => (
              <StageRow
                key={idOf(i, s)}
                index={i}
                stage={s}
                isRunning={!!run?.active && run.current_idx === i}
                onChange={(next) => pushStages(local.map((x, j) => (j === i ? next : x)))}
                onDelete={() => pushStages(local.filter((_, j) => j !== i))}
              />
            ))}
            {local.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4">No stages. Add one below.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Add</Label>
        <Select value={newType} onValueChange={(v) => setNewType(v as StageType)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={addStage}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
    </div>
  )
}
