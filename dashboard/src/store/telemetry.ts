import { create } from 'zustand'
import type {
  AlarmEvent,
  AlarmRule,
  InboundMessage,
  MotorState,
  ParamSchema,
  PilotState,
  ProfileEntry,
  SequenceEntry,
  SequenceStage,
  SequencerSnapshot,
  SonarReading,
  LandingSnapshot,
} from '@/lib/ws-types'

type WsStatus = 'idle' | 'connecting' | 'open' | 'closed'

type LogLine = { line: string; cls: 'info' | 'warn' | 'err' }
const MAX_LOG = 200

function classifyLog(line: string): LogLine['cls'] {
  if (/error|traceback|exception/i.test(line)) return 'err'
  if (/warn/i.test(line)) return 'warn'
  return 'info'
}

interface State {
  // connection
  wsStatus: WsStatus
  unityConnected: boolean

  // telemetry (last frame)
  euler: [number, number, number]
  gyro: [number, number, number]
  accel: [number, number, number]
  tilt: number
  sonars: Record<string, SonarReading>
  motors: MotorState
  pilot: PilotState
  failsafe: boolean
  armed: boolean
  recording: boolean
  recordingFile?: string
  landing: LandingSnapshot
  connectedUnity: boolean
  tServer: number

  // config / schema / profiles
  schema: ParamSchema[]
  config: Record<string, unknown>
  profiles: ProfileEntry[]

  // sequencer
  sequences: SequenceEntry[]
  sequencerStages: SequenceStage[]
  sequencerRun: SequencerSnapshot | null

  // alarms
  alarmRules: Record<string, AlarmRule>
  activeAlarms: AlarmEvent[]

  // charts rolling buffer: {t, euler, gyro, pid_split}
  samples: Array<{ t: number; euler: [number, number, number]; tilt: number; gyro: [number, number, number]; pidP: number; pidI: number; pidD: number }>

  // log
  logs: LogLine[]

  // step test
  stepResult: string | null

  // actions
  apply: (msg: InboundMessage) => void
  setStatus: (s: WsStatus) => void
  appendSamples: (s: State['samples'][number]) => void
  appendLogs: (lines: string[]) => void
}

const WINDOW_MS = 10_000

export const useTelemetry = create<State>((set) => ({
  wsStatus: 'idle',
  unityConnected: false,

  euler: [0, 0, 0],
  gyro: [0, 0, 0],
  accel: [0, 0, 0],
  tilt: 0,
  sonars: {},
  motors: { m1: 0, m2: 0, m3: 0, m4: 0, sat: [false, false, false, false] },
  pilot: { throttle: 0 },
  failsafe: false,
  armed: false,
  recording: false,
  recordingFile: undefined,
  landing: { state: 'idle', active: false },
  connectedUnity: false,
  tServer: 0,

  schema: [],
  config: {},
  profiles: [],

  sequences: [],
  sequencerStages: [],
  sequencerRun: null,

  alarmRules: {},
  activeAlarms: [],

  samples: [],
  logs: [],
  stepResult: null,

  setStatus: (s) => set({ wsStatus: s }),

  appendSamples: (s) =>
    set((state) => {
      const cutoff = s.t - WINDOW_MS / 1000
      const kept = state.samples.filter((x) => x.t >= cutoff)
      kept.push(s)
      return { samples: kept }
    }),

  appendLogs: (lines) =>
    set((state) => {
      if (lines.length === 0) return {}
      const next = state.logs.slice()
      for (const line of lines) next.push({ line, cls: classifyLog(line) })
      if (next.length > MAX_LOG) next.splice(0, next.length - MAX_LOG)
      return { logs: next }
    }),

  apply: (msg) =>
    set((state) => {
      switch (msg.type) {
        case 'hello': {
          return {
            schema: msg.schema,
            config: msg.config,
            profiles: msg.profiles,
            sequences: msg.sequences,
            alarmRules: msg.alarm_rules,
            activeAlarms: msg.active_alarms ?? [],
            armed: msg.armed,
            recording: msg.recording,
            sequencerStages: msg.sequencer?.stages ?? [],
            sequencerRun: msg.sequencer ?? null,
          }
        }
        case 'telemetry': {
          return {
            tServer: msg.t,
            euler: msg.euler,
            gyro: msg.gyro,
            accel: msg.accel,
            tilt: msg.tilt,
            sonars: msg.sonars,
            motors: msg.motors,
            pilot: msg.pilot,
            failsafe: msg.failsafe,
            armed: msg.armed,
            recording: msg.recording,
            recordingFile: msg.recording_file,
            landing: msg.landing,
            connectedUnity: msg.connected_unity,
            unityConnected: msg.connected_unity,
            sequencerRun: msg.sequencer ?? state.sequencerRun,
          }
        }
        case 'param_applied':
          return { config: { ...state.config, [msg.key]: msg.value } }
        case 'profile_list':
          return { profiles: msg.profiles }
        case 'profile_applied':
          return { config: msg.config }
        case 'armed_state':
          return { armed: msg.armed }
        case 'landing_state':
          return {
            landing: {
              state: msg.state,
              active: msg.active,
              approach_alt_m: msg.approach_alt_m,
              touchdown_alt_m: msg.touchdown_alt_m,
              landing_throttle: msg.landing_throttle,
            },
          }
        case 'recording_state':
          return { recording: msg.active, recordingFile: msg.filename }
        case 'alarm': {
          const others = state.activeAlarms.filter((a) => a.rule !== msg.rule)
          const next = msg.active
            ? [...others, {
                rule: msg.rule,
                label: msg.label,
                threshold: msg.threshold,
                value: msg.value,
                active: true,
              }]
            : others
          return { activeAlarms: next }
        }
        case 'alarm_rules':
          return { alarmRules: msg.rules }
        case 'sequence_list':
          return { sequences: msg.sequences }
        case 'sequence_loaded':
          return { sequencerStages: msg.stages }
        case 'sequence_saved':
          return {
            sequencerStages: msg.stages,
            sequences: msg.sequences ?? state.sequences,
          }
        case 'sequencer_state':
          // Don't overwrite local edits to stages — only run state
          return {
            sequencerRun: {
              state: msg.state,
              active: msg.active,
              current_idx: msg.current_idx,
              total_stages: msg.total_stages,
              current_type: msg.current_type,
              current_duration_s: msg.current_duration_s,
              elapsed_s: msg.elapsed_s,
              stages: state.sequencerStages,
              loop: msg.loop,
            },
          }
        case 'step_result': {
          const txt = `axis=${msg.axis} amp=${msg.amplitude_deg}° rise=${msg.rise_ms ?? '—'}ms settle=${msg.settle_ms ?? '—'}ms overshoot=${msg.overshoot_pct ?? '—'}%`
          return { stepResult: txt }
        }
        case 'log': {
          const line: LogLine = { line: msg.line, cls: classifyLog(msg.line) }
          const next = [...state.logs, line]
          if (next.length > MAX_LOG) next.splice(0, next.length - MAX_LOG)
          return { logs: next }
        }
        case 'log_snapshot': {
          const lines: LogLine[] = msg.lines.map((line) => ({ line, cls: classifyLog(line) }))
          return { logs: lines.slice(-MAX_LOG) }
        }
        case 'integral_reset':
        case 'error':
          return {}
        default:
          return {}
      }
    }),
}))
