import { BOARD_TILES, CROWN_TAX, DRAGON_TITHE, describeRent, getPriceInfo, getPropertyGroup, type GameState, type PlayerColor, type PriceInfo } from "@valenor/shared";
import { getFieldArtAsset } from "../game/assets/asset-manifest";

export type LandingTone = "buy" | "rent" | "own" | "card" | "danger" | "neutral";

/** Was das Handy nach dem eigenen Wurf über das Zielfeld zeigt. Liest nur den Spielstand. */
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
  /** Groß angezeigt: die Miete auf fremdem Feld oder der Kaufpreis auf freiem Feld. */
  price?: { label: "Miete" | "Kaufpreis"; info: PriceInfo } | undefined;
  /** Woraus sich die Miete zusammensetzt, z. B. „Gruppe komplett – doppelte Miete“. */
  details: string[];
  /** Die Figur steht schon: Das Zielfeld bleibt klein sichtbar, während Kauf, Zahlung oder Karte laufen. */
  settled: boolean;
}

/** Ab dem Wurf, solange gezogen wird; der Wurf zählt erst, wenn kein Runenstein mehr über ihn entscheidet. */
const LIVE_PHASES = new Set<GameState["turnPhase"]>(["rolling", "moving", "cardMoving", "landed", "dungeonTransfer"]);
/** Nach der Landung bis zum Zugende oder nächsten Wurf. */
const SETTLED_PHASES = new Set<GameState["turnPhase"]>(["awaitingCardDraw", "cardAcknowledgement", "cardResolving", "propertyDecision", "paymentRequired", "taxResolution", "tavernDecision", "tavernRolling", "waitingForEndTurn"]);

export function getLandingPreview(state: GameState, playerId: string): LandingPreview | undefined {
  const movement = state.lastMovement;
  if (state.status !== "playing" || state.currentPlayerId !== playerId || movement?.playerId !== playerId) return undefined;
  const live = LIVE_PHASES.has(state.turnPhase) && !(state.turnPhase === "rolling" && state.turnContext.awaitingRuneStoneDecision);
  if (!live && !SETTLED_PHASES.has(state.turnPhase)) return undefined;
  const tile = BOARD_TILES[movement.to];
  if (!tile) return undefined;
  const group = getPropertyGroup(tile.propertyGroupId);
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index);
  const owner = ownership ? state.players.find(player => player.id === ownership.ownerId) : undefined;
  const base = {
    tileIndex: tile.index, name: tile.name, imagePath: getFieldArtAsset(tile)?.path,
    groupName: group?.displayName, groupColor: group?.accent, ownerName: owner?.name, ownerColor: owner?.color,
    details: [] as string[], settled: !live
  };
  if (movement.kind === "dungeonTransfer") return { ...base, action: "Ab in den Dunklen Kerker", tone: "danger" };
  if (tile.economy) {
    if (!ownership) return { ...base, action: "Frei – du kannst es kaufen", tone: "buy", price: { label: "Kaufpreis", info: getPriceInfo(state, tile, "purchase", playerId) } };
    if (ownership.ownerId === playerId) return { ...base, ownerName: "dir", action: "Dein Grundstück – hier zahlst du nichts", tone: "own" };
    if (ownership.mortgaged) return { ...base, action: `Gehört ${owner?.name ?? "einem Gefährten"} – belehnt, keine Miete`, tone: "neutral" };
    return { ...base, action: `Gehört ${owner?.name ?? "einem Gefährten"} – du zahlst Miete`, tone: "rent", price: { label: "Miete", info: getPriceInfo(state, tile, "rent", playerId) }, details: describeRent(state, tile) };
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
