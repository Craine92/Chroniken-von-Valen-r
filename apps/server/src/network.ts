import { networkInterfaces } from "node:os";

function isPrivateAddress(address: string): boolean {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

export function findLocalAddress(): string {
  const candidates = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal);

  return (
    candidates.find((entry) => isPrivateAddress(entry.address))?.address ??
    candidates[0]?.address ??
    "localhost"
  );
}

export function createControllerUrl(roomCode: string): string {
  const protocol = process.env.PUBLIC_PROTOCOL ?? "http";
  const host = process.env.PUBLIC_HOST ?? findLocalAddress();
  const port =
    process.env.PUBLIC_CLIENT_PORT ??
    (process.env.NODE_ENV === "production" ? process.env.PORT ?? "3001" : "5173");
  return `${protocol}://${host}:${port}/controller?room=${encodeURIComponent(roomCode)}`;
}
