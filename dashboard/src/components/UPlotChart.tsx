import { useEffect, useRef } from 'react'
import uPlot, { type Options, type AlignedData } from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface SeriesCfg {
  label: string
  stroke: string
  width?: number
}

export function UPlotChart({
  data,
  series,
  height = 160,
  yDomain,
  xDomain = [-10, 0],
}: {
  data: AlignedData
  series: SeriesCfg[]
  height?: number
  yDomain?: [number, number]
  xDomain?: [number, number]
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)

  // Init once when container mounts.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const opts: Options = {
      width: el.clientWidth || 300,
      height,
      legend: { show: true, live: false },
      cursor: { drag: { x: false, y: false } },
      scales: {
        x: { time: false, range: xDomain },
        y: yDomain ? { range: yDomain } : {},
      },
      axes: [
        {
          stroke: 'hsl(240 5% 65%)',
          grid: { stroke: 'hsl(240 4% 16%)', width: 1 },
          ticks: { stroke: 'hsl(240 4% 16%)', width: 1 },
          font: '10px "JetBrains Mono", monospace',
          values: (_u, splits) => splits.map((v) => (v === 0 ? 'now' : `${v.toFixed(0)}s`)),
        },
        {
          stroke: 'hsl(240 5% 65%)',
          grid: { stroke: 'hsl(240 4% 16%)', width: 1 },
          ticks: { stroke: 'hsl(240 4% 16%)', width: 1 },
          font: '10px "JetBrains Mono", monospace',
          size: 44,
        },
      ],
      series: [
        { label: 't' },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.stroke,
          width: s.width ?? 1.5,
          points: { show: false },
        })),
      ],
    }
    const chart = new uPlot(opts, data, el)
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (!el || !chartRef.current) return
      chartRef.current.setSize({ width: el.clientWidth, height })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.destroy()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push updates without full re-init.
  useEffect(() => {
    if (chartRef.current) chartRef.current.setData(data)
  }, [data])

  return <div ref={wrapRef} style={{ width: '100%', height }} />
}
