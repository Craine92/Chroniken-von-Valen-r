import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@valenor/shared";

export type ValenorSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createValenorSocket(): ValenorSocket {
  const explicitUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
  const serverUrl =
    explicitUrl ??
    (import.meta.env.DEV
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : window.location.origin);

  return io(serverUrl, {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 700,
    reconnectionDelayMax: 3_000
  });
}
