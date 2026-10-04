import { useEffect, useState } from "react";
import { BOARD_TILES, DUNGEON_TILE_INDEX, type BuildingLevel, type GamePlayerState, type GameState, type PropertyOwnership } from "@valenor/shared";
import { BrandMark } from "../components/BrandMark";
import { PropertyCard } from "../components/PropertyCard";
import { PropertyGroupOverview } from "../components/PropertyGroupOverview";
import { TradePanel } from "../components/TradePanel";
import { GameExperience } from "../game/GameExperience";
import type { BoardPresentationMode } from "../game/board-presentation";
import { MobileTradeNotice, MobileTurnNotice } from "./ControllerPage";

const PLAYERS: GamePlayerState[] = [
  { id: "p1", name: "Philipp", type: "human", color: "violet", connectionState: "connected", gold: 1_725, position: 7, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p2", name: "Justine", type: "human", color: "green", connectionState: "connected", gold: 1_430, position: 18, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p3", name: "Ragna", type: "computer", color: "red", connectionState: "connected", gold: 1_210, position: 27, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p4", name: "Eldric", type: "computer", color: "blue", connectionState: "connected", gold: 1_580, position: 35, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
];

function ownership(tileIndex: number, ownerId: string, buildingLevel: BuildingLevel = 0): PropertyOwnership {
  return { tileIndex, ownerId, buildingLevel, mortgaged: false };
}

function createShowcaseState(scenario: string): GameState {
  const empty = scenario === "empty";
  const players = empty ? [] : PLAYERS.map((player) => ({ ...player, dungeon: { ...player.dungeon } }));
  const state: GameState = {
    roomId: "VISUAL-QA",
    status: "playing",
    config: { mode: "chronicles" },
    players,
    turnOrder: players.map((player) => player.id),
    orderRolls: players.map((player) => ({ playerId: player.id, rolls: [] })),
    orderContenders: [],
    orderRollTargetCount: 1,
    ...(players[0] ? { currentPlayerId: players[0].id } : {}),
    currentTurnIndex: 0,
    currentRound: 7,
    turnNumber: 25,
    turnPhase: "waitingForRoll",
    turnContext: { consecutiveDoubles: 0, pendingExtraRoll: false, rollSequence: 14 },
    propertyOwnerships: [],
    buildingBank: { settlementUnitsAvailable: 21, grandStructuresAvailable: 9 },
    economyLog: [],
    trades: [],
    startedAt: Date.now() - 1_800_000
  };

  if (scenario === "buildings" || scenario === "groups" || scenario === "order") {
    state.propertyOwnerships = [
      ownership(1, "p1", 2), ownership(3, "p1", 4), ownership(6, "p1", 5),
      ownership(10, "p2", 1), ownership(12, "p2", 3), ownership(14, "p2", 2),
      ownership(21, "p3", 4), ownership(23, "p3", 1), ownership(24, "p3", 5),
      ownership(30, "p4", 2), ownership(31, "p4", 3), ownership(34, "p4", 4)
    ];
    state.economyLog = [{ id: "build-log", kind: "building", message: "Die vier Reiche wachsen unter goldenen Siegeln.", playerIds: players.map((player) => player.id), createdAt: Date.now() }];
    state.economyLog.push(
      { id: "purchase-log", kind: "purchase", message: "Philipp kaufte Flüsterhain für 100 Gold.", playerIds: ["p1"], createdAt: Date.now() - 1_000 },
      { id: "rent-log", kind: "rent", message: "Justine zahlte 40 Gold an Ragna.", playerIds: ["p2", "p3"], createdAt: Date.now() - 500 }
    );
  }

  if (scenario === "order") {
    state.turnPhase = "determiningOrder";
    state.orderContenders = players.map((player) => player.id);
    state.orderRolls = players.map((player, index) => ({ playerId: player.id, rolls: index < 2 ? [{ die1: index + 2, die2: 4, total: index + 6, isDouble: false }] : [] }));
  }

  if (scenario === "card" || scenario === "fate-card") {
    state.turnPhase = "cardAcknowledgement";
    const card = scenario === "fate-card"
      ? { cardId: "fate_008", deck: "fate" as const }
      : { cardId: "adv_002", deck: "adventure" as const };
    state.activeCard = { ...card, playerId: "p1", status: "readyToAcknowledge" };
    state.cardResolution = { ...card, playerId: "p1", effectIndex: 1, status: "readyToAcknowledge", chainDepth: 0, pendingPayments: [] };
  }

  if (scenario === "dungeon") {
    const captive = state.players[2]!;
    captive.position = DUNGEON_TILE_INDEX;
    captive.dungeon = { inDungeon: true, failedAttempts: 2 };
    state.currentPlayerId = captive.id;
    state.currentTurnIndex = 2;
    state.turnPhase = "dungeonDecision";
  }

  if (scenario === "auction") {
    state.currentPlayerId = "p4";
    state.currentTurnIndex = 3;
    state.turnPhase = "auction";
    state.auction = { tileIndex: 34, currentBid: 360, highestBidderId: "p2", participantIds: ["p1", "p2", "p3", "p4"], withdrawnPlayerIds: ["p3"], pausedForPlayerIds: [], revision: 6, source: "property" };
    state.lastMovement = { kind: "normal", playerId: "p4", from: 29, to: 34, path: [30, 31, 32, 33, 34], passedStart: false, landedTile: BOARD_TILES[34]! };
  }

  if (scenario === "dice") {
    state.turnPhase = "moving";
    state.lastDiceRoll = { die1: 4, die2: 2, total: 6, isDouble: false };
    state.lastMovement = { kind: "normal", sequence: 14, playerId: "p1", from: 1, to: 7, path: [2, 3, 4, 5, 6, 7], passedStart: false, landedTile: BOARD_TILES[7]! };
  }

  if (scenario === "landing") {
    state.turnPhase = "waitingForEndTurn";
    state.lastDiceRoll = { die1: 4, die2: 2, total: 6, isDouble: false };
    state.lastMovement = { kind: "normal", sequence: 14, playerId: "p1", from: 1, to: 7, path: [2, 3, 4, 5, 6, 7], passedStart: false, landedTile: BOARD_TILES[7]! };
  }

  if (scenario === "property-landing") {
    state.turnPhase = "waitingForEndTurn";
    state.lastDiceRoll = { die1: 3, die2: 2, total: 5, isDouble: false };
    state.lastMovement = { kind: "normal", sequence: 14, playerId: "p1", from: 1, to: 6, path: [2, 3, 4, 5, 6], passedStart: false, landedTile: BOARD_TILES[6]! };
  }

  if (["purchase", "rent"].includes(scenario)) {
    state.turnPhase = scenario === "purchase" ? "propertyDecision" : "paymentRequired";
    state.lastDiceRoll = { die1: 3, die2: 2, total: 5, isDouble: false };
    state.lastMovement = { kind: "normal", sequence: 15, playerId: "p1", from: 1, to: 6, path: [2, 3, 4, 5, 6], passedStart: false, landedTile: BOARD_TILES[6]! };
    if (scenario === "rent") {
      state.propertyOwnerships = [ownership(6, "p2", 2)];
      state.pendingPayment = { payerId: "p1", payeeId: "p2", creditorType: "player", reasonType: "rent", amount: 90, reason: "Miete für Flüsterhain" };
    }
  }

  if (["tax", "start"].includes(scenario)) {
    const tileIndex = scenario === "tax" ? 4 : 0;
    state.turnPhase = "waitingForEndTurn";
    state.players[0]!.position = tileIndex;
    state.lastMovement = { kind: "normal", sequence: 16, playerId: "p1", from: scenario === "tax" ? 1 : 39, to: tileIndex, path: [tileIndex], passedStart: scenario === "start", landedTile: BOARD_TILES[tileIndex]! };
  }

  return state;
}

function ControllerPropertyShowcase() {
  const player = PLAYERS[0]!;
  const tile = BOARD_TILES[6]!;
  const owned = ownership(6, player.id, 3);
  const groupTiles = BOARD_TILES.filter((candidate) => candidate.propertyGroup === "Amethystwald");
  const groupOwnerships = [owned, ownership(8, PLAYERS[1]!.id)];
  return (
    <main className="controller-page controller-page--active player-theme--violet visual-qa-controller">
      <section className="controller-card controller-card--started">
        <BrandMark compact />
        <div className="controller-player-bar controller-player-bar--violet">
          <span aria-hidden="true">♞</span><div><small>DEIN GEFÄHRTE</small><strong>{player.name}</strong></div><b><i className="valenor-coin">V</i>{player.gold}</b>
        </div>
        <div className="controller-card__intro"><p className="eyebrow">Dein Besitz</p><h1>Reich des Mondhains</h1><p>Verwalte deine Ländereien und ihre Bauwerke.</p></div>
        <section className="ownership-list" id="controller-property">
          <section className="property-group">
            <PropertyGroupOverview propertyGroup="Amethystwald" tiles={groupTiles} ownerships={groupOwnerships} players={PLAYERS} viewerId={player.id} buildAvailable={false} economicallyActive={false} />
            <div className="property-management">
              <PropertyCard tile={tile} ownership={owned} owner={player} />
              <div className="property-management__summary"><span>Aktuelle Miete <b>450 Gold</b></span><span>Nächste Stufe <b>Runenturm · 625 Gold</b></span></div>
              <div className="property-management__actions"><button type="button" disabled>Bauen · 50 Gold</button><button type="button">Baustufe verkaufen</button></div>
            </div>
          </section>
        </section>
        <nav className="controller-nav" aria-label="Controller-Bereiche">
          <a href="#controller-action"><span>✦</span>Aktion</a><a href="#controller-property"><span>♜</span>Besitz</a><a href="#controller-trade"><span>◇</span>Handel</a><a href="#controller-journal"><span>☷</span>Journal</a>
        </nav>
      </section>
    </main>
  );
}

function ControllerTurnShowcase() {
  const player = PLAYERS[0]!;
  return (
    <main className="controller-page controller-page--active player-theme--violet visual-qa-controller visual-qa-controller--turn">
      <section className="controller-card controller-card--started">
        <BrandMark compact />
        <div className="controller-player-bar controller-player-bar--violet">
          <span aria-hidden="true">♞</span><div><small>RUNDE 7 · AM ZUG</small><strong>{player.name}</strong></div><b><i className="valenor-coin">V</i>{player.gold} Gold</b>
        </div>
        <div className="controller-card__intro"><p className="eyebrow">Dein Zug</p><h1>Das Schicksal wartet.</h1><p>Wirf die Runenwürfel und beginne deine Reise.</p></div>
        <div className="controller-gold"><span>DEIN VERMÖGEN</span><strong>1.725</strong><small>Goldstücke</small></div>
        <div className="turn-controls" id="controller-action">
          <p className="waiting-copy">Du bist am Zug</p>
          <button className="turn-action-button" type="button"><span aria-hidden="true">⚄ ⚄</span> Würfeln</button>
          <p className="controller-hint">Der gemeinsame Bildschirm zeigt anschließend deinen Weg.</p>
        </div>
        <nav className="controller-nav" aria-label="Controller-Bereiche">
          <a href="#controller-action"><span>✦</span>Aktion</a><a href="#controller-property"><span>♜</span>Besitz</a><a href="#controller-trade"><span>◇</span>Handel</a><a href="#controller-journal"><span>☷</span>Journal</a>
        </nav>
      </section>
    </main>
  );
}

function ControllerFeedbackShowcase({ foreign = false }: { foreign?: boolean }) {
  const state = createShowcaseState("four");
  if (foreign) {
    state.currentPlayerId = "p2";
    state.currentTurnIndex = 1;
  }
  state.trades = [{
    id: "trade-feedback", proposerId: "p2", recipientId: "p1",
    offer: { gold: 500, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [] },
    status: "pending", createdAt: Date.now()
  }];
  useEffect(() => { document.querySelector<HTMLDetailsElement>(".trade-create")?.setAttribute("open", ""); }, []);
  return (
    <main className="controller-page controller-page--active player-theme--violet visual-qa-controller">
      <section className="controller-card controller-card--started">
        <BrandMark compact />
        <div className="controller-player-bar controller-player-bar--violet"><span aria-hidden="true">♞</span><div><small>RUNDE 7 · AM ZUG</small><strong>Philipp</strong></div><b><i className="valenor-coin">V</i>1.725</b></div>
        <MobileTurnNotice currentName={foreign ? "Justine" : "Philipp"} own={!foreign} />
        <MobileTradeNotice proposerName="Justine" />
        <div id="controller-trade"><TradePanel state={state} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} /></div>
      </section>
    </main>
  );
}

