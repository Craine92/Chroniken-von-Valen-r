import { useEffect, useState } from "react";
import { BOARD_TILES, type BuildingLevel, type GamePlayerState, type GameState, type LocateSignal, type PropertyOwnership, type RegionType } from "@valenor/shared";
import { GameExperience } from "../game/GameExperience";

/** Szenen für Feldbilder, Figuren auf dem Feld und Gebäude je Baustufe. */
export const BOARD_FIELD_SCENES = ["board-empty", "board-tokens-1", "board-tokens-4", "board-tokens-6", "board-tokens-6-side", "board-tokens-5-waiting", "board-side-1", "board-side-3", "board-auction", "board-ownership", "board-locate", "board-corners", "board-corner-6", "board-buildings"] as const;
export type BoardFieldScene = typeof BOARD_FIELD_SCENES[number];

export function isBoardFieldScene(scene: string): scene is BoardFieldScene {
  return (BOARD_FIELD_SCENES as readonly string[]).includes(scene);
}

const player = (id: string, name: string, type: GamePlayerState["type"], color: GamePlayerState["color"], characterId: GamePlayerState["characterId"], gold: number): GamePlayerState =>
  ({ id, name, type, color, characterId, connectionState: "connected", gold, position: 0, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } });

const SIX_PLAYERS: readonly GamePlayerState[] = [
  player("p1", "Philipp", "human", "violet", "elvenSpellweaver", 1_725),
  player("p2", "Justine", "human", "green", "humanKnight", 1_430),
  player("p3", "Ragna", "computer", "red", "orcWarlord", 1_210),
  player("p4", "Eldric", "computer", "blue", "steppeScoutShaman", 1_580),
  player("p5", "Brann", "human", "orange", "dwarf", 1_320),
  player("p6", "Ylva", "computer", "cyan", "nightElf", 1_150)
];

const own = (tileIndex: number, ownerId: string, buildingLevel: BuildingLevel): PropertyOwnership => ({ tileIndex, ownerId, buildingLevel, mortgaged: false });

/** Alle Grundstücke eines Reiches in Brettreihenfolge, bebaut mit den Stufen 1 bis 5. */
function realmLevels(region: RegionType, ownerId: string): PropertyOwnership[] {
  return BOARD_TILES.filter(tile => tile.region === region && tile.type === "property")
    .map((tile, index) => own(tile.index, ownerId, Math.min(5, index + 1) as BuildingLevel));
}

