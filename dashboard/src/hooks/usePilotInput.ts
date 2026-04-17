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
  gamepadConnected: boolean
}

// Stick deadzone. Some DualSense pads drift up to 0.12 at rest; 0.12 kills
// it for almost all units. Lower it per-pad if your unit is tighter.
const GAMEPAD_DEADZONE = 0.12
// Expo curve makes small stick motions less sensitive (better precision near
// center, full range at full deflection). 0 = linear, 1 = pure cubic.
const GAMEPAD_EXPO = 0.4

function applyDeadzoneExpo(v: number): number {
  const s = Math.sign(v)
  const m = Math.abs(v)
  if (m < GAMEPAD_DEADZONE) return 0
  const scaled = (m - GAMEPAD_DEADZONE) / (1 - GAMEPAD_DEADZONE)
  const curved = (1 - GAMEPAD_EXPO) * scaled + GAMEPAD_EXPO * scaled * scaled * scaled
  return s * clamp(curved)
}

const round2 = (v: number) => Math.round(v * 100) / 100

// Standard Gamepad API button indices (DualSense / Xbox common layout).
const BTN_L1 = 4
const BTN_R1 = 5
const BTN_DPAD_DOWN = 13
const BTN_DPAD_LEFT = 14

export function usePilotInput(): PilotInputApi {
  const send = useWs((s) => s.send)
  const mouseRef = useRef<Set<string>>(new Set())
  const keyRef = useRef<Set<string>>(new Set())
  const gamepadAxesRef = useRef<{ throttle: number; pitch: number; roll: number; yaw: number } | null>(null)
  const [active, setActive] = useState<Set<string>>(new Set())
  const [gamepadConnected, setGamepadConnected] = useState(false)
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

    // Gamepad override: if a stick axis is outside the deadzone, it replaces
    // the keyboard/mouse value for that axis. Axes within deadzone fall back
    // to keyboard so the pilot can hold W and trim with the gamepad if wanted.
    const g = gamepadAxesRef.current
    if (g) {
      if (g.throttle !== 0) throttle = g.throttle
      if (g.pitch !== 0) pitch = g.pitch
      if (g.roll !== 0) roll = g.roll
      if (g.yaw !== 0) yaw = g.yaw
    }

    // Quantize to 2 decimals so stick micro-jitter doesn't spam the WS.
    const key = `${round2(throttle)}|${round2(pitch)}|${round2(roll)}|${round2(yaw)}`
    if (key === lastSentRef.current) return
    lastSentRef.current = key
    send({
      type: 'pilot_input',
      throttle: round2(throttle),
      pitch: round2(pitch),
      roll: round2(roll),
      yaw: round2(yaw),
    })
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

  // Gamepad polling via Browser Gamepad API. Runs entirely in the web
  // dashboard — no backend changes; gamepad values feed the same
  // `pilot_input` WS message the keyboard already sends. Mode 2 mapping:
  //   Left stick  Y -> throttle (+up)     axes[1] inverted
  //   Left stick  X -> yaw      (+right)  axes[0]
  //   Right stick Y -> pitch    (+fwd)    axes[3] inverted
  //   Right stick X -> roll     (+right)  axes[2]
  useEffect(() => {
    const onConnect = (ev: GamepadEvent) => {
      const p = ev.gamepad
      console.log(
        `[gamepad] connected idx=${p.index} id="${p.id}" ` +
        `mapping="${p.mapping}" axes=${p.axes.length} buttons=${p.buttons.length}`
      )
    }
    const onDisconnect = (ev: GamepadEvent) => {
      console.log(`[gamepad] disconnected idx=${ev.gamepad.index} id="${ev.gamepad.id}"`)
    }
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)

    let raf = 0
    let wasConnected = false
    // Previous button-pressed snapshot for rising-edge detection (arm/disarm
    // and auto-landing must fire once per press, not every tick held).
    let prevButtons: boolean[] = []
    const loop = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      let pad: Gamepad | null = null
      for (const p of pads) {
        if (p && p.connected) {
          pad = p
          break
        }
      }
      if (pad) {
        if (!wasConnected) {
          wasConnected = true
          setGamepadConnected(true)
          console.log(
            `[gamepad] active idx=${pad.index} id="${pad.id}" ` +
            `mapping="${pad.mapping}"`
          )
        }
        const ax = pad.axes
        const throttle = -applyDeadzoneExpo(ax[1] ?? 0)
        const yaw = applyDeadzoneExpo(ax[0] ?? 0)
        const pitch = -applyDeadzoneExpo(ax[3] ?? 0)
        const roll = applyDeadzoneExpo(ax[2] ?? 0)

        // Button handling.
        const btn = pad.buttons.map((b) => b.pressed)
        const rising = (i: number) => btn[i] === true && prevButtons[i] !== true

        // R1 -> arm, L1 -> disarm (rising edge so a single tap = one command).
        if (rising(BTN_R1)) send({ type: 'arm' })
        if (rising(BTN_L1)) send({ type: 'disarm' })

        // D-pad Left -> classic sonar-based auto-landing (DESCENT free-fall
        // until sonar approach alt, then brake, then cut at touchdown).
        if (rising(BTN_DPAD_LEFT)) send({ type: 'start_landing' })

        // D-pad Down -> controlled descent. Holds throttle at LANDING_THROTTLE
        // via the backend sequencer, auto-disarms on ground touch.
        if (rising(BTN_DPAD_DOWN)) send({ type: 'start_controlled_descent' })

        prevButtons = btn
        gamepadAxesRef.current = { throttle, pitch, roll, yaw }
      } else {
        if (wasConnected) {
          wasConnected = false
          setGamepadConnected(false)
        }
        prevButtons = []
        gamepadAxesRef.current = null
      }
      syncState()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }, [syncState])

  return { active, onMouseDown, onMouseUp, gamepadConnected }
}
