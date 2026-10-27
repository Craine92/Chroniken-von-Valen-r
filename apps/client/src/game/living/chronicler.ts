import { BOARD_TILES, RELIC_DEFINITIONS, getPropertyGroup, type EconomyLogEntry, type GameState, type RegionType } from "@valenor/shared";
import { CHRONICLE_LINES, FLOURISHED_MOMENTS, REALM_FLOURISHES, type ChroniclePool } from "./chronicle-lines";
import { isHighRent } from "./drama";
import { deriveGameMoments, type GameMoment, type GameMomentKind } from "./moments";

export type ChronicleTone = "gain" | "loss" | "magic" | "triumph" | "neutral";

export interface ChronicleLine {
  id: string;
  /** „fact“: schlichte Zeile aus dem Wirtschaftsprotokoll für alles, was der Chronist nicht erzählt. */
  kind: GameMomentKind | "fact";
  tone: ChronicleTone;
  text: string;
}

const TONES: Readonly<Record<GameMomentKind, ChronicleTone>> = {
  victory: "triumph", groupComplete: "triumph", tradeSealed: "gain", auctionWon: "gain", purchase: "gain", build: "gain",
  tavernWin: "gain", startPass: "gain", double: "gain", dungeonLeave: "gain",
  bankrupt: "loss", rent: "neutral", dungeonEnter: "loss", tavernLoss: "loss", tax: "loss",
  dragon: "magic", chronicleEvent: "magic", worldImpulse: "magic", lastRound: "magic"
};

/** Höchstens so viele Sätze pro Spielstand, damit der Chronist erzählt statt aufzuzählen. */
export const CHRONICLE_LINES_PER_UPDATE = 2;
/** So viele Zeilen bleiben in der Seitenleiste stehen. */
export const CHRONICLE_VISIBLE_LINES = 5;

/**
 * Protokolleinträge, die kein erzählter Moment abdeckt; sie erscheinen schlicht in derselben Chronik.
 * Käufe, Mieten, Abgaben, Runentor, Drache, Taverne, Handel und Bankrott erzählt der Chronist selbst.
 */
const FACT_LOG_KINDS: ReadonlySet<EconomyLogEntry["kind"]> = new Set(["mortgage", "relic", "quest", "system"]);

function factLine(entry: EconomyLogEntry): ChronicleLine {
  return { id: `fact-${entry.id}`, kind: "fact", tone: "neutral", text: entry.message };
}

/** Beim Einschalten des TVs mitten im Spiel: die letzten Protokollzeilen, damit die Chronik nicht leer beginnt. */
export function getInitialChronicleLines(state: GameState, count = 3): ChronicleLine[] {
  return state.economyLog.slice(-count).map(factLine);
}

/**
 * Wählt eine Variante, die nicht die zuletzt gewählte ist. `random` liefert Werte in [0, 1).
 * Bei nur einer Variante bleibt keine Wahl.
 */
export function pickVariant<T>(options: readonly T[], previous: T | undefined, random: () => number): T {
  const pool = options.length > 1 && previous !== undefined && options.includes(previous) ? options.filter(option => option !== previous) : options;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

function joinNames(names: readonly string[]): string {
  return names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
}

function fill(template: string, values: Readonly<Record<string, string | undefined>>): string | undefined {
  let missing = false;
  const text = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") missing = true;
    return value ?? "";
  });
  return missing ? undefined : text;
}

/** Der Erzähler auf dem TV. Merkt sich je Ereignistyp und Reich die letzte Variante, damit sich nichts direkt wiederholt. */
export class Chronicler {
  private readonly lastTemplate = new Map<string, string>();
  private sequence = 0;

  constructor(private readonly random: () => number = Math.random) {}

