import { useMemo } from 'react'
import type { AlignedData } from 'uplot'
import { UPlotChart } from './UPlotChart'
import { useTelemetry } from '@/store/telemetry'

export function Charts() {
  const samples = useTelemetry((s) => s.samples)

  const { attitudeData, gyroData, pidData } = useMemo(() => {
    const n = samples.length
    if (n === 0) {
      // uPlot needs a column per series (x + each y). Seed with a single NaN point.
      const att: AlignedData = [[0], [NaN], [NaN], [NaN], [NaN]]
      const gyr: AlignedData = [[0], [NaN], [NaN], [NaN]]
      const pid: AlignedData = [[0], [NaN], [NaN], [NaN]]
      return { attitudeData: att, gyroData: gyr, pidData: pid }
    }
    // X axis = seconds relative to the most recent sample (now = 0, past = negative).
    const tNow = samples[n - 1].t
    const t = new Array<number>(n)
    const roll = new Array<number>(n)
    const pitch = new Array<number>(n)
    const yaw = new Array<number>(n)
    const tilt = new Array<number>(n)
    const gx = new Array<number>(n)
    const gy = new Array<number>(n)
    const gz = new Array<number>(n)
    const pP = new Array<number>(n)
    const pI = new Array<number>(n)
    const pD = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      const s = samples[i]
      t[i] = s.t - tNow
      roll[i] = s.euler[0]
      pitch[i] = s.euler[1]
      yaw[i] = s.euler[2]
      tilt[i] = s.tilt
      gx[i] = s.gyro[0]
      gy[i] = s.gyro[1]
      gz[i] = s.gyro[2]
      pP[i] = s.pidP
      pI[i] = s.pidI
      pD[i] = s.pidD
    }
    return {
      attitudeData: [t, roll, pitch, yaw, tilt] as AlignedData,
      gyroData: [t, gx, gy, gz] as AlignedData,
      pidData: [t, pP, pI, pD] as AlignedData,
    }
  }, [samples])

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="mt-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Attitude (deg)
        </h3>
        <UPlotChart
          data={attitudeData}
          height={160}
          series={[
            { label: 'roll', stroke: 'hsl(174 72% 56%)' },
            { label: 'pitch', stroke: '#c084fc' },
            { label: 'yaw', stroke: '#60a5fa' },
            { label: 'tilt', stroke: 'hsl(38 92% 58%)' },
          ]}
        />
      </div>
      <div>
        <h3 className="mt-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Gyro rates (rad/s)
        </h3>
        <UPlotChart
          data={gyroData}
          height={140}
          series={[
            { label: 'gx', stroke: '#ef4444' },
            { label: 'gy', stroke: '#22c55e' },
            { label: 'gz', stroke: '#3b82f6' },
          ]}
        />
      </div>
      <div>
        <h3 className="mt-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          PID split — pitch axis
        </h3>
        <UPlotChart
          data={pidData}
          height={140}
          series={[
            { label: 'P', stroke: 'hsl(174 72% 56%)' },
            { label: 'I', stroke: 'hsl(38 92% 58%)' },
            { label: 'D', stroke: 'hsl(0 72% 60%)' },
          ]}
        />
      </div>
    </div>
  )
}
