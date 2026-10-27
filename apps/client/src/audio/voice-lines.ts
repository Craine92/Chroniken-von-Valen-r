import { BOARD_TILES, getPropertyGroupTiles, type GameState, type PlayerCharacterId, type RegionType, type WorldImpulseId } from "@valenor/shared";
import { isHighRent } from "../game/living/drama";
import type { GameMoment } from "../game/living/moments";
import { VOICE_FILES, VOICE_PATH } from "./audio-config";

/** Schlüssel einer Datei: „drache-2“ → „drache“, „sieg-troll“ bleibt „sieg-troll“. */
export const voiceKeyOf = (file: string) => file.replace(/-\d+$/, "");

/** Alle Varianten je Schlüssel als Pfade. */
export const VOICE_LINES: Readonly<Record<string, readonly string[]>> = VOICE_FILES.reduce<Record<string, string[]>>((lines, file) => {
  (lines[voiceKeyOf(file)] ??= []).push(VOICE_PATH(file));
  return lines;
}, {});

export type VoicePriority = "high" | "normal";

export interface VoiceRequest {
  key: string;
  priority: VoicePriority;
}

const REALM_WORDS: Readonly<Record<RegionType, string>> = { elves: "elfen", humans: "menschen", orcs: "orks", steppe: "steppe" };

export const VICTORY_VOICE: Readonly<Record<PlayerCharacterId, string>> = {
  elvenSpellweaver: "sieg-elfen-zauberwirker", humanKnight: "sieg-ritter", orcWarlord: "sieg-ork-kriegsherr",
  steppeScoutShaman: "sieg-steppen-schamane", dwarf: "sieg-zwerg", tauren: "sieg-tauren", troll: "sieg-troll", nightElf: "sieg-nachtelf"
};

export const CHRONICLE_EVENT_VOICE: Readonly<Record<string, string>> = {
  "blood-moon": "ereignis-blutmond", "crown-decree": "ereignis-erlass-der-krone", "traders-festival": "ereignis-fest-der-haendler",
  "four-realms-peace": "ereignis-frieden", "golden-building-boom": "ereignis-goldene-baukonjunktur", "resource-shortage": "ereignis-rohstoffknappheit",
  "builders-blessing": "ereignis-segen-der-baumeister", "runegate-blessing": "ereignis-segen-des-runentors"
};

export const WORLD_IMPULSE_VOICE: Readonly<Record<WorldImpulseId, string>> = {
  buildingFervor: "impuls-baueifer", dragonCall: "impuls-drachenruf", goldenMoment: "impuls-goldener-augenblick", merchantLuck: "impuls-haendlerglueck",
  harborWind: "impuls-hafenwind", crownFavor: "impuls-kronengunst", marketCry: "impuls-marktschrei", runeSpark: "impuls-runenfunke",
  twistOfFate: "impuls-schicksalswende", worldwayDonation: "impuls-weltenweg-spende"
};

/** Spielbeginn: einmal pro Partie. */
export const GAME_START_VOICE: VoiceRequest = { key: "start", priority: "normal" };

const high = (key: string): VoiceRequest => ({ key, priority: "high" });
const normal = (key: string): VoiceRequest => ({ key, priority: "normal" });

/**
 * Welcher Satz zu einem Moment gehört. Kauf und Abgabe bleiben still, Bauen spricht nur bei Baustufe 5 und Miete nur,
 * wenn sie so hoch ist wie für den Spannungsmoment. Sieg, Bankrott und Drache haben Vorrang.
 */
export function getVoiceRequest(moment: GameMoment, state: GameState): VoiceRequest | undefined {
  switch (moment.kind) {
    case "victory": {
      if (moment.winnerIds.length !== 1) return high("sieg-gemeinsam");
      const character = state.players.find(player => player.id === moment.winnerIds[0])?.characterId;
      return high(character ? VICTORY_VOICE[character] : "sieg-gemeinsam");
    }
    case "bankrupt": return high("bankrott");
    case "dragon": return high("drache");
    case "groupComplete": {
      const region = getPropertyGroupTiles(moment.groupId)[0]?.region;
      return region ? normal(`gruppe-${REALM_WORDS[region]}`) : undefined;
    }
    case "build": {
      const region = BOARD_TILES[moment.tileIndex]?.region;
      return moment.level === 5 && region ? normal(`bau-max-${REALM_WORDS[region]}`) : undefined;
    }
    case "rent": return isHighRent(moment.amount, moment.payerGoldBefore) ? normal("miete-hoch") : undefined;
    case "tradeSealed": return normal("handel");
    case "auctionWon": return normal("auktion");
    case "dungeonEnter": return normal("kerker-rein");
    case "dungeonLeave": return normal("kerker-raus");
    case "tavernWin": return normal("taverne-gewinn");
    case "tavernLoss": return normal("taverne-verlust");
    case "double": return normal("pasch");
    case "lastRound": return normal("letzte-runde");
    case "chronicleEvent": return CHRONICLE_EVENT_VOICE[moment.eventId] ? normal(CHRONICLE_EVENT_VOICE[moment.eventId]!) : undefined;
    case "worldImpulse": return normal(WORLD_IMPULSE_VOICE[moment.impulseId]);
    case "purchase":
    case "tax":
    case "startPass":
      return undefined;
  }
}

/**
 * Pro Spielstand höchstens ein Satz: zuerst Sieg, Bankrott oder Drache, sonst der wichtigste vertonte Moment
 * (die Momente kommen bereits nach Wichtigkeit sortiert).
 */
export function pickVoiceRequest(moments: readonly GameMoment[], state: GameState): VoiceRequest | undefined {
  const requests = moments.map(moment => getVoiceRequest(moment, state)).filter((request): request is VoiceRequest => Boolean(request));
  return requests.find(request => request.priority === "high") ?? requests[0];
}
