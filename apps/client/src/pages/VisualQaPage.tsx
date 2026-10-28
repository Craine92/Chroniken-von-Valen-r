import { useEffect, useState, type ReactNode } from "react";
import { BOARD_TILES, CHRONICLE_EVENTS, DUNGEON_TILE_INDEX, getRegionalChronicleDefinition, getAutoMortgagePlan, getWorldImpulseDefinition, type BuildingLevel, type GamePlayerState, type GameRoom, type GameState, type Player, type PropertyOwnership } from "@valenor/shared";
import { BrandMark } from "../components/BrandMark";
import { PropertyCard } from "../components/PropertyCard";
import { PropertyGroupOverview } from "../components/PropertyGroupOverview";
import { TradePanel } from "../components/TradePanel";
import { TradeTab } from "../components/TradeTab";
import { QuickTradePriceScreen, createQuickTradeDraft, type QuickTradeDraft } from "../components/QuickTradePanel";
import { GameExperience } from "../game/GameExperience";
import type { BoardPresentationMode } from "../game/board-presentation";
import { MobileTradeNotice, MobileTurnNotice, PaymentManagement, RuneStoneDecisionPanel } from "./ControllerPage";
import { MobileWorldImpulseToast, WorldImpulseDecisionPanel } from "../components/WorldImpulseUi";
import { MobileLiveEvents } from "../components/MobileLiveEvents";
import { CardReveal } from "../components/CardReveal";
import { ControllerActionBar } from "../components/ControllerActionBar";
import { ControllerPossessions, ControllerPropertyDetails } from "../components/ControllerPossessions";
import { ControllerJournal } from "../components/ControllerJournal";
import { PlayerPortrait } from "../components/PlayerPortrait";
import { Icon } from "../components/icons/Icon";
import { EmoteBar } from "../components/EmoteBar";
import { LocateButton } from "../components/LocateButton";
import { MobileTargetField } from "../components/MobileTargetField";
import { MobileWorldStatus } from "../components/MobileWorldStatus";
import { RealmBackdrop } from "../components/RealmBackdrop";
import { GameResultPanel } from "../components/GameResultPanel";
import { MobileVictorySummary } from "../components/victory/MobileVictorySummary";
import { showcaseMatchStats } from "./victory-showcase";
import { getRealmBackdrop, type RealmBackdropImage } from "../mobile/realm-backdrop";
import { getLandingPreview } from "../mobile/landing-preview";
import { LivingBoardQa, isLivingBoardScene } from "./LivingBoardQa";
import { BoardFieldsQa, isBoardFieldScene } from "./BoardFieldsQa";
import { StagingQa, isStagingScene } from "./StagingQa";
import { HostLobby } from "./HostLobby";

