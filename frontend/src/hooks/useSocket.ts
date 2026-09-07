import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

/** Returns a singleton, authenticated Socket.IO connection shared across the app. */
export function useSocket(): Socket | null {
  const ref = useRef<Socket | null>(sharedSocket);

  useEffect(() => {
    const token = localStorage.getItem("devflow_access_token");
    if (!token) return;

    if (!sharedSocket) {
      sharedSocket = io("/", { auth: { token }, autoConnect: true });
    }
    ref.current = sharedSocket;

    return () => {
      // Intentionally not disconnecting here: the socket is shared across
      // pages/components. It's torn down on logout instead.
    };
  }, []);

  return ref.current;
}

export function disconnectSocket() {
  sharedSocket?.disconnect();
  sharedSocket = null;
}