  narrate(moment: GameMoment, state: GameState): ChronicleLine | undefined {
    const name = (playerId: string | undefined) => state.players.find(player => player.id === playerId)?.name;
    const tileOf = (tileIndex: number | undefined) => (tileIndex === undefined ? undefined : BOARD_TILES[tileIndex]);
    const values: Record<string, string | undefined> = {};
    let pool: ChroniclePool = moment.kind;
    let region: RegionType | undefined;

    switch (moment.kind) {
      case "purchase":
      case "auctionWon":
        values.player = name(moment.playerId); values.tile = tileOf(moment.tileIndex)?.name; values.gold = moment.amount.toLocaleString("de-DE");
        region = tileOf(moment.tileIndex)?.region;
        break;
      case "build":
        values.player = name(moment.playerId); values.tile = tileOf(moment.tileIndex)?.name; values.building = moment.buildingName;
        region = tileOf(moment.tileIndex)?.region;
        break;
      case "rent":
        values.player = name(moment.payerId); values.other = name(moment.ownerId); values.tile = tileOf(moment.tileIndex)?.name; values.gold = moment.amount.toLocaleString("de-DE");
        if (isHighRent(moment.amount, moment.payerGoldBefore)) pool = "rentHigh";
        break;
      case "groupComplete":
        values.player = name(moment.playerId); values.group = getPropertyGroup(moment.groupId)?.displayName;
        break;
      case "tradeSealed":
        values.player = name(moment.proposerId); values.other = name(moment.recipientId);
        break;
      case "dragon":
        values.player = name(moment.playerId); values.relic = moment.relicId ? RELIC_DEFINITIONS[moment.relicId].name : undefined;
        if (!moment.relicId) pool = "dragonEmpty";
        break;
      case "tavernWin":
      case "tavernLoss":
      case "tax":
      case "startPass":
        values.player = name(moment.playerId); values.gold = moment.amount.toLocaleString("de-DE");
        break;
      case "bankrupt":
      case "dungeonEnter":
      case "dungeonLeave":
      case "double":
        values.player = name(moment.playerId);
        break;
      case "chronicleEvent":
      case "worldImpulse":
        values.title = moment.title;
        break;
      case "victory":
        values.winner = joinNames(moment.winnerIds.map(id => name(id)).filter((entry): entry is string => Boolean(entry)));
        if (moment.winnerIds.length > 1) pool = "victoryShared";
        break;
      case "lastRound":
        break;
    }

    const candidates = CHRONICLE_LINES[pool].filter(template => fill(template, values) !== undefined);
    if (!candidates.length) return undefined;
    const template = pickVariant(candidates, this.lastTemplate.get(pool), this.random);
    this.lastTemplate.set(pool, template);
    let text = fill(template, values)!;
    if (region && FLOURISHED_MOMENTS.has(moment.kind)) {
      const key = `realm:${region}`;
      const flourish = pickVariant(REALM_FLOURISHES[region], this.lastTemplate.get(key), this.random);
      this.lastTemplate.set(key, flourish);
      text = `${text} – ${flourish}`;
    }
    if (!/[.!?…]$/.test(text)) text += ".";
    this.sequence += 1;
    return { id: `chronicle-${this.sequence}`, kind: moment.kind, tone: TONES[moment.kind], text };
  }
}

/** Vergleicht aufeinanderfolgende Spielstände und liefert die neuen Sätze, wichtigste zuerst. */
export class ChronicleTracker {
  private previous: GameState | undefined;

  constructor(initialState?: GameState, private readonly chronicler = new Chronicler()) {
    this.previous = initialState;
  }

  update(next: GameState): ChronicleLine[] {
    const previous = this.previous;
    this.previous = next;
    if (!previous || previous === next) return [];
    const moments = deriveGameMoments(previous, next);
    const told = moments
      .slice(0, CHRONICLE_LINES_PER_UPDATE)
      .map(moment => this.chronicler.narrate(moment, next))
      .filter((line): line is ChronicleLine => Boolean(line));
    const seen = new Set(previous.economyLog.map(entry => entry.id));
    // Bauen erzählt der Chronist; der Verkauf einer Baustufe steht nur im Protokoll.
    const soldBuilding = next.lastBuildingAction?.type === "sell" && next.lastBuildingAction.id !== previous.lastBuildingAction?.id;
    const facts = next.economyLog
      .filter(entry => !seen.has(entry.id) && (FACT_LOG_KINDS.has(entry.kind) || entry.kind === "building" && soldBuilding))
      .map(factLine);
    return [...told, ...facts];
  }
}
