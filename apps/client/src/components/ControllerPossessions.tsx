import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BOARD_TILES, PROPERTY_GROUPS, SOCKET_EVENTS, ECONOMY_CONFIG, getEffectiveRent, getEffectivePurchasePrice, applyChronicleRentModifier, canBuildOnProperty,
  canSellBuilding, canMortgageProperty, canRedeemMortgage, getBuildingName, getCardDefinition,
  describeCardEffects, getMortgageValue, getMortgageRedemptionCost, getPropertyGroup,
  getPropertyGroupTiles, ownsCompletePropertyGroup, isGroupEconomicallyActive,
  MAX_RELICS, RELIC_DEFINITIONS, RELIC_ACTIONS, isRelicArmed,
  type GameState, type PropertyGroupId, type BoardTile, type RelicId
} from "@valenor/shared";
import { PropertyGroupOverview } from "./PropertyGroupOverview";
import { RelicIcon } from "./RelicIcon";

interface PossessionsProps {
  state: GameState;
  playerId: string;
  connected: boolean;
  selectedGroupId?: PropertyGroupId | undefined;
  onSelectGroup: (groupId: PropertyGroupId) => void;
  onBuild: (event: "property:build" | "property:sellBuilding", tileIndex: number) => void;
  onMortgage: (event: "property:mortgage" | "property:redeemMortgage", tileIndex: number) => void;
  onActivateRelic?: (id: RelicId) => void;
  onUseRuneStone?: () => void;
}

export function ControllerRelics({ state, playerId, connected, onActivateRelic, onUseRuneStone }: Pick<PossessionsProps, "state" | "playerId" | "connected" | "onActivateRelic" | "onUseRuneStone">) {
  const player = state.players.find(entry => entry.id === playerId)!;
  const canReroll = state.currentPlayerId === playerId && state.turnPhase === "rolling" &&
    state.turnContext.rollKind === "normal" && state.turnContext.awaitingRuneStoneDecision && !player.dungeon.inDungeon;
  const canAct = connected && state.status === "playing" && !player.isBankrupt;
  return <section className="controller-relics" aria-label="Deine Relikte">
    <h3>DEINE RELIKTE <span>{player.relics?.length ?? 0} / {MAX_RELICS}</span></h3>
    {player.relics?.length ? player.relics.map(id => {
      const armed = isRelicArmed(player, id);
      return <article key={id} className={armed ? "controller-relic--armed" : undefined}>
        <RelicIcon id={id} />
        <div><strong>{RELIC_DEFINITIONS[id].name}</strong><p>{RELIC_DEFINITIONS[id].description}</p></div>
        {id === "runestone" ? <div className="controller-relic-action">
          <button type="button" disabled={!canAct || !canReroll || !onUseRuneStone} onClick={onUseRuneStone}>Neu würfeln</button>
          {!canReroll && <p>Nach einem normalen Würfelwurf verfügbar.</p>}
        </div> : <div className="controller-relic-action">
          {armed ? <p className="controller-relic-status" role="status">{RELIC_ACTIONS[id].status}</p> :
            <button type="button" disabled={!canAct || !onActivateRelic} onClick={() => onActivateRelic?.(id)}>{RELIC_ACTIONS[id].label}</button>}
        </div>}
      </article>;
    }) : <p>Noch keine Relikte. Begegne dem wandernden Drachen.</p>}
  </section>;
}

