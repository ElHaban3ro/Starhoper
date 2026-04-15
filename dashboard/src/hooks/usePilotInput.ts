import { useEffect, useRef, useState, useCallback } from 'react'
import { useWs } from '@/store/ws'

export type Axis = 'throttle' | 'pitch' | 'roll' | 'yaw'
export type Dir = -1 | 1

const KEY_MAP: Record<string, [Axis, Dir]> = {
  w: ['pitch', 1],
  s: ['pitch', -1],
  a: ['roll', -1],
  d: ['roll', 1],
  q: ['yaw', -1],
  e: ['yaw', 1],
  ArrowUp: ['throttle', 1],
  ArrowDown: ['throttle', -1],
}

const keyOf = (axis: Axis, dir: Dir) => `${axis}:${dir}`

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable
}

function clamp(v: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, v))
}

export interface PilotInputApi {
  active: Set<string>
  onMouseDown: (axis: Axis, dir: Dir) => void
  onMouseUp: (axis: Axis, dir: Dir) => void
}

export function usePilotInput(): PilotInputApi {
  const send = useWs((s) => s.send)
  const mouseRef = useRef<Set<string>>(new Set())
  const keyRef = useRef<Set<string>>(new Set())
  const [active, setActive] = useState<Set<string>>(new Set())
  const lastSentRef = useRef<string>('')

  const syncState = useCallback(() => {
    const merged = new Set<string>()
    mouseRef.current.forEach((k) => merged.add(k))
    keyRef.current.forEach((k) => merged.add(k))
    setActive(merged)

    let throttle = 0, pitch = 0, roll = 0, yaw = 0
    merged.forEach((k) => {
      const [axis, dirStr] = k.split(':')
      const dir = Number(dirStr)
      if (axis === 'throttle') throttle += dir
      if (axis === 'pitch') pitch += dir
      if (axis === 'roll') roll += dir
      if (axis === 'yaw') yaw += dir
    })
    throttle = clamp(throttle)
    pitch = clamp(pitch)
    roll = clamp(roll)
    yaw = clamp(yaw)

    const key = `${throttle}|${pitch}|${roll}|${yaw}`
    if (key === lastSentRef.current) return
    lastSentRef.current = key
    send({ type: 'pilot_input', throttle, pitch, roll, yaw })
  }, [send])

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return
      const map = KEY_MAP[ev.key]
      if (!map) return
      ev.preventDefault()
      const k = keyOf(map[0], map[1])
      if (keyRef.current.has(k)) return
      keyRef.current.add(k)
      syncState()
    }
    const onKeyUp = (ev: KeyboardEvent) => {
      const map = KEY_MAP[ev.key]
      if (!map) return
      const k = keyOf(map[0], map[1])
      if (!keyRef.current.delete(k)) return
      syncState()
    }
    const onBlur = () => {
      if (keyRef.current.size === 0 && mouseRef.current.size === 0) return
      keyRef.current.clear()
      mouseRef.current.clear()
      syncState()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [syncState])

  const onMouseDown = useCallback(
    (axis: Axis, dir: Dir) => {
      mouseRef.current.add(keyOf(axis, dir))
      syncState()
    },
    [syncState]
  )
  const onMouseUp = useCallback(
    (axis: Axis, dir: Dir) => {
      mouseRef.current.delete(keyOf(axis, dir))
      syncState()
    },
    [syncState]
  )

  return { active, onMouseDown, onMouseUp }
}
