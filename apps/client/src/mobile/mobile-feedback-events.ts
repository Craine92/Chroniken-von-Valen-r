import { BOARD_TILES, getPropertyGroup, type GameState } from "@valenor/shared";
import { openControllerTrade, type MobileFeedback } from "./mobile-feedback";

// Reads server-confirmed records only. No actions, balances or game rules are changed.
export class MobileFeedbackEventTracker {
  private scope: string | undefined;
  private previous: GameState | undefined;
  private seen = new Set<string>();

  reset(): void { this.scope = undefined; this.previous = undefined; this.seen.clear(); }

  update(state: GameState, playerId: string): MobileFeedback[] {
    const scope = `${state.roomId}:${state.startedAt}:${playerId}`;
    if (this.scope !== scope) { this.reset(); this.scope = scope; }
    const initial = !this.previous;
    const events: MobileFeedback[] = [];
    const add = (event: MobileFeedback, announceInitially = false) => {
      if (this.seen.has(event.id)) return;
      this.seen.add(event.id);
      if (!initial || announceInitially) events.push({ ...event, id: `${scope}:${event.id}` });
    };
    const viewer = state.players.find((player) => player.id === playerId);
    if (!viewer || viewer.isBankrupt || state.status !== "playing") { this.previous = state; return events; }
    const name = (id: string) => state.players.find((player) => player.id === id)?.name;
    const region = (index: number) => getPropertyGroup(BOARD_TILES[index]?.propertyGroupId);

    if (state.currentPlayerId === playerId && state.turnPhase !== "determiningOrder" && state.turnPhase !== "turnTransition") {
      add({ id: `turn:${state.turnNumber}:${playerId}`, type: "turn", title: "DU BIST AM ZUG",
        message: "Dein Abenteuer geht weiter.", hapticPattern: 80, icon: "✦" }, true);
    }
    for (const trade of state.trades) {
      if (trade.recipientId !== playerId && trade.proposerId !== playerId) continue;
      if (trade.status === "pending" && trade.recipientId === playerId) {
        add({ id: `trade:${trade.id}:pending`, type: "tradeOffer", title: "HANDELSANGEBOT",
          message: `${name(trade.proposerId) ?? "Ein Gefährte"} möchte mit dir handeln.`,
          hapticPattern: [80, 60, 80], icon: "◇",
          actionLabel: "HANDEL ANSEHEN", action: openControllerTrade }, true);
      } else if (trade.status === "accepted" || trade.status === "rejected") {
        const accepted = trade.status === "accepted";
        add({ id: `trade:${trade.id}:${trade.status}`, type: accepted ? "tradeAccepted" : "tradeRejected",
          title: accepted ? "HANDEL ANGENOMMEN" : "HANDEL ABGELEHNT",
          message: accepted ? "Der Handel wurde abgeschlossen." : "Das Angebot wurde abgelehnt.",
          hapticPattern: accepted ? 60 : undefined, icon: "◇" });
      }
    }
    const turn = state.lastTurnAction;
    // Announce the bonus only when the existing extra-roll state confirms it.
    // Waiting until landing avoids promising a roll before a dungeon/card consequence.
    if (turn?.playerId === playerId && turn.kind === "double" &&
        (state.turnContext.pendingExtraRoll || state.turnPhase === "waitingForRoll") &&
        !viewer.dungeon.inDungeon && !["rolling", "moving", "landed", "awaitingCardDraw", "cardResolving", "cardMoving", "dungeonTransfer"].includes(state.turnPhase)) {
      add({ id: `double:${turn.id}`, type: "double", title: "PASCH!",
        message: "Du darfst erneut würfeln.", hapticPattern: [50, 40, 50], icon: "⚄" });
    } else if (initial && turn) this.seen.add(`double:${turn.id}`);
    const building = state.lastBuildingAction;
    if (building?.playerId === playerId && building.type === "build") {
      add({ id: `build:${building.id}`, type: "build", title: "BAU ABGESCHLOSSEN",
        message: `${BOARD_TILES[building.tileIndex]?.name ?? "Dein Grundstück"}: ${building.buildingName} · Stufe ${building.toLevel}`,
        accent: region(building.tileIndex)?.accent, icon: region(building.tileIndex)?.sigil ?? "♜" });
    }
    for (const entry of state.economyLog) {
      if (!entry.playerIds.includes(playerId)) continue;
      if (entry.kind === "purchase") {
        const acquired = state.propertyOwnerships.filter((ownership) => ownership.ownerId === playerId &&
          !this.previous?.propertyOwnerships.some((old) => old.tileIndex === ownership.tileIndex && old.ownerId === playerId));
        const tile = acquired.length === 1 ? BOARD_TILES[acquired[0]!.tileIndex] : undefined;
        add({ id: `economy:${entry.id}`, type: "purchase", title: "GRUNDSTÜCK ERWORBEN",
          message: tile ? `${tile.name} gehört jetzt dir.` : entry.message,
          accent: tile ? region(tile.index)?.accent : undefined,
          icon: tile ? region(tile.index)?.sigil ?? "♜" : "♜" });
      } else if (entry.kind === "rent" && entry.playerIds.length === 2 && entry.amount !== undefined) {
        // EconomyService records payer first, recipient second, after settlement.
        const [payer, recipient] = entry.playerIds;
        const received = recipient === playerId;
        const other = name(received ? payer! : recipient!);
        if (!other) continue;
        add({ id: `economy:${entry.id}`, type: "coin", title: received ? "MIETE ERHALTEN" : "MIETE GEZAHLT",
          message: `${received ? "+" : "−"}${Math.abs(entry.amount)} Gold ${received ? "von" : "an"} ${other}`,
          icon: "V" });
      } else if (entry.kind === "system") {
        // CardService's draw log has a unique ID, including repeated draws of the same card.
        // Effect/payment logs deliberately do not match this authoritative draw record.
        const adventure = entry.message.startsWith(`${viewer.name} zieht Abenteuer:`);
        const fate = entry.message.startsWith(`${viewer.name} zieht Schicksal:`);
        if (adventure || fate) add({ id: `card:${entry.id}`, type: adventure ? "adventure" : "fate",
          title: adventure ? "ABENTEUER" : "SCHICKSAL",
          message: entry.message.slice(`${viewer.name} zieht ${adventure ? "Abenteuer" : "Schicksal"}:`.length).trim(),
          icon: adventure ? "✦" : "✧" });
      }
    }
    this.previous = state;
    // Offers are displayed first even when the same snapshot also starts a turn.
    return events.sort((a, b) => Number(b.type === "tradeOffer") - Number(a.type === "tradeOffer"));
  }
}
