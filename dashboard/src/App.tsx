import { Suspense, lazy, useState } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Header } from '@/components/Header'
import { Switch } from '@/components/ui/switch'
import { Box } from 'lucide-react'
import { CardSection } from '@/components/CardSection'
import { MotorBars } from '@/components/MotorBars'
import { ThrottleBar } from '@/components/ThrottleBar'
import { PilotPad } from '@/components/PilotPad'
import { SonarGrid } from '@/components/SonarGrid'
import { Charts } from '@/components/Charts'
import { Params } from '@/components/Params'
import { Profiles } from '@/components/Profiles'
import { Controls } from '@/components/Controls'
import { Sequencer } from '@/components/Sequencer'
import { Alarms } from '@/components/Alarms'
import { LogViewer } from '@/components/LogViewer'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useTelemetry } from '@/store/telemetry'

const AttitudeViewer = lazy(() =>
  import('@/three/AttitudeViewer').then((m) => ({ default: m.AttitudeViewer }))
)

function AttitudeCard() {
  const euler = useTelemetry((s) => s.euler)
  const tilt = useTelemetry((s) => s.tilt)
  // Always starts OFF on every page load — user must opt in per session.
  const [render3d, setRender3d] = useState(false)

  return (
    <CardSection
      title="Attitude"
      subtitle={render3d ? '3D orientation · rocket viewer' : '3D disabled (perf)'}
      className="h-full"
      bodyClassName="p-0 flex flex-col"
      action={
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
          <Box className="h-3.5 w-3.5" />
          3D
          <Switch checked={render3d} onCheckedChange={setRender3d} />
        </label>
      }
    >
      <div className="relative h-[420px] w-full">
        {render3d ? (
          <ErrorBoundary label="AttitudeViewer">
            <Suspense
              fallback={
                <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">
                  Loading 3D…
                </div>
              }
            >
              <AttitudeViewer />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="h-full w-full grid place-items-center text-center gap-2 bg-background/60">
            <div>
              <Box className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
              <p className="text-xs text-muted-foreground">3D viewer disabled</p>
              <p className="text-[10px] text-muted-foreground/70">Toggle ON to render the rocket</p>
            </div>
          </div>
        )}
      </div>
      <div className="px-4 py-3 grid grid-cols-4 gap-2 text-xs border-t border-border">
        {(['roll', 'pitch', 'yaw', 'tilt'] as const).map((k, i) => {
          const v = k === 'tilt' ? tilt : euler[i]
          return (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</span>
              <b className="font-mono tabular-nums text-foreground">{v.toFixed(1)}°</b>
            </div>
          )
        })}
      </div>
    </CardSection>
  )
}

export default function App() {
  useWebSocket()

  return (
    <div className="min-h-screen">
      <Header />
      <main className="grid grid-cols-12 gap-4 p-4 items-start">
        <div className="col-span-12 lg:col-span-7 xl:col-span-7">
          <AttitudeCard />
        </div>

        <div className="col-span-12 lg:col-span-5 xl:col-span-5">
          <CardSection title="Motors & Pilot" subtitle="quad-X mixer · manual control">
            <div className="flex flex-col gap-4">
              <MotorBars />
              <div>
                <h3 className="mt-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Throttle</h3>
                <ThrottleBar />
              </div>
              <div>
                <h3 className="mt-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Pilot</h3>
                <PilotPad />
              </div>
            </div>
          </CardSection>
        </div>

        <div className="col-span-12">
          <CardSection title="Proximity" subtitle="5× sonar array">
            <SonarGrid />
          </CardSection>
        </div>

        <div className="col-span-12 xl:col-span-8">
          <CardSection title="Telemetry" subtitle="10s rolling window">
            <Charts />
          </CardSection>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <CardSection title="Parameters" subtitle="live config" bodyClassName="p-4 max-h-[620px] overflow-y-auto">
            <Params />
          </CardSection>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <CardSection title="Profiles" subtitle="save & restore">
            <Profiles />
          </CardSection>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <CardSection title="Controls" subtitle="flight ops">
            <Controls />
          </CardSection>
        </div>

        <div className="col-span-12">
          <CardSection title="Sequencer" subtitle="scripted missions · drag to reorder">
            <Sequencer />
          </CardSection>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <CardSection title="Alarms" subtitle="triggers & active">
            <Alarms />
          </CardSection>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <CardSection title="Console log" subtitle="server stream">
            <LogViewer />
          </CardSection>
        </div>
      </main>
    </div>
  )
}
