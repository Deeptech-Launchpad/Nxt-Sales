import { io } from 'socket.io-client'

// Team Chat real-time layer (Update 3 / E1) — one shared socket for the whole
// app, connected lazily on first use rather than at module load, so a signed-
// out session never opens a connection with no token to authenticate it.
let socket = null

export function getSocket() {
  if (socket) return socket

  const token = localStorage.getItem('mwz_token')
  socket = io({
    path: '/socket.io',
    auth: { token },
    autoConnect: !!token,
  })
  return socket
}

// Called on logout — a stale socket must not keep presence showing "online"
// for a user who signed out.
export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null }
}