const PLAYERS: GamePlayerState[] = [
  { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver" as const, connectionState: "connected", gold: 1_725, position: 7, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight" as const, connectionState: "connected", gold: 1_430, position: 18, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p3", name: "Ragna", type: "computer", color: "red", characterId: "orcWarlord" as const, connectionState: "connected", gold: 1_210, position: 27, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } },
  { id: "p4", name: "Eldric", type: "computer", color: "blue", characterId: "steppeScoutShaman" as const, connectionState: "connected", gold: 1_580, position: 35, isBankrupt: false, dungeon: { inDungeon: false, failedAttempts: 0 } }
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

  if (scenario === "buildings" || scenario === "groups" || scenario === "order" || scenario === "mortgages") {
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

  if (scenario === "mortgages") {
    state.propertyOwnerships = [ownership(1, "p1"), ownership(5, "p1"), ownership(11, "p2"), ownership(15, "p3")];
    state.propertyOwnerships.forEach((entry) => { entry.mortgaged = true; });
  }

  if (scenario === "impulse") {
    const definition = getWorldImpulseDefinition("harborWind");
    state.propertyOwnerships = BOARD_TILES.filter(tile => tile.type === "harbor").slice(0, 2).map(tile => ownership(tile.index, "p1"));
    state.worldImpulseEffects = { harborWindUntilRound: state.currentRound };
    state.activeWorldImpulse = { ...definition, startedAfterRound: 6, startedAtRound: 7, startedAt: Date.now() + 60_000, status: "active", expiresAtRound: 8 };
    state.worldImpulseHistory = [{ ...state.activeWorldImpulse }];
    state.weltenwegPot = 1_000;
  }

  if (scenario === "momentum") {
    state.propertyOwnerships = [ownership(1, "p1"), ownership(3, "p1")];
    state.lastMomentumCelebration = { id: "qa-group", type: "completeGroup", playerId: "p1", groupId: "group_mondhain", title: "Philipp vereint Mondhain", subtitle: "Die Baugruppe ist vollständig.", createdAt: Date.now() + 60_000 };
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
          <span aria-hidden="true"><Icon name="figure" /></span><div><small>DEIN GEFÄHRTE</small><strong>{player.name}</strong></div><b><Icon name="gold" className="controller-gold-icon" />{player.gold}</b>
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
          <a href="#controller-action"><span><Icon name="dice" /></span>Aktion</a><a href="#controller-property"><span><Icon name="property" /></span>Besitz</a><a href="#controller-trade"><span><Icon name="trade" /></span>Handel</a><a href="#controller-journal"><span><Icon name="journal" /></span>Journal</a>
        </nav>
      </section>
    </main>
  );
}

/** `grandStart`: Handy des Startspielers, während der Fernseher über die vier Reiche fliegt. */
function ControllerTurnShowcase({ grandStart = false }: { grandStart?: boolean }) {
  const player = PLAYERS[0]!;
  return (
    <main className="controller-page controller-page--active player-theme--violet visual-qa-controller visual-qa-controller--turn">
      <section className="controller-card controller-card--started">
        <BrandMark compact />
        <div className="controller-player-bar controller-player-bar--violet">
          <span aria-hidden="true"><Icon name="figure" /></span><div><small>RUNDE 7 · AM ZUG</small><strong>{player.name}</strong></div><b><Icon name="gold" className="controller-gold-icon" />{player.gold} Gold</b>
        </div>
        <div className="controller-card__intro"><p className="eyebrow">Dein Zug</p><h1>Das Schicksal wartet.</h1><p>Wirf die Runenwürfel und beginne deine Reise.</p></div>
        <div className="controller-gold"><span>DEIN VERMÖGEN</span><strong>1.725</strong><small>Goldstücke</small></div>
        <div className="turn-controls" id="controller-action">
          <p className="waiting-copy">Du bist am Zug</p>
          <button className="turn-action-button" type="button"><span aria-hidden="true"><Icon name="dice" /></span> Würfeln</button>
          <p className="controller-hint">Der gemeinsame Bildschirm zeigt anschließend deinen Weg.</p>
          {grandStart && <button type="button" className="grand-start-skip">Spielstart überspringen</button>}
        </div>
        <nav className="controller-nav" aria-label="Controller-Bereiche">
          <a href="#controller-action"><span><Icon name="dice" /></span>Aktion</a><a href="#controller-property"><span><Icon name="property" /></span>Besitz</a><a href="#controller-trade"><span><Icon name="trade" /></span>Handel</a><a href="#controller-journal"><span><Icon name="journal" /></span>Journal</a>
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
        <div className="controller-player-bar controller-player-bar--violet"><span aria-hidden="true"><Icon name="figure" /></span><div><small>RUNDE 7 · AM ZUG</small><strong>Philipp</strong></div><b><Icon name="gold" className="controller-gold-icon" />1.725</b></div>
        <MobileTurnNotice currentName={foreign ? "Justine" : "Philipp"} own={!foreign} />
        <MobileTradeNotice proposerName="Justine" />
        <div id="controller-trade"><TradePanel state={state} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} /></div>
      </section>
    </main>
  );
}

function ControllerQaNav({ active = "action" }: { active?: "action" | "property" | "trade" | "journal" }) {
  return <nav className="controller-nav" aria-label="Controller-Bereiche">
    <a href="#controller-action" aria-current={active === "action" ? "page" : undefined}><span><Icon name="dice" /></span>Aktion</a>
    <a href="#controller-property" aria-current={active === "property" ? "page" : undefined}><span><Icon name="property" /></span>Besitz</a>
    <a href="#controller-trade" aria-current={active === "trade" ? "page" : undefined}><span><Icon name="trade" /></span>Handel</a>
    <a href="#controller-journal" aria-current={active === "journal" ? "page" : undefined}><span><Icon name="journal" /></span>Journal</a>
  </nav>;
}

function MobileQaShell({ children, active = "action", primary, secondary, backdrop }: {
  children: ReactNode;
  active?: "action" | "property" | "trade" | "journal";
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  /** Hintergrund aus dem Feldbild unter der eigenen Figur (wie auf dem echten Handy). */
  backdrop?: RealmBackdropImage | undefined;
}) {
  const player = PLAYERS[0]!;
  return <main className="controller-page controller-page--active player-theme--violet visual-qa-controller">
    <RealmBackdrop image={backdrop} />
    <section className="controller-card controller-card--started">
      <header className="controller-player-bar controller-player-bar--violet">
        <PlayerPortrait characterId={player.characterId} />
        <div><strong>{player.name}</strong><small>RUNDE 21 · AM ZUG</small></div>
        <b><Icon name="gold" className="controller-gold-icon" />1.948<i className="controller-connection-dot is-connected" /></b>
      </header>
      {children}
      <ControllerQaNav active={active} />
      <ControllerActionBar primary={primary} secondary={secondary} />
    </section>
  </main>;
}

function MobileActionQa({ variant }: { variant: "fate" | "buy" }) {
  const state = createShowcaseState(variant === "fate" ? "fate-card" : "purchase");
  if (variant === "fate") return <MobileQaShell primary={{ label: "Weiter", onClick: () => undefined }}><section className="controller-card-event"><CardReveal activeCard={state.activeCard!} /></section></MobileQaShell>;
  return <MobileQaShell primary={{ label: "Kaufen · 100 Gold", onClick: () => undefined }} secondary={{ label: "Auktion starten", onClick: () => undefined }}><div className="personal-turn-result"><span><Icon name="dice" /> 3 + 2 = <strong>5</strong></span><span><Icon name="arrow-right" /> <strong>{BOARD_TILES[6]!.name}</strong></span></div><div className="controller-economy"><PropertyCard tile={BOARD_TILES[6]!} state={state} compact /></div></MobileQaShell>;
}

/** Ein Chronik-Ereignis, das nur in den genannten Reichen gilt (Runde 7 bis 9). */
function withRegionalEvent(state: GameState, eventId: string, regions: ("elves" | "humans" | "orcs" | "steppe")[]): GameState {
  const definition = getRegionalChronicleDefinition(CHRONICLE_EVENTS.find(event => event.id === eventId)!, regions);
  state.activeChronicleEvent = { ...definition, startedAfterRound: state.currentRound - 1, startedAtRound: state.currentRound, expiresAtRound: state.currentRound + 2, startedAt: 1 };
  return state;
}

/** Feinschliff am Handy: Zielfeld mit Miete oder Kaufpreis samt Ereignis, Kerker-Transfer und der Ereignis-Hinweis oben. */
/** Handy nach dem Spiel: Ergebnis, Platz, eigene Auszeichnungen, eigene Zahlen und Verlauf. */
function MobileVictoryQa({ playerId }: { playerId: string }) {
  const state = createShowcaseState("buildings");
  state.currentRound = 12;
  state.status = "finished"; state.players[2]!.isBankrupt = true; state.winnerId = "p4"; state.winnerIds = ["p4"];
  state.gameResult = { finishReason: "quickGameTimeExpired", winnerIds: ["p4"], finishedAt: Date.now() - 60_000, roundsPlayed: 12 };
  state.matchStats = showcaseMatchStats(state);
  const player = state.players.find(entry => entry.id === playerId)!;
  return <main className={`controller-page controller-page--active player-theme--${player.color} visual-qa-controller`}>
    <section className="controller-card controller-card--started end-controller"><BrandMark compact /><GameResultPanel gameState={state} viewerId={playerId} /><MobileVictorySummary gameState={state} playerId={playerId} /></section>
  </main>;
}

/** Handy-Hintergrund je Reich: Feldbild unter der eigenen Figur, abgedunkelt und unscharf. */
function MobileRealmBackdropQa({ position }: { position: number }) {
  const state = createShowcaseState("buildings");
  state.players[0]!.position = position;
  state.turnPhase = "waitingForEndTurn";
  state.lastMovement = { kind: "normal", sequence: 99, playerId: "p1", from: position - 3, to: position, path: [position], passedStart: false, landedTile: BOARD_TILES[position]! };
  const preview = getLandingPreview(state, "p1");
  return <MobileQaShell backdrop={getRealmBackdrop(state, "p1")} primary={{ label: "Zug beenden", onClick: () => undefined }}>
    <MobileWorldStatus state={state} />
    <div className="turn-controls"><p className="waiting-copy">Du bist am Zug</p>{preview && <MobileTargetField preview={preview} />}</div>
    <LocateButton connected onLocate={done => done({ ok: true })} />
    <EmoteBar connected onSend={(_, done) => done({ ok: true })} />
  </MobileQaShell>;
}

function MobileFeinschliffQa({ variant }: { variant: "rent" | "buy" | "dungeon" | "events" }) {
  const state = createShowcaseState("buildings");
  state.currentRound = 7;
  state.propertyOwnerships = state.propertyOwnerships.filter(entry => ![6, 8, 9, 26].includes(entry.tileIndex));
  let to = 8;
  if (variant === "rent" || variant === "events") {
    state.propertyOwnerships.push(ownership(6, "p3"), ownership(8, "p3", 3), ownership(9, "p3"));
    withRegionalEvent(state, "blood-moon", ["elves", "orcs"]);
  }
  if (variant === "buy") { to = 26; withRegionalEvent(state, "traders-festival", ["orcs"]); }
  if (variant === "events") state.worldImpulseEffects = { buildingFervor: true };
  state.turnPhase = variant === "dungeon" ? "dungeonTransfer" : "moving";
  state.lastMovement = variant === "dungeon"
    ? { kind: "dungeonTransfer", sequence: 99, playerId: "p1", from: 3, to: DUNGEON_TILE_INDEX, path: [DUNGEON_TILE_INDEX], passedStart: false, landedTile: BOARD_TILES[DUNGEON_TILE_INDEX]! }
    : { kind: "normal", sequence: 99, playerId: "p1", from: 3, to, path: [to], passedStart: false, landedTile: BOARD_TILES[to]! };
  const preview = getLandingPreview(state, "p1");
  useEffect(() => {
    if (variant === "events") document.querySelector<HTMLDetailsElement>(".mobile-world-status")?.setAttribute("open", "");
  }, [variant]);
  return <MobileQaShell>
    <MobileWorldStatus state={state} />
    <div className="turn-controls">{preview && <MobileTargetField preview={preview} />}</div>
    <LocateButton connected onLocate={done => done({ ok: true })} />
  </MobileQaShell>;
}

function MobilePossessionsQa({ detail = false, trade = false, event = false }: { detail?: boolean; trade?: boolean; event?: boolean }) {
  const state = createShowcaseState("four");
  // Segen der Baumeister nur im Amethystwald: dort sinken die Baukosten, anderswo nicht.
  if (event) withRegionalEvent(state, "builders-blessing", ["elves"]);
  state.players[0]!.relics = ["golden-feather", "runestone"];
  if (trade) state.players[1]!.name = "Myrra mit einem sehr langen Namen";
  state.propertyOwnerships = trade
    ? [ownership(6, "p1", 2), ownership(8, "p2", 3)]
    : [ownership(1, "p1", 1), ownership(3, "p1", 1), ownership(6, "p1", 2), ownership(8, "p2", 1)];
  const callbacks = { onSelectGroup: () => undefined, onBuild: () => undefined, onMortgage: () => undefined };
  useEffect(() => {
    if (!detail) document.querySelector<HTMLDetailsElement>(".controller-property-group")?.setAttribute("open", "");
  }, [detail]);
  return <MobileQaShell active="property">{detail
    ? <><button className="controller-back"><Icon name="chevron-left" /> Zur Gruppe</button><h2 className="controller-detail-heading">Grundstück</h2><ControllerPropertyDetails state={state} playerId="p1" connected tile={BOARD_TILES[1]!} {...callbacks} /></>
    : <ControllerPossessions state={state} playerId="p1" connected {...callbacks} onOfferTrade={() => undefined} />}</MobileQaShell>;
}

function MobileFinanceQa() {
  const state = createShowcaseState("four");
  state.players[0]!.gold = 20;
  state.propertyOwnerships = [ownership(1, "p1"), ownership(3, "p1"), ownership(5, "p1"), ownership(11, "p1")];
  state.propertyOwnerships[3]!.mortgaged = true;
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", payeeId: "p2", creditorType: "player", reasonType: "rent", amount: 150, reason: "Miete für die Eisenfeste" };
  const callbacks = { onSelectGroup: () => undefined, onBuild: () => undefined, onMortgage: () => undefined, onRedeemAllMortgages: () => undefined };
  return <MobileQaShell active="property" primary={{ label: "Sofort beleihen", onClick: () => undefined }}>
    <PaymentManagement payment={state.pendingPayment} playerGold={state.players[0]!.gold} hasLegalPaymentAction connected onSettle={() => undefined} autoMortgagePlan={getAutoMortgagePlan(state, "p1")} onAutoMortgage={() => undefined} onDeclareBankruptcy={() => undefined} showActions={false} />
    <ControllerPossessions state={state} playerId="p1" connected {...callbacks} />
  </MobileQaShell>;
}

function MobileDungeonPaymentQa() {
  const state = createShowcaseState("dungeon");
  state.players[0]!.gold = 20;
  state.players[0]!.dungeon = { inDungeon: true, failedAttempts: 3 };
  state.turnPhase = "paymentRequired";
  state.pendingPayment = { payerId: "p1", creditorType: "bank", reasonType: "dungeonRelease", amount: 50, reason: "Kerkergebühr" };
  state.propertyOwnerships = [ownership(1, "p1"), ownership(3, "p1")];
  return <MobileQaShell primary={{ label: "SOFORT BELEIHEN", onClick: () => undefined }}>
    <PaymentManagement payment={state.pendingPayment} playerGold={20} hasLegalPaymentAction connected onSettle={() => undefined}
      autoMortgagePlan={getAutoMortgagePlan(state, "p1")} onAutoMortgage={() => undefined} onDeclareBankruptcy={() => undefined} showActions={false} />
  </MobileQaShell>;
}

function MobileRuneStoneQa() {
  return <MobileQaShell primary={{ label: "WURF BEHALTEN", onClick: () => undefined }} secondary={{ label: "NEU WÜRFELN", onClick: () => undefined }}>
    <RuneStoneDecisionPanel connected onReroll={() => undefined} onKeep={() => undefined} showActions={false} />
    <div className="personal-turn-result"><span><Icon name="dice" /> 2 + 3 = <strong>5</strong></span></div>
  </MobileQaShell>;
}

function MobileTradeQa({ mode }: { mode: "partner" | "composer" | "assets" | "review" | "incoming" }) {
  const state = createShowcaseState("four");
  state.players[0]!.relics = ["runestone"];
  state.players[1]!.relics = ["golden-feather"];
  state.propertyOwnerships = [ownership(1, "p1"), ownership(3, "p1"), ownership(10, "p2"), ownership(12, "p2")];
  if (mode === "incoming") state.trades = [{ id: "qa-counter", counterToTradeId: "qa-old", proposerId: "p2", recipientId: "p1", offer: { gold: 0, propertyTileIndices: [10] }, request: { gold: 390, propertyTileIndices: [1] }, status: "pending", createdAt: Date.now() }];
  useEffect(() => {
    if (mode !== "assets" && mode !== "review") return;
    const timer = window.setTimeout(() => {
      if (mode === "assets") {
        document.querySelector<HTMLButtonElement>('.trade-compose-side[data-side="offer"] .trade-add-assets')?.click();
        return;
      }
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Du gibst Gold direkt"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (input && setter) {
        setter.call(input, "300");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      window.setTimeout(() => document.querySelector<HTMLButtonElement>(".controller-action-bar .is-primary")?.click(), 30);
    }, 30);
    return () => window.clearTimeout(timer);
  }, [mode]);
  const draftIntent = mode === "composer" || mode === "assets" || mode === "review" ? { id: 1, recipientId: "p2", requestedPropertyTileIndices: [10] } : undefined;
  return <MobileQaShell active="trade"><TradePanel state={state} playerId="p1" connected onCreate={() => undefined} onDecision={() => undefined} {...(draftIntent ? { draftIntent } : {})} /></MobileQaShell>;
}

function MobileQuickTradeQa({ mode }: { mode: "overview" | "buy" | "sell" | "incoming" | "counter" | "own" }) {
  const state = createShowcaseState("four");
  state.propertyOwnerships = [ownership(1, "p1"), ownership(3, "p2"), ownership(10, "p2"), ownership(12, "p2"), ownership(26, "p3"), ownership(27, "p3", 1), ownership(29, "p3")];
  const lena = state.players[1]!;
  if (mode === "incoming" || mode === "counter") state.trades = [{ id: "qa-quick", mode: "quick", proposerId: lena.id, recipientId: "p1", offer: { gold: 180, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [1] }, status: "pending", createdAt: Date.now(), quickSnapshot: { round: state.currentRound, mortgaged: false } }];
  if (mode === "own") state.trades = [{ id: "qa-own", mode: "quick", proposerId: "p1", recipientId: lena.id, offer: { gold: 70, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [3] }, status: "pending", createdAt: Date.now(), quickSnapshot: { round: state.currentRound, mortgaged: false } }];
  const initial: QuickTradeDraft | undefined = mode === "buy" ? createQuickTradeDraft(state, "p1", 3) : mode === "sell" ? createQuickTradeDraft(state, "p1", 1) : mode === "counter" ? { tileIndex: 1, counterToTradeId: "qa-quick", gold: 180 } : undefined;
  const [draft, setDraft] = useState(initial);
  return <MobileQaShell active="trade">{draft
    ? <QuickTradePriceScreen state={state} playerId="p1" draft={draft} onChange={setDraft} onBack={() => setDraft(undefined)} onSend={() => undefined} />
    : <TradeTab state={state} playerId="p1" connected onCreate={() => undefined} onQuickCreate={() => undefined} onDecision={() => undefined} />}</MobileQaShell>;
}

function QuickTradeTvQa({ sealed = false }: { sealed?: boolean }) {
  const state = createShowcaseState("four");
  state.propertyOwnerships = [...state.propertyOwnerships.filter(entry => entry.tileIndex !== 10), ownership(10, "p2")];
  const trade = { id: "qa-tv", mode: "quick" as const, proposerId: "p1", recipientId: "p2", offer: { gold: 180, propertyTileIndices: [] }, request: { gold: 0, propertyTileIndices: [10] }, status: sealed ? "accepted" as const : "pending" as const, createdAt: Date.now() };
  state.trades = [trade];
  state.lastTradeAction = { id: `qa-tv-${sealed ? "sealed" : "open"}`, tradeId: trade.id, type: sealed ? "accepted" : "created", proposerId: "p1", recipientId: "p2", createdAt: Date.now() };
  return <GameExperience gameState={state} suppressIntro />;
}

function MobileJournalQa() {
  const state = createShowcaseState("impulse");
  state.economyLog = [
    { id: "qa-purchase", kind: "purchase", message: "Philipp kaufte Mondpfad für 100 Gold.", playerIds: ["p1"], createdAt: Date.now() - 2_000 },
    { id: "qa-quest", kind: "quest", message: "Auftrag Reisender abgeschlossen · +100 Gold.", playerIds: ["p1"], createdAt: Date.now() - 1_000 }
  ];
  state.trades = [{ id: "qa-done", proposerId: "p1", recipientId: "p2", offer: { gold: 390, propertyTileIndices: [1] }, request: { gold: 0, propertyTileIndices: [10] }, status: "accepted", createdAt: Date.now() }];
  return <MobileQaShell active="journal"><ControllerJournal state={state} playerId="p1" /></MobileQaShell>;
}

function ControllerImpulseShowcase({ variant = "golden" }: { variant?: "golden" | "twist" | "live" }) {
  const state = createShowcaseState("four");
  const impulseId = variant === "twist" ? "twistOfFate" : variant === "live" ? "harborWind" : "goldenMoment";
  const definition = getWorldImpulseDefinition(impulseId);
  state.turnPhase = "worldImpulseDecision";
  state.activeWorldImpulse = { ...definition, startedAfterRound: 6, startedAtRound: 7, startedAt: Date.now() + 60_000, status: "active", targetPlayerId: "p1" };
  state.worldImpulseHistory = [{ ...state.activeWorldImpulse }];
  if (variant !== "live") state.pendingWorldImpulseDecision = { impulseId: variant === "twist" ? "twistOfFate" : "goldenMoment", playerId: "p1", status: "decision" };
  if (variant === "live") {
    state.turnPhase = "waitingForEndTurn";
    state.worldImpulseEffects = { harborWindUntilRound: state.currentRound };
  }
  return <main className="controller-page controller-page--active player-theme--violet visual-qa-controller">
    <MobileWorldImpulseToast impulse={state.activeWorldImpulse} />
    <section className="controller-card controller-card--started"><BrandMark compact />
      <div className="controller-player-bar controller-player-bar--violet"><span aria-hidden="true"><Icon name="figure" /></span><div><small>RUNDE 7</small><strong>Philipp</strong></div><b><Icon name="gold" className="controller-gold-icon" />1.725</b></div>
      {variant === "live"
        ? <MobileLiveEvents state={state} playerId="p2" />
        : <WorldImpulseDecisionPanel state={state} playerId="p1" connected onChoose={() => undefined} />}
      <ControllerQaNav />
    </section>
  </main>;
}

function MobileEmotesQa({ cooldown = false }: { cooldown?: boolean }) {
  return <MobileQaShell>
    <div className="turn-controls"><p className="waiting-copy">Justine ist am Zug</p><p className="controller-hint">Blick zum gemeinsamen Bildschirm …</p></div>
    <EmoteBar connected onSend={(_, done) => done({ ok: true })} initialCooldownUntil={cooldown ? Date.now() + 3_400 : 0} />
  </MobileQaShell>;
}

/** Handy direkt nach dem eigenen Wurf: Zielfeld mit Bild, Gruppe, Besitzer und was dort passiert. */
function MobileTargetQa({ owned = false }: { owned?: boolean }) {
  const state = createShowcaseState("buildings");
  const to = owned ? 24 : 26;
  state.turnPhase = "moving";
  state.propertyOwnerships = state.propertyOwnerships.filter(entry => entry.tileIndex !== 26);
  state.lastMovement = { kind: "normal", sequence: 99, playerId: "p1", from: 18, to, path: [to], passedStart: false, landedTile: BOARD_TILES[to]! };
  const preview = getLandingPreview(state, "p1");
  return <MobileQaShell>
    <div className="turn-controls">{preview && <MobileTargetField preview={preview} />}</div>
    <LocateButton connected onLocate={done => done({ ok: true })} />
    <EmoteBar connected onSend={(_, done) => done({ ok: true })} />
  </MobileQaShell>;
}

function createResultState(shared = false): GameState {
  const state = createShowcaseState("buildings");
  const scores = [
    { playerId: "p1", goldValue: 1_725, propertyValue: 620, buildingValue: 600, mortgageLiability: 0, netPropertyValue: 620, totalNetWorth: 2_945, propertyCount: 3, buildingCount: 11, developedPropertyCount: 3, completeGroupCount: 1, highestBuildingLevel: 5 as const, heldCardCount: 1 },
    { playerId: "p2", goldValue: 1_430, propertyValue: 440, buildingValue: 300, mortgageLiability: 0, netPropertyValue: 440, totalNetWorth: 2_170, propertyCount: 3, buildingCount: 6, developedPropertyCount: 3, completeGroupCount: 1, highestBuildingLevel: 3 as const, heldCardCount: 0 },
    { playerId: "p4", goldValue: 1_580, propertyValue: 1_020, buildingValue: 450, mortgageLiability: 0, netPropertyValue: 1_020, totalNetWorth: 3_050, propertyCount: 3, buildingCount: 9, developedPropertyCount: 3, completeGroupCount: 1, highestBuildingLevel: 4 as const, heldCardCount: 0 }
  ];
  state.players[2]!.isBankrupt = true;
  state.status = "finished";
  state.finishReason = "quickGameTimeExpired";
  const winnerIds = shared ? ["p4", "p1"] : ["p4"];
  if (shared) scores[0]!.totalNetWorth = 3_050;
  state.winnerId = "p4";
  state.winnerIds = winnerIds;
  state.finalScores = scores.sort((left, right) => right.totalNetWorth - left.totalNetWorth);
  state.gameResult = { finishReason: "quickGameTimeExpired", winnerIds, finishedAt: Date.now(), roundsPlayed: 7, scores: state.finalScores };
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

/** TV-Lobby mit Titelbild und Beispielgefährten, ohne Verbindung zum Spielserver. */
function LobbyQa({ empty = false }: { empty?: boolean }) {
  const players: Player[] = empty ? [] : [
    { id: "p1", name: "Philipp", type: "human", color: "violet", characterId: "elvenSpellweaver", ready: true, connectionState: "connected", joinedAt: 1 },
    { id: "p2", name: "Justine", type: "human", color: "green", characterId: "humanKnight", ready: false, connectionState: "connected", joinedAt: 2 },
    { id: "c1", name: "Ragna", type: "computer", color: "red", characterId: "orcWarlord", ready: true, connectionState: "connected", joinedAt: 3 },
    { id: "c2", name: "Eldric", type: "computer", color: "blue", characterId: "steppeScoutShaman", ready: true, connectionState: "connected", joinedAt: 4 }
  ];
  const room: GameRoom = { code: "VAL-7Q2K", players, phase: "lobby", config: { mode: "chronicles" }, createdAt: 1 };
  const noop = () => undefined;
  return <HostLobby room={room} controllerUrl="http://192.168.178.24:5173/controller?room=VAL-7Q2K" connected busy={false} error="" creditsOpen={false}
    onAddComputer={noop} onRemovePlayer={noop} onConfigChange={noop} onStart={noop} onOpenCredits={noop} onCloseCredits={noop} />;
}

export function VisualQaPage() {
  const search = new URLSearchParams(window.location.search);
  const scenario = search.get("scene") ?? "four";
  const boardPresentationMode: BoardPresentationMode = search.get("presentation") === "tabletop" ? "tabletop" : "gameplay";
  if (scenario === "stress") return <StressShowcase />;
  if (scenario === "movement-corner") return <MovementShowcase kind="corner" />;
  if (scenario === "movement-multi") return <MovementShowcase kind="multi" />;
  if (scenario === "movement-wrap") return <MovementShowcase kind="wrap" />;
  if (scenario === "mobile-action-fate") return <MobileActionQa variant="fate" />;
  if (scenario === "mobile-action-buy") return <MobileActionQa variant="buy" />;
  if (scenario === "mobile-possessions-groups") return <MobilePossessionsQa />;
  if (scenario === "mobile-possessions-trade") return <MobilePossessionsQa trade />;
  if (scenario === "mobile-property-detail") return <MobilePossessionsQa detail />;
  if (scenario === "mobile-prices-event") return <MobilePossessionsQa event />;
  if (scenario === "mobile-prices-event-detail") return <MobilePossessionsQa detail event />;
  if (scenario === "mobile-target-rent-event") return <MobileFeinschliffQa variant="rent" />;
  if (scenario === "mobile-target-buy-event") return <MobileFeinschliffQa variant="buy" />;
  if (scenario === "mobile-target-dungeon") return <MobileFeinschliffQa variant="dungeon" />;
  if (scenario === "mobile-world-status") return <MobileFeinschliffQa variant="events" />;
  if (scenario === "mobile-victory") return <MobileVictoryQa playerId="p4" />;
  if (scenario === "mobile-victory-second") return <MobileVictoryQa playerId="p1" />;
  if (scenario === "mobile-realm-elves") return <MobileRealmBackdropQa position={8} />;
  if (scenario === "mobile-realm-orcs") return <MobileRealmBackdropQa position={26} />;
  if (scenario === "mobile-realm-steppe") return <MobileRealmBackdropQa position={34} />;
  if (scenario === "mobile-finance") return <MobileFinanceQa />;
  if (scenario === "mobile-dungeon-payment") return <MobileDungeonPaymentQa />;
  if (scenario === "mobile-runestone") return <MobileRuneStoneQa />;
  if (scenario === "mobile-trade-partner") return <MobileTradeQa mode="partner" />;
  if (scenario === "mobile-trade-composer") return <MobileTradeQa mode="composer" />;
  if (scenario === "mobile-trade-assets") return <MobileTradeQa mode="assets" />;
  if (scenario === "mobile-trade-review") return <MobileTradeQa mode="review" />;
  if (scenario === "mobile-trade-counter") return <MobileTradeQa mode="incoming" />;
  if (scenario === "mobile-journal") return <MobileJournalQa />;
  if (scenario === "mobile-quick-trade") return <MobileQuickTradeQa mode="overview" />;
  if (scenario === "mobile-quick-trade-buy") return <MobileQuickTradeQa mode="buy" />;
  if (scenario === "mobile-quick-trade-sell") return <MobileQuickTradeQa mode="sell" />;
  if (scenario === "mobile-quick-trade-incoming") return <MobileQuickTradeQa mode="incoming" />;
  if (scenario === "mobile-quick-trade-counter") return <MobileQuickTradeQa mode="counter" />;
  if (scenario === "mobile-quick-trade-own") return <MobileQuickTradeQa mode="own" />;
  if (scenario === "quick-trade") return <QuickTradeTvQa />;
  if (scenario === "quick-trade-sealed") return <QuickTradeTvQa sealed />;
  if (scenario === "controller-turn") return <ControllerTurnShowcase />;
  if (scenario === "controller-grand-start") return <ControllerTurnShowcase grandStart />;
  if (scenario === "controller-feedback") return <ControllerFeedbackShowcase />;
  if (scenario === "controller-impulse") return <ControllerImpulseShowcase />;
  if (scenario === "controller-impulse-twist") return <ControllerImpulseShowcase variant="twist" />;
  if (scenario === "controller-impulse-live") return <ControllerImpulseShowcase variant="live" />;
  if (scenario === "controller-foreign") return <ControllerFeedbackShowcase foreign />;
  if (scenario === "controller-property") return <ControllerPropertyShowcase />;
  if (scenario === "result" || scenario === "victory-pose") return <GameExperience gameState={createResultState()} boardPresentationMode={boardPresentationMode} />;
  if (scenario === "victory-pose-shared") return <GameExperience gameState={createResultState(true)} boardPresentationMode={boardPresentationMode} />;
  if (scenario === "controller-emotes") return <MobileEmotesQa />;
  if (scenario === "controller-emotes-cooldown") return <MobileEmotesQa cooldown />;
  if (isBoardFieldScene(scenario)) return <BoardFieldsQa scene={scenario} />;
  if (isStagingScene(scenario)) return <StagingQa scene={scenario} createBase={() => createShowcaseState("buildings")} />;
  if (scenario === "lobby") return <LobbyQa />;
  if (scenario === "controller-target") return <MobileTargetQa />;
  if (scenario === "controller-target-rent") return <MobileTargetQa owned />;
  if (scenario === "lobby-empty") return <LobbyQa empty />;
  if (isLivingBoardScene(scenario)) return <LivingBoardQa scene={scenario} createBase={() => createShowcaseState("buildings")} />;
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
  if (scenario === "mortgages") return <GameExperience gameState={createShowcaseState(scenario)} boardPresentationMode={boardPresentationMode} suppressIntro />;
  if (scenario === "buildings") return <GameExperience gameState={createShowcaseState(scenario)} boardPresentationMode={boardPresentationMode} suppressIntro />;
  if (scenario === "impulse" || scenario === "momentum") return <GameExperience gameState={createShowcaseState(scenario)} boardPresentationMode={boardPresentationMode} suppressIntro />;
  return <GameExperience gameState={createShowcaseState(scenario)} boardPresentationMode={boardPresentationMode} />;
}
