import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useTelemetry } from '@/store/telemetry'
import { useWs } from '@/store/ws'
import { Power, Octagon, RefreshCcw, ArrowDown, CircleStop, Radio, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Controls() {
  const send = useWs((s) => s.send)
  const armed = useTelemetry((s) => s.armed)
  const landingState = useTelemetry((s) => s.landing.state)
  const landingActive = useTelemetry((s) => s.landing.active)
  const recording = useTelemetry((s) => s.recording)
  const recordingFile = useTelemetry((s) => s.recordingFile)
  const stepResult = useTelemetry((s) => s.stepResult)

  const [axis, setAxis] = useState('pitch')
  const [amp, setAmp] = useState(15)
  const [dur, setDur] = useState(3)
  const [localStep, setLocalStep] = useState<string | null>(null)

  const runStep = () => {
    setLocalStep(`Running step test: ${axis} ${amp}° for ${dur}s…`)
    send({ type: 'run_step_test', axis, amplitude_deg: amp, duration_s: dur })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => send({ type: 'arm' })} disabled={armed}>
          <Power className="h-3.5 w-3.5 mr-1" /> ARM
        </Button>
        <Button variant="secondary" onClick={() => send({ type: 'disarm' })} disabled={!armed || landingActive}>
          DISARM
        </Button>
        <Button variant="destructive" onClick={() => send({ type: 'emergency_stop' })}>
          <Octagon className="h-3.5 w-3.5 mr-1" /> EMERGENCY STOP
        </Button>
        <Button variant="secondary" onClick={() => send({ type: 'reset_integral' })}>
          <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Reset integral
        </Button>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Button onClick={() => send({ type: 'start_landing' })} disabled={landingActive}>
          <ArrowDown className="h-3.5 w-3.5 mr-1" /> LAND
        </Button>
        <Button variant="secondary" onClick={() => send({ type: 'cancel_landing' })} disabled={!landingActive}>
          Cancel land
        </Button>
        <span className="text-xs text-muted-foreground font-mono">{landingState}</span>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Button
          variant={recording ? 'destructive' : 'secondary'}
          onClick={() =>
            send({ type: recording ? 'stop_recording' : 'start_recording' })
          }
          className={cn(recording && 'animate-pulse')}
        >
          {recording ? <CircleStop className="h-3.5 w-3.5 mr-1" /> : <Video className="h-3.5 w-3.5 mr-1" />}
          {recording ? 'Stop REC' : 'REC'}
        </Button>
        {recordingFile && (
          <span className="text-[11px] font-mono text-muted-foreground truncate max-w-xs">
            {recordingFile}
          </span>
        )}
      </div>

      <Separator />

      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground m-0">
        <Radio className="h-3 w-3 inline mr-1" /> Step test
      </h3>
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Axis</Label>
          <Select value={axis} onValueChange={setAxis}>
            <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pitch">pitch</SelectItem>
              <SelectItem value="roll">roll</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Amp (°)</Label>
          <Input
            type="number"
            value={amp}
            step={1}
            className="w-24 h-9 font-mono"
            onChange={(e) => setAmp(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Dur (s)</Label>
          <Input
            type="number"
            value={dur}
            step={0.5}
            className="w-24 h-9 font-mono"
            onChange={(e) => setDur(parseFloat(e.target.value) || 0)}
          />
        </div>
        <Button onClick={runStep}>Run</Button>
      </div>
      <div className="min-h-[2em] rounded-md border border-border bg-secondary/60 px-3 py-2 text-xs font-mono text-muted-foreground">
        {stepResult ?? localStep ?? '—'}
      </div>
    </div>
  )
}
