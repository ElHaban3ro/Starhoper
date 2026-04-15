import { useEffect, useRef } from 'react'
import type { InboundMessage } from '@/lib/ws-types'
import { useTelemetry } from '@/store/telemetry'
import { useWs } from '@/store/ws'

const WS_PORT = 3031
const RECONNECT_MS = 1500
// Throttle React state updates (the 3D viewer uses getState() directly, so it's unaffected).
const TELEMETRY_RENDER_HZ = 15
const CHART_SAMPLE_HZ = 15
const LOG_BATCH_MS = 200  // flush queued log lines at 5Hz

function wsUrl() {
  const host = window.location.hostname || 'localhost'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${host}:${WS_PORT}`
}

export function useWebSocket() {
  const applyMessage = useTelemetry((s) => s.apply)
  const setStatus = useTelemetry((s) => s.setStatus)
  const appendSamples = useTelemetry((s) => s.appendSamples)
  const appendLogs = useTelemetry((s) => s.appendLogs)
  const setSocket = useWs((s) => s.setSocket)
  const retryTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let currentSocket: WebSocket | null = null

    // Throttle state for telemetry → React rerenders
    let pendingTelemetry: Extract<InboundMessage, { type: 'telemetry' }> | null = null
    let lastApply = 0
    let lastSample = 0
    let trailingTimer: number | null = null
    const minApplyMs = 1000 / TELEMETRY_RENDER_HZ
    const minSampleMs = 1000 / CHART_SAMPLE_HZ

    // Batch log lines — the server can firehose during flight, and each line
    // would otherwise trigger a full LogViewer re-render.
    const logQueue: string[] = []
    let logTimer: number | null = null
    const flushLogs = () => {
      logTimer = null
      if (logQueue.length === 0) return
      const lines = logQueue.splice(0, logQueue.length)
      appendLogs(lines)
    }

    const flushTelemetry = (now: number) => {
      if (!pendingTelemetry) return
      const msg = pendingTelemetry
      pendingTelemetry = null
      applyMessage(msg)
      lastApply = now
      if (now - lastSample >= minSampleMs) {
        const pidP = msg.pid_split?.p?.[1] ?? 0
        const pidI = msg.pid_split?.i?.[1] ?? 0
        const pidD = msg.pid_split?.d?.[1] ?? 0
        appendSamples({
          t: msg.t,
          euler: msg.euler,
          tilt: msg.tilt,
          gyro: msg.gyro,
          pidP,
          pidI,
          pidD,
        })
        lastSample = now
      }
    }

    const connect = () => {
      if (cancelled) return
      setStatus('connecting')
      const socket = new WebSocket(wsUrl())
      currentSocket = socket

      socket.onopen = () => {
        if (cancelled || currentSocket !== socket) return
        setStatus('open')
        setSocket(socket)
        socket.send(JSON.stringify({ type: 'hello' }))
      }

      socket.onmessage = (ev) => {
        if (cancelled || currentSocket !== socket) return
        let msg: InboundMessage
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        if (msg.type === 'telemetry') {
          pendingTelemetry = msg
          // Skip React updates while tab is hidden — no one can see them.
          if (document.hidden) return
          const now = performance.now()
          const wait = minApplyMs - (now - lastApply)
          if (wait <= 0) {
            flushTelemetry(now)
          } else if (trailingTimer === null) {
            trailingTimer = window.setTimeout(() => {
              trailingTimer = null
              flushTelemetry(performance.now())
            }, wait)
          }
          return
        }
        if (msg.type === 'log') {
          logQueue.push(msg.line)
          if (logTimer === null) logTimer = window.setTimeout(flushLogs, LOG_BATCH_MS)
          return
        }
        applyMessage(msg)
      }

      socket.onerror = () => { /* close follows */ }

      socket.onclose = () => {
        // Stale socket (we created a new one already, or effect was cleaned up).
        if (currentSocket !== socket) return
        setStatus('closed')
        setSocket(null)
        if (!cancelled) {
          retryTimer.current = window.setTimeout(connect, RECONNECT_MS)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current)
      if (trailingTimer !== null) { window.clearTimeout(trailingTimer); trailingTimer = null }
      if (logTimer !== null) { window.clearTimeout(logTimer); logTimer = null }
      pendingTelemetry = null
      const socket = currentSocket
      currentSocket = null
      if (socket) {
        // Detach handlers so the closing event doesn't mutate global state.
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        try { socket.close() } catch { /* noop */ }
      }
      setSocket(null)
    }
  }, [applyMessage, setStatus, appendSamples, appendLogs, setSocket])
}
