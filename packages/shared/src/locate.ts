import type { PlayerColor } from "./game";

/** „Wo bin ich?“: Ein Spieler lässt seine Figur auf dem TV kurz pulsieren. Rein darstellend, kein Teil des Spielstands. */
export interface LocateSignal {
  id: string;
  playerId: string;
  color: PlayerColor;
  sentAt: number;
}

/** So lange pulsiert die Figur bzw. ihr Wappen auf dem TV. */
export const LOCATE_PULSE_MS = 3_000;
/** Pro Spieler; der Server erzwingt sie, damit niemand das Brett dauerhaft blinken lässt. */
export const LOCATE_COOLDOWN_MS = 3_000;
