import { EMOTE_COOLDOWN_MS, getEmoteCooldownRemaining, isEmoteId, type EmoteId, type GameState, type GameStatus, type Player } from "@valenor/shared";

/** Wie oft ein Computer-Gegner auf ein passendes Ereignis reagiert. Selten, damit es überrascht statt nervt. */
export const COMPUTER_EMOTE_CHANCE = 0.3;
/** Ab dieser Miete flucht der Zahlende bzw. lacht der Besitzer. */
export const COMPUTER_EMOTE_RENT_THRESHOLD = 100;

/** Prüft eine Emote-Anfrage vom Handy; liefert die Fehlermeldung oder undefined, wenn sie gültig ist. */
export function validateEmoteRequest(emoteId: unknown, player: Player | undefined, roomPhase: GameStatus | undefined): string | undefined {
  if (!isEmoteId(emoteId)) return "Diese Reaktion kennt der Chronist nicht.";
  if (!player || player.connectionState !== "connected") return "Deine Verbindung konnte nicht bestätigt werden.";
  if (roomPhase !== "playing") return "Reaktionen gibt es erst, wenn die Chronik läuft.";
  return undefined;
}

export type EmoteAttempt = { ok: true } | { ok: false; cooldownMs: number };

/**
 * Abklingzeit je Spieler und Raum. Liegt nur im Speicher des Servers: Emotes sind kein Teil des Spielstands
 * und überstehen bewusst keinen Neustart.
 */
export class EmoteGate {
  private readonly lastSentAt = new Map<string, number>();

  constructor(private readonly cooldownMs = EMOTE_COOLDOWN_MS) {}

  tryEmote(roomCode: string, playerId: string, now: number): EmoteAttempt {
    const key = `${roomCode}:${playerId}`;
    const remaining = getEmoteCooldownRemaining(this.lastSentAt.get(key), now, this.cooldownMs);
    if (remaining > 0) return { ok: false, cooldownMs: remaining };
    this.lastSentAt.set(key, now);
    return { ok: true };
  }

  clearRoom(roomCode: string): void {
    const prefix = `${roomCode}:`;
    for (const key of this.lastSentAt.keys()) if (key.startsWith(prefix)) this.lastSentAt.delete(key);
  }
}

export interface ComputerEmote {
  playerId: string;
  emoteId: EmoteId;
}

/**
 * Sucht in den neuen Einträgen des Wirtschaftsprotokolls nach Anlässen für Computer-Gegner.
 * `random` liefert Werte in [0, 1); je Anlass wird einmal gewürfelt.
 */
export function pickComputerEmotes(state: GameState, seenLogIds: ReadonlySet<string>, random: () => number = Math.random): ComputerEmote[] {
  const isComputer = (playerId: string | undefined) => state.players.some(player => player.id === playerId && player.type === "computer" && !player.isBankrupt);
  const candidates: ComputerEmote[] = [];
  for (const entry of state.economyLog) {
    if (seenLogIds.has(entry.id)) continue;
    const [first, second] = entry.playerIds;
    if (entry.kind === "purchase" && isComputer(first)) candidates.push({ playerId: first!, emoteId: "cheer" });
    if (entry.kind === "quest" && isComputer(first)) candidates.push({ playerId: first!, emoteId: "cheer" });
    if (entry.kind === "dragon" && entry.relicId && isComputer(first)) candidates.push({ playerId: first!, emoteId: "awe" });
    if (entry.kind === "rent" && Math.abs(entry.amount ?? 0) >= COMPUTER_EMOTE_RENT_THRESHOLD) {
      if (isComputer(first)) candidates.push({ playerId: first!, emoteId: "curse" });
      if (isComputer(second)) candidates.push({ playerId: second!, emoteId: "laugh" });
    }
  }
  // Höchstens eine Reaktion je Spieler und Spielstand.
  const chosen = new Map<string, ComputerEmote>();
  for (const candidate of candidates) if (!chosen.has(candidate.playerId) && random() < COMPUTER_EMOTE_CHANCE) chosen.set(candidate.playerId, candidate);
  return [...chosen.values()];
}
