import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// import.meta.env is undefined outside Vite (node --test), hence the optional chain
const BASE = import.meta.env?.VITE_API_URL ?? "http://localhost:8000";

/**
 * One socket per signed-in user. The browser attaches the session cookie to
 * the handshake; the server joins rooms from membership, so the client emits
 * nothing (server/docs/protocol.md).
 *
 * `handlers` is { [event]: fn }. Read through a ref so a re-render with new
 * closures never tears the connection down.
 */
export function useSocket(userId, handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!userId) return;

    const socket = io(BASE, { withCredentials: true });
    const dispatch = (event) => (payload) => latest.current[event]?.(payload);

    // socket.io emits "connect" on every (re)connect; the server re-runs its
    // whole connect path each time, so the client refetches to close any gap
    // while it was away. The first connect is not a gap: App already fetched.
    let first = true;
    socket.on("connect", () => {
      if (first) {
        first = false;
        return;
      }
      latest.current.reconnect?.();
    });
    socket.on("connect_error", (error) => {
      if (error.message === "Unauthorized") latest.current.unauthorized?.();
    });

    for (const event of Object.keys(latest.current)) {
      if (event === "reconnect" || event === "unauthorized") continue;
      socket.on(event, dispatch(event));
    }

    return () => {
      socket.disconnect();
    };
  }, [userId]);
}