function createBoardState(scene: BoardFieldScene): GameState {
  const playerCount = scene === "board-empty" ? 0 : scene === "board-tokens-1" || scene === "board-side-1" ? 1 : scene === "board-side-3" ? 3 : scene === "board-tokens-4" || scene === "board-buildings" || scene === "board-auction" || scene === "board-ownership" ? 4 : 6;
  const players = SIX_PLAYERS.slice(0, playerCount).map(entry => ({ ...entry, dungeon: { ...entry.dungeon } }));
  const place = (positions: readonly number[]) => players.forEach((entry, index) => { entry.position = positions[index] ?? positions[0]!; });
  let propertyOwnerships: PropertyOwnership[] = [];
  let currentPlayerId = players[0]?.id;
  let auction: GameState["auction"];
  if (scene === "board-tokens-1") {
    place([3]);
    propertyOwnerships = [own(3, "p1", 2)];
  } else if (scene === "board-tokens-4") {
    place([16, 16, 16, 16]);
    propertyOwnerships = [own(16, "p2", 3)];
    currentPlayerId = "p3";
  } else if (scene === "board-tokens-6" || scene === "board-locate") {
    // Der volle Fall: höchste Baustufe und sechs Figuren auf einem Feld der oberen Reihe.
    place([24, 24, 24, 24, 24, 24]);
    propertyOwnerships = [own(24, "p3", 5), own(23, "p3", 3), own(21, "p3", 4)];
    currentPlayerId = "p4";
  } else if (scene === "board-tokens-6-side") {
    place([37, 37, 37, 37, 37, 37]);
    propertyOwnerships = [own(37, "p4", 5), own(39, "p4", 5)];
    currentPlayerId = "p2";
  } else if (scene === "board-tokens-5-waiting") {
    // Volles Feld, die aktive Figur steht woanders: vorne steht, wer als Nächste dran ist (p3 nach p2).
    place([9, 0, 9, 9, 9, 9]);
    propertyOwnerships = [own(9, "p1", 4)];
    currentPlayerId = "p2";
  } else if (scene === "board-side-1") {
    place([16]);
    propertyOwnerships = [own(16, "p1", 3)];
  } else if (scene === "board-side-3") {
    place([18, 18, 18]);
    propertyOwnerships = [own(18, "p2", 5), own(16, "p2", 2), own(19, "p2", 1)];
    currentPlayerId = "p2";
  } else if (scene === "board-auction") {
    // Laufende Auktion um Rotfels: Lichtkegel, Rahmen und das Feldbild groß in der Anzeige.
    place([24, 7, 31, 12]);
    propertyOwnerships = [own(21, "p3", 0), own(23, "p3", 1)];
    auction = { tileIndex: 24, currentBid: 260, highestBidderId: "p4", participantIds: ["p1", "p2", "p3", "p4"], withdrawnPlayerIds: [], pausedForPlayerIds: [], revision: 3, source: "property" };
  } else if (scene === "board-ownership") {
    // Teilbesitz (Punkte in Spielerfarbe) und eine komplette Gruppe (Krone, doppelter Rahmen).
    place([5, 26, 31, 38]);
    propertyOwnerships = [own(26, "p3", 0), own(27, "p3", 2), own(29, "p3", 5), own(21, "p1", 0), own(24, "p2", 0), own(31, "p4", 0), own(1, "p2", 0), own(3, "p2", 1)];
  } else if (scene === "board-corners") {
    place([0, 13, 20, 20, 33, 33]);
    players[1]!.dungeon = { inDungeon: true, failedAttempts: 1 };
    currentPlayerId = "p3";
  } else if (scene === "board-corner-6") {
    place([0, 0, 0, 0, 0, 0]);
    currentPlayerId = "p5";
  } else if (scene === "board-buildings") {
    place([7, 17, 25, 36]);
    propertyOwnerships = [...realmLevels("elves", "p1"), ...realmLevels("humans", "p2"), ...realmLevels("orcs", "p3"), ...realmLevels("steppe", "p4")];
  }
  return {
    roomId: "VISUAL-QA", status: "playing", config: { mode: "chronicles" },
    players, turnOrder: players.map(entry => entry.id),
    orderRolls: players.map(entry => ({ playerId: entry.id, rolls: [] })), orderContenders: [], orderRollTargetCount: 1,
    ...(currentPlayerId ? { currentPlayerId } : {}),
    currentTurnIndex: Math.max(0, players.findIndex(entry => entry.id === currentPlayerId)), currentRound: 7, turnNumber: 25, turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 14 },
    propertyOwnerships, buildingBank: { settlementUnitsAvailable: 21, grandStructuresAvailable: 9 },
    economyLog: [], trades: [], startedAt: Date.now() - 1_800_000,
    ...(auction ? { auction, turnPhase: "auction" as const } : {})
  };
}

export function BoardFieldsQa({ scene }: { scene: BoardFieldScene }) {
  const [state] = useState(() => createBoardState(scene));
  const [locateSignal, setLocateSignal] = useState<LocateSignal>();
  // „Wo bin ich?“ für ein Wappen auf dem vollen Feld, sobald das Brett steht (wie vom Handy gesendet).
  useEffect(() => {
    if (scene !== "board-locate") return;
    const timer = window.setTimeout(() => setLocateSignal({ id: "qa-locate", playerId: "p2", color: "green", sentAt: Date.now() }), 6_000);
    return () => window.clearTimeout(timer);
  }, [scene]);
  return <GameExperience gameState={state} suppressIntro locateSignal={locateSignal} />;
}
