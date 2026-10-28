import { BOARD_TILES, CROWN_TAX, DRAGON_TITHE, getEffectivePurchasePrice, getEffectiveRent, getPropertyGroup, type GameState, type PlayerColor } from "@valenor/shared";
import { getFieldArtAsset } from "../game/assets/asset-manifest";

export type LandingTone = "buy" | "rent" | "own" | "card" | "danger" | "neutral";

/** Was das Handy direkt nach dem eigenen Wurf über das Zielfeld zeigt. Liest nur den Spielstand. */
export interface LandingPreview {
  tileIndex: number;
  name: string;
  imagePath?: string | undefined;
  groupName?: string | undefined;
  groupColor?: string | undefined;
  ownerName?: string | undefined;
  ownerColor?: PlayerColor | undefined;
  action: string;
  tone: LandingTone;
}

/** Solange gezogen wird oder die Figur gerade gelandet ist; danach übernehmen Kauf-, Auktions- oder Zahlungsansicht. */
const PREVIEW_PHASES = new Set<GameState["turnPhase"]>(["moving", "cardMoving", "landed"]);

export function getLandingPreview(state: GameState, playerId: string): LandingPreview | undefined {
  const movement = state.lastMovement;
  if (state.status !== "playing" || state.currentPlayerId !== playerId || movement?.playerId !== playerId || !PREVIEW_PHASES.has(state.turnPhase)) return undefined;
  const tile = BOARD_TILES[movement.to];
  if (!tile) return undefined;
  const group = getPropertyGroup(tile.propertyGroupId);
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index);
  const owner = ownership ? state.players.find(player => player.id === ownership.ownerId) : undefined;
  const base = {
    tileIndex: tile.index, name: tile.name, imagePath: getFieldArtAsset(tile)?.path,
    groupName: group?.displayName, groupColor: group?.accent, ownerName: owner?.name, ownerColor: owner?.color
  };
  if (tile.economy) {
    if (!ownership) return { ...base, action: `Frei – kaufen für ${getEffectivePurchasePrice(state, tile, playerId).toLocaleString("de-DE")} Gold`, tone: "buy" };
    if (ownership.ownerId === playerId) return { ...base, ownerName: "dir", action: "Dein Grundstück – hier zahlst du nichts", tone: "own" };
    if (ownership.mortgaged) return { ...base, action: `Gehört ${owner?.name ?? "einem Gefährten"} – belehnt, keine Miete`, tone: "neutral" };
    return { ...base, action: `Gehört ${owner?.name ?? "einem Gefährten"} – Miete ${getEffectiveRent(state, tile, ownership.ownerId).toLocaleString("de-DE")} Gold`, tone: "rent" };
  }
  switch (tile.type) {
    case "fate": return { ...base, action: "Schicksal – eine Karte ziehen", tone: "card" };
    case "adventure": return { ...base, action: "Abenteuer – eine Karte ziehen", tone: "card" };
    case "tax": return { ...base, action: `Abgabe ${(tile.index === 38 ? DRAGON_TITHE : CROWN_TAX).toLocaleString("de-DE")} Gold`, tone: "danger" };
    case "goToDungeon": return { ...base, action: "Ab in den Dunklen Kerker", tone: "danger" };
    case "dungeon": return { ...base, action: "Nur zu Besuch", tone: "neutral" };
    case "rest": return { ...base, action: `Taverne – im Weltenweg-Pott liegen ${(state.weltenwegPot ?? 0).toLocaleString("de-DE")} Gold`, tone: "neutral" };
    case "start": return { ...base, action: "Das Runentor – hier beginnt jede Runde", tone: "neutral" };
    default: return { ...base, action: "Blick zum gemeinsamen Bildschirm", tone: "neutral" };
  }
}