export function ControllerPropertyDetails({ state, playerId, connected, tile, onBuild, onMortgage }: Pick<PossessionsProps, "state" | "playerId" | "connected" | "onBuild" | "onMortgage"> & { tile: BoardTile }) {
  const ownership = state.propertyOwnerships.find(entry => entry.tileIndex === tile.index);
  const owner = state.players.find(player => player.id === ownership?.ownerId);
  const own = ownership?.ownerId === playerId;
  const group = getPropertyGroup(tile.propertyGroupId);
  const complete = owner && group ? ownsCompletePropertyGroup(state.propertyOwnerships, owner.id, group.id) : false;
  const active = owner && group ? isGroupEconomicallyActive(state.propertyOwnerships, owner.id, group.id) : false;
  const level = ownership?.buildingLevel ?? 0;
  const nextLevel = Math.min(5, level + 1) as 1 | 2 | 3 | 4 | 5;
  const schedule = tile.economy?.rentSchedule;
  const currentRent = owner ? getEffectiveRent(state, tile, owner.id) : applyChronicleRentModifier(state, tile, tile.economy?.baseRent ?? 0);
  const build = canBuildOnProperty(state, playerId, tile.index);
  const sell = canSellBuilding(state, playerId, tile.index);
  const mortgage = canMortgageProperty(state, playerId, tile.index);
  const redeem = canRedeemMortgage(state, playerId, tile.index);
  const reason = (allowed: boolean, message?: string) => !connected ? "Keine Verbindung zum Spielserver." : !allowed ? message : undefined;
  const canDevelop = tile.type === "property" && tile.region && schedule;
  return <div className="controller-property-detail" style={{ "--property-group-accent": group?.accent ?? "#d6bd78" } as CSSProperties}>
    <article className="property-card controller-detail-card">
      <header><span className="controller-detail-sigil" aria-hidden="true">{group?.sigil ?? (tile.type === "harbor" ? "⚓" : "⚙")}</span><div><h3>{tile.name}</h3><p>{group?.displayName ?? (tile.type === "harbor" ? "Häfen" : "Versorgung")} · Feld {tile.index}</p></div></header>
      <div className="controller-status-chips"><span>{own ? "Dein Besitz" : owner ? `Besitz: ${owner.name}` : "Frei"}</span>{ownership?.mortgaged && <span>Belehnt</span>}{complete && <span>Set vollständig</span>}</div>
      {canDevelop && <div className="controller-rent-highlights">
        <div><small>Aktuelle Miete</small><strong>{currentRent} Gold</strong></div>
        <div><small>{level < 5 ? "Nächste Stufe" : "Höchste Stufe"}</small><b>{getBuildingName(tile.region!, nextLevel)}</b><strong>{applyChronicleRentModifier(state, tile, schedule[nextLevel])} Gold Miete</strong></div>
      </div>}
      <dl>
        <div><dt>Kaufpreis</dt><dd>{getEffectivePurchasePrice(state, tile, playerId)} Gold</dd></div>
        <div><dt>Hypothekenwert</dt><dd>{getMortgageValue(tile)} Gold</dd></div>
        {ownership?.mortgaged && <div><dt>Auslösung</dt><dd>{getMortgageRedemptionCost(tile)} Gold</dd></div>}
        {canDevelop && <><div><dt>Baustufe</dt><dd>{level} · {getBuildingName(tile.region!, level)}</dd></div><div><dt>Baukosten</dt><dd>{tile.economy?.buildCost} Gold</dd></div><div><dt>Maximalmiete</dt><dd>{applyChronicleRentModifier(state, tile, schedule[5])} Gold</dd></div></>}
        {tile.type === "harbor" && <div><dt>Miete</dt><dd>{ownership?.mortgaged ? "0 Gold · belehnt" : `${ECONOMY_CONFIG.harborRents.map(rent => applyChronicleRentModifier(state, tile, rent)).join(" / ")} Gold je Hafenzahl`}</dd></div>}
        {tile.type === "utility" && <div><dt>Miete</dt><dd>{ownership?.mortgaged ? "0 Gold · belehnt" : `${currentRent} Gold beim aktuellen Würfelwert`}</dd></div>}
      </dl>
      {complete && !active && <p className="controller-hint">Setbonus ruht wegen einer Hypothek.</p>}
    </article>
    {own && <div className="controller-property-actions" aria-label="Grundstücksaktionen">
      {canDevelop && <><div><button className="controller-primary-action" type="button" disabled={!connected || !build.allowed} onClick={() => onBuild(SOCKET_EVENTS.propertyBuild, tile.index)}>Bauen · {tile.economy?.buildCost} Gold</button>{reason(build.allowed, build.reason) && <p>{reason(build.allowed, build.reason)}</p>}</div><div><button type="button" disabled={!connected || !sell.allowed} onClick={() => onBuild(SOCKET_EVENTS.propertySellBuilding, tile.index)}>Baustufe verkaufen</button>{reason(sell.allowed, sell.reason) && <p>{reason(sell.allowed, sell.reason)}</p>}</div></>}
      <div>{ownership.mortgaged ? <><button type="button" disabled={!connected || !redeem.allowed} onClick={() => onMortgage(SOCKET_EVENTS.propertyRedeemMortgage, tile.index)}>Hypothek auslösen · {getMortgageRedemptionCost(tile)} Gold</button>{reason(redeem.allowed, redeem.reason) && <p>{reason(redeem.allowed, redeem.reason)}</p>}</> : <><button type="button" disabled={!connected || !mortgage.allowed} onClick={() => onMortgage(SOCKET_EVENTS.propertyMortgage, tile.index)}>Beleihen · +{getMortgageValue(tile)} Gold</button>{reason(mortgage.allowed, mortgage.reason) && <p>{reason(mortgage.allowed, mortgage.reason)}</p>}</>}</div>
    </div>}
    {canDevelop && <details className="controller-rent-schedule"><summary>Mietstaffel anzeigen</summary><dl>{schedule.map((rent, index) => <div key={index}><dt>{getBuildingName(tile.region!, index as 0 | 1 | 2 | 3 | 4 | 5)}</dt><dd>{applyChronicleRentModifier(state, tile, rent)} Gold</dd></div>)}<div><dt>Vollständiges unbebautes Set</dt><dd>{applyChronicleRentModifier(state, tile, schedule[0] * 2)} Gold</dd></div></dl></details>}
  </div>;
}

