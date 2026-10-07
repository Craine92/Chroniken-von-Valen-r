import type { GamePlayerState } from "./game";

export type RelicId = "runestone" | "merchant-seal" | "dungeon-amulet" | "golden-feather";
export const MAX_RELICS = 2;
export const RELIC_DEFINITIONS: Readonly<Record<RelicId, { id: RelicId; name: string; description: string; shortDescription: string; symbol: string }>> = {
  runestone: { id: "runestone", name: "Runenstein", description: "Einmal einen normalen Würfelwurf wiederholen. Der neue Wurf ersetzt den alten.", shortDescription: "Wurf einmal wiederholen", symbol: "ᚱ" },
  "merchant-seal": { id: "merchant-seal", name: "Siegel des Händlers", description: "Der nächste direkte Kauf eines freien Grundstücks kostet 25 % weniger. Gilt nicht bei Auktionen.", shortDescription: "Nächster Kauf −25 %", symbol: "◇" },
  "dungeon-amulet": { id: "dungeon-amulet", name: "Kerkeramulett", description: "Verhindert einmal, dass du in den Dunklen Kerker geschickt wirst.", shortDescription: "Einmal vor dem Kerker geschützt", symbol: "✧" },
  "golden-feather": { id: "golden-feather", name: "Goldene Feder", description: "Beim nächsten Passieren des Runentors erhältst du zusätzlich 100 Gold, auch während des Chronik-Segens.", shortDescription: "Nächstes Runentor +100 Gold", symbol: "➶" }
};

export const RELIC_ACTIONS: Readonly<Record<Exclude<RelicId, "runestone">, { label: string; status: string }>> = {
  "merchant-seal": { label: "Für nächsten Kauf aktivieren", status: "AKTIV · wartet auf deinen nächsten Kauf" },
  "dungeon-amulet": { label: "Kerkeramulett aktivieren", status: "AKTIV · schützt vor dem nächsten Kerker-Eintritt" },
  "golden-feather": { label: "Für nächstes Runentor aktivieren", status: "AKTIV · +100 Gold beim nächsten Runentor" }
};

export const RELIC_USE_MESSAGES: Readonly<Record<RelicId, string>> = {
  runestone: "Das Schicksal wird neu geworfen.",
  "merchant-seal": "25 % Händlerrabatt genutzt.",
  "dungeon-amulet": "Das Amulett bewahrt dich vor dem Kerker.",
  "golden-feather": "+100 Gold am Runentor."
};

export function isRelicArmed(player: GamePlayerState | undefined, id: RelicId): boolean {
  return Boolean(player?.relics?.includes(id) && player.armedRelics?.includes(id));
}

export function isRelicTradeBound(state: import("./game").GameState, player: GamePlayerState, id: RelicId): boolean {
  return isRelicArmed(player, id) || (id === "runestone" && state.currentPlayerId === player.id && Boolean(state.turnContext.awaitingRuneStoneDecision));
}

export function consumeRelic(player: GamePlayerState, id: RelicId): boolean {
  const index = player.relics?.indexOf(id) ?? -1;
  if (index < 0) return false;
  player.relics!.splice(index, 1);
  player.armedRelics = player.armedRelics?.filter(relic => relic !== id) ?? [];
  return true;
}
