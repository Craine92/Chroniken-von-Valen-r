import { RoomManager } from "./room-manager";

/** Existing gameplay tests start a ready party; readiness itself is tested separately. */
export function startReadyGame(manager: RoomManager, roomCode: string, hostSocketId: string) {
  const internal = manager as unknown as { rooms: Map<string, { players: Array<{id:string;type:string;connectionState:string;socketId?:string}> }> };
  for (const player of internal.rooms.get(roomCode)!.players) {
    if (player.type === "human" && player.connectionState === "connected" && player.socketId) manager.updatePlayerReady(roomCode,player.id,true,player.socketId);
  }
  return manager.startGame(roomCode,hostSocketId);
}
