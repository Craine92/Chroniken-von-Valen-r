import type { PlayerColor } from "./game";

/** Reaktionen, die Spieler vom Handy an den gemeinsamen Bildschirm senden. Rein darstellend, kein Teil des Spielstands. */
export const EMOTE_IDS = ["cheer", "curse", "laugh", "awe"] as const;
export type EmoteId = typeof EMOTE_IDS[number];

export const EMOTE_LABELS: Readonly<Record<EmoteId, string>> = {
  cheer: "Jubel",
  curse: "Fluch",
  laugh: "Lachen",
  awe: "Staunen"
};

/** Kurzer Ausruf in der Blase am Porträt. */
export const EMOTE_SHOUTS: Readonly<Record<EmoteId, string>> = {
  cheer: "Hoch die Krüge!",
  curse: "Beim Kerker!",
  laugh: "Ha-ha-ha!",
  awe: "Bei den Runen …"
};

/** Pro Spieler; der Server erzwingt sie, das Handy zeigt sie nur an. */
export const EMOTE_COOLDOWN_MS = 5_000;
/** So lange bleibt die Blase auf dem TV stehen. */
export const EMOTE_DISPLAY_MS = 3_200;

export interface EmoteSignal {
  id: string;
  playerId: string;
  emoteId: EmoteId;
  color: PlayerColor;
  sentAt: number;
}

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === "string" && (EMOTE_IDS as readonly string[]).includes(value);
}

/** Verbleibende Abklingzeit in Millisekunden; 0 heißt: Das nächste Emote darf raus. */
export function getEmoteCooldownRemaining(lastSentAt: number | undefined, now: number, cooldownMs = EMOTE_COOLDOWN_MS): number {
  if (lastSentAt === undefined) return 0;
  return Math.max(0, lastSentAt + cooldownMs - now);
}