export function ControllerPossessions(props: PossessionsProps) {
  const { state, playerId, selectedGroupId, onSelectGroup } = props;
  const [selectedTileIndex, setSelectedTileIndex] = useState<number>();
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selectedTileIndex !== undefined) { detailHeading.current?.focus({ preventScroll: true }); detailHeading.current?.scrollIntoView({ block: "start", behavior: "auto" }); } }, [selectedTileIndex]);
  const player = state.players.find(entry => entry.id === playerId)!;
  const owned = state.propertyOwnerships.filter(entry => entry.ownerId === playerId);
  const ownedGroups = PROPERTY_GROUPS.filter(group => owned.some(entry => BOARD_TILES[entry.tileIndex]?.propertyGroupId === group.id));
  const otherGroups = PROPERTY_GROUPS.filter(group => !ownedGroups.includes(group));
  const tile = selectedTileIndex === undefined ? undefined : BOARD_TILES[selectedTileIndex];
  const renderGroup = (group: typeof PROPERTY_GROUPS[number]) => <section className="property-group" key={group.id} style={{ "--property-group-accent": group.accent } as CSSProperties}><PropertyGroupOverview propertyGroup={group.displayName} tiles={getPropertyGroupTiles(group.id)} ownerships={state.propertyOwnerships} players={state.players} viewerId={playerId} buildAvailable={getPropertyGroupTiles(group.id).some(field => canBuildOnProperty(state, playerId, field.index).allowed)} economicallyActive={isGroupEconomicallyActive(state.propertyOwnerships, playerId, group.id)} selected={selectedGroupId === group.id} onSelect={onSelectGroup} onSelectTile={setSelectedTileIndex} /></section>;
  return <section className="ownership-list" id="controller-property">
    <ControllerRelics {...props} />
    {tile ? <><button type="button" className="controller-back" onClick={() => setSelectedTileIndex(undefined)}>← Zur Gruppenübersicht</button><h2 ref={detailHeading} tabIndex={-1} className="controller-detail-heading">Grundstück</h2><ControllerPropertyDetails {...props} tile={tile} /></> : <>
      <div className="ownership-list__heading"><h2>Mein Besitz</h2><p>Tippe ein Feld an, um Werte und Aktionen zu sehen.</p></div>
      {owned.length === 0 && <p>Noch keine Ländereien, Häfen oder Versorgungswerke.</p>}
      {ownedGroups.map(renderGroup)}
      {owned.some(entry => BOARD_TILES[entry.tileIndex]?.type !== "property") && <section className="controller-special-properties"><h3>Häfen &amp; Versorgung</h3>{owned.filter(entry => BOARD_TILES[entry.tileIndex]?.type !== "property").map(entry => <button type="button" key={entry.tileIndex} onClick={() => setSelectedTileIndex(entry.tileIndex)}><span aria-hidden="true">{BOARD_TILES[entry.tileIndex]?.type === "harbor" ? "⚓" : "⚙"}</span><strong>{BOARD_TILES[entry.tileIndex]?.name}</strong><small>{entry.mortgaged ? "Belehnt" : "Dein Besitz"}</small></button>)}</section>}
      {otherGroups.length > 0 && <details className="controller-other-groups"><summary>Weitere Baugruppen ({otherGroups.length})</summary>{otherGroups.map(renderGroup)}</details>}
      <details className="controller-possession-extras"><summary>Karten &amp; Bank · {player.heldCards?.length ?? 0} besondere Karten</summary><section className="held-cards"><h3>Besondere Karten</h3>{player.heldCards?.length ? player.heldCards.map(held => <article key={held.cardId}><strong>{getCardDefinition(held.cardId).title}</strong><span>{describeCardEffects(getCardDefinition(held.cardId))}</span></article>) : <p>Keine besonderen Karten.</p>}</section><div className="building-bank"><span>BANK</span><b>Bauwerke {state.buildingBank.settlementUnitsAvailable} / 32</b><b>Großbauten {state.buildingBank.grandStructuresAvailable} / 12</b></div></details>
    </>}
  </section>;
}