function createResultState(): GameState {
  const state = createShowcaseState("buildings");
  const scores = [
    { playerId: "p1", goldValue: 1_725, propertyValue: 620, buildingValue: 600, mortgageLiability: 0, netPropertyValue: 620, totalNetWorth: 2_945, propertyCount: 3, buildingCount: 11, developedPropertyCount: 3, completeGroupCount: 1, highestBuildingLevel: 5 as const, heldCardCount: 1 },
    { playerId: "p2", goldValue: 1_430, propertyValue: 440, buildingValue: 300, mortgageLiability: 0, netPropertyValue: 440, totalNetWorth: 2_170, propertyCount: 3, buildingCount: 6, developedPropertyCount: 3, completeGroupCount: 1, highestBuildingLevel: 3 as const, heldCardCount: 0 },
    { playerId: "p4", goldValue: 1_580, propertyValue: 1_020, buildingValue: 450, mortgageLiability: 0, netPropertyValue: 1_020, totalNetWorth: 3_050, propertyCount: 3, buildingCount: 9, developedPropertyCount: 3, completeGroupCount: 1, highestBuildingLevel: 4 as const, heldCardCount: 0 }
  ];
  state.players[2]!.isBankrupt = true;
  state.status = "finished";
  state.finishReason = "quickGameTimeExpired";
  state.winnerId = "p4";
  state.winnerIds = ["p4"];
  state.finalScores = scores.sort((left, right) => right.totalNetWorth - left.totalNetWorth);
  state.gameResult = { finishReason: "quickGameTimeExpired", winnerIds: ["p4"], finishedAt: Date.now(), roundsPlayed: 7, scores: state.finalScores };
  return state;
}

