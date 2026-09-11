// ─────────────────────────────────────────────────────────
//  Socket Context — single Socket.io connection shared app-wide
// ─────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

// Create socket ONCE outside component so it's never null
const socket = io(BACKEND, {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
})

export function SocketProvider({ children }) {
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    function onConnect()    { setConnected(true)  }
    function onDisconnect() { setConnected(false) }

    socket.on('connect',    onConnect)
    socket.on('disconnect', onDisconnect)

    return () => {
      socket.off('connect',    onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}