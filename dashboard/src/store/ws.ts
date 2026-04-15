import { create } from 'zustand'
import type { OutboundMessage } from '@/lib/ws-types'

interface WsStore {
  ws: WebSocket | null
  send: (msg: OutboundMessage) => void
  setSocket: (ws: WebSocket | null) => void
}

export const useWs = create<WsStore>((set, get) => ({
  ws: null,
  setSocket: (ws) => set({ ws }),
  send: (msg) => {
    const ws = get().ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  },
}))