function StressShowcase() {
  const [state, setState] = useState(() => createShowcaseState("buildings"));
  useEffect(() => {
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setState((previous) => {
        const from = previous.players[0]?.position ?? 0;
        const to = [8, 11, 14, 18, 21, 24, 27, 31][step % 8]!;
        return {
          ...previous,
          players: previous.players.map((player, index) => index === 0 ? { ...player, position: to } : player),
          turnPhase: "moving",
          turnContext: { ...previous.turnContext, rollSequence: previous.turnContext.rollSequence + 1 },
          lastDiceRoll: { die1: 2, die2: 3, total: 5, isDouble: false },
          lastMovement: { kind: "normal", sequence: step, playerId: "p1", from, to, path: [to], passedStart: false, landedTile: BOARD_TILES[to]! },
          propertyOwnerships: previous.propertyOwnerships.map((entry, index) => index === 0 ? { ...entry, buildingLevel: ((step % 5) + 1) as BuildingLevel } : entry)
        };
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, []);
  return <GameExperience gameState={state} />;
}

function MovementShowcase({ kind }: { kind: "corner" | "multi" | "wrap" }) {
  const setup = kind === "corner"
    ? { from: 31, to: 35, path: [32, 33, 34, 35] }
    : kind === "multi"
      ? { from: 8, to: 22, path: Array.from({ length: 14 }, (_, index) => index + 9) }
      : { from: 39, to: 0, path: [0] };
  const [state, setState] = useState(() => {
    const initial = createShowcaseState("buildings");
    initial.players[0]!.position = setup.from;
    return initial;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setState((previous) => ({
      ...previous,
      players: previous.players.map((player, index) => index === 0 ? { ...player, position: setup.to } : player),
      turnPhase: "moving",
      turnContext: { ...previous.turnContext, rollSequence: previous.turnContext.rollSequence + 1 },
      lastDiceRoll: { die1: 4, die2: 2, total: 6, isDouble: false },
      lastMovement: { kind: "normal", sequence: 99, playerId: "p1", from: setup.from, to: setup.to, path: setup.path, passedStart: setup.path.includes(0), landedTile: BOARD_TILES[setup.to]! }
    })), 4_900);
    return () => window.clearTimeout(timer);
  }, [kind]);
  return <GameExperience gameState={state} />;
}

export function VisualQaPage() {
  const search = new URLSearchParams(window.location.search);
  const scenario = search.get("scene") ?? "four";
  const boardPresentationMode: BoardPresentationMode = search.get("presentation") === "tabletop" ? "tabletop" : "gameplay";
  if (scenario === "stress") return <StressShowcase />;
  if (scenario === "movement-corner") return <MovementShowcase kind="corner" />;
  if (scenario === "movement-multi") return <MovementShowcase kind="multi" />;
  if (scenario === "movement-wrap") return <MovementShowcase kind="wrap" />;
  if (scenario === "controller-turn") return <ControllerTurnShowcase />;
  if (scenario === "controller-feedback") return <ControllerFeedbackShowcase />;
  if (scenario === "controller-foreign") return <ControllerFeedbackShowcase foreign />;
  if (scenario === "controller-property") return <ControllerPropertyShowcase />;
  if (scenario === "result") return <GameExperience gameState={createResultState()} boardPresentationMode={boardPresentationMode} />;
  if (scenario === "one") {
    const state = createShowcaseState("four");
    state.players = state.players.slice(0, 1);
    state.turnOrder = ["p1"];
    return <GameExperience gameState={state} boardPresentationMode={boardPresentationMode} />;
  }
  if (scenario === "tokens") {
    const state = createShowcaseState("buildings");
    state.players.forEach((player) => { player.position = 7; });
    return <GameExperience gameState={state} boardPresentationMode={boardPresentationMode} />;
  }
  if (scenario === "corner-tokens") {
    const state = createShowcaseState("buildings");
    state.players.forEach((player) => { player.position = 0; });
    return <GameExperience gameState={state} boardPresentationMode={boardPresentationMode} />;
  }
  if (scenario === "groups") return <GameExperience gameState={createShowcaseState(scenario)} focusedPropertyGroupId="group_amethystwald" focusedPropertyGroupPlayerId="p1" boardPresentationMode={boardPresentationMode} />;
  return <GameExperience gameState={createShowcaseState(scenario)} boardPresentationMode={boardPresentationMode} />;
}
