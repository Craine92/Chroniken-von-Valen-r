import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BOARD_TILES, PROPERTY_GROUPS, SOCKET_EVENTS, ECONOMY_CONFIG, getEffectiveRent, getEffectivePurchasePrice, applyChronicleRentModifier, canBuildOnProperty,
  canSellBuilding, canMortgageProperty, canRedeemMortgage, getBuildingName, getCardDefinition,
  describeCardEffects, getMortgageValue, getEffectiveMortgageRedemptionCost, getEffectiveBuildCost, getEffectiveBuildingSaleValue, getPropertyGroup,
  getMortgageRedemptionPlan,
  getPropertyGroupTiles, ownsCompletePropertyGroup, isGroupEconomicallyActive,
  MAX_RELICS, RELIC_DEFINITIONS,
  type GameState, type PropertyGroupId, type BoardTile
} from "@valenor/shared";
import { PropertyGroupOverview } from "./PropertyGroupOverview";
import { RelicIcon } from "./RelicIcon";
import { ControllerActionBar } from "./ControllerActionBar";

interface PossessionsProps {
  state: GameState;
  playerId: string;
  connected: boolean;
  selectedGroupId?: PropertyGroupId | undefined;
  onSelectGroup: (groupId: PropertyGroupId) => void;
  onBuild: (event: "property:build" | "property:sellBuilding", tileIndex: number) => void;
  onMortgage: (event: "property:mortgage" | "property:redeemMortgage", tileIndex: number) => void;
  onRedeemAllMortgages?: () => void;
  onOfferTrade?: (recipientId: string, requestedTileIndex: number) => void;
}

const RELIC_READY_COPY = {
  runestone: "BEREIT · Nach einem normalen Wurf neu würfeln",
  "golden-feather": "BEREIT · Nächstes Runentor +100 Gold",
  "dungeon-amulet": "BEREIT · Verhindert den nächsten Kerkeraufenthalt",
  "merchant-seal": "BEREIT · Nächster Direktkauf −25 %"
} as const;

export function ControllerRelics({ state, playerId }: Pick<PossessionsProps, "state" | "playerId">) {
  const player = state.players.find(entry => entry.id === playerId)!;
  return <section className="controller-relics" aria-label="Deine Relikte">
    <h3>DEINE RELIKTE <span>{player.relics?.length ?? 0} / {MAX_RELICS}</span></h3>
    {player.relics?.length ? player.relics.map(id => {
      return <details key={id} className="controller-relic controller-relic--armed">
        <summary><RelicIcon id={id} /><span><strong>{RELIC_DEFINITIONS[id].name}</strong><small>{RELIC_READY_COPY[id]}</small></span></summary>
        <p>{RELIC_DEFINITIONS[id].description}</p>
      </details>;
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
  const buildAction = own && canDevelop && build.allowed ? { label: `Bauen · ${getEffectiveBuildCost(state, tile)} Gold`, onClick: () => onBuild(SOCKET_EVENTS.propertyBuild, tile.index), disabled: !connected } : undefined;
  const sellAction = own && canDevelop && sell.allowed ? { label: `Verkaufen · +${getEffectiveBuildingSaleValue(state, tile)} Gold`, onClick: () => onBuild(SOCKET_EVENTS.propertySellBuilding, tile.index), disabled: !connected, tone: "secondary" as const } : undefined;
  return <div className="controller-property-detail has-context-action-bar" style={{ "--property-group-accent": group?.accent ?? "#d6bd78" } as CSSProperties}>
    <article className="property-card controller-detail-card">
      <header><span className="controller-detail-sigil" aria-hidden="true">{group?.sigil ?? (tile.type === "harbor" ? "⚓" : "⚙")}</span><div><h3>{tile.name}</h3><p>{group?.displayName ?? (tile.type === "harbor" ? "Häfen" : "Versorgung")} · Feld {tile.index}</p></div></header>
      <div className="controller-status-chips"><span>{own ? "Dein Besitz" : owner ? `Besitz: ${owner.name}` : "Frei"}</span>{ownership?.mortgaged && <span className="mortgage-status" title="Belehnt"><b aria-hidden="true">×</b> BELEHNT</span>}{complete && <span>{active ? "SETBONUS AKTIV" : "SETBONUS RUHT"}</span>}</div>
      {canDevelop && <div className="controller-rent-highlights">
        <div><small>Aktuelle Miete</small><strong>{currentRent} Gold</strong></div>
        <div><small>{level < 5 ? "Nächste Stufe" : "Höchste Stufe"}</small><b>{getBuildingName(tile.region!, nextLevel)}</b><strong>{applyChronicleRentModifier(state, tile, schedule[nextLevel])} Gold Miete</strong></div>
      </div>}
      <dl>
        <div><dt>Kaufpreis</dt><dd>{getEffectivePurchasePrice(state, tile, playerId)} Gold</dd></div>
        <div><dt>Hypothekenwert</dt><dd>{getMortgageValue(tile)} Gold</dd></div>
        {ownership?.mortgaged && <div><dt>Auslösung</dt><dd>{getEffectiveMortgageRedemptionCost(state, tile)} Gold</dd></div>}
        {canDevelop && <><div><dt>Baustufe</dt><dd>{level} · {getBuildingName(tile.region!, level)}</dd></div><div><dt>Baukosten</dt><dd>{getEffectiveBuildCost(state, tile)} Gold</dd></div><div><dt>Maximalmiete</dt><dd>{applyChronicleRentModifier(state, tile, schedule[5])} Gold</dd></div></>}
        {tile.type === "harbor" && <div><dt>Miete</dt><dd>{ownership?.mortgaged ? "0 Gold · belehnt" : `${ECONOMY_CONFIG.harborRents.map(rent => applyChronicleRentModifier(state, tile, rent)).join(" / ")} Gold je Hafenzahl`}</dd></div>}
        {tile.type === "utility" && <div><dt>Miete</dt><dd>{ownership?.mortgaged ? "0 Gold · belehnt" : `${currentRent} Gold beim aktuellen Würfelwert`}</dd></div>}
      </dl>
      {complete && !active && <p className="controller-hint">Setbonus ruht wegen einer Hypothek.</p>}
    </article>
    {own && <div className="controller-property-actions" aria-label="Grundstücksaktionen">
      {canDevelop && !build.allowed && <p>{reason(build.allowed, build.reason)}</p>}
      {canDevelop && level > 0 && !sell.allowed && <p>{reason(sell.allowed, sell.reason)}</p>}
      <div>{ownership.mortgaged ? <><button type="button" disabled={!connected || !redeem.allowed} onClick={() => onMortgage(SOCKET_EVENTS.propertyRedeemMortgage, tile.index)}>Hypothek auslösen · {getEffectiveMortgageRedemptionCost(state, tile)} Gold</button>{reason(redeem.allowed, redeem.reason) && <p>{reason(redeem.allowed, redeem.reason)}</p>}</> : <><button type="button" disabled={!connected || !mortgage.allowed} onClick={() => onMortgage(SOCKET_EVENTS.propertyMortgage, tile.index)}>Beleihen · +{getMortgageValue(tile)} Gold</button>{reason(mortgage.allowed, mortgage.reason) && <p>{reason(mortgage.allowed, mortgage.reason)}</p>}</>}</div>
    </div>}
    {canDevelop && <details className="controller-rent-schedule"><summary>Mietstaffel anzeigen</summary><dl>{schedule.map((rent, index) => <div key={index}><dt>{getBuildingName(tile.region!, index as 0 | 1 | 2 | 3 | 4 | 5)}</dt><dd>{applyChronicleRentModifier(state, tile, rent)} Gold</dd></div>)}<div><dt>Vollständiges unbebautes Set</dt><dd>{applyChronicleRentModifier(state, tile, schedule[0] * 2)} Gold</dd></div></dl></details>}
    <ControllerActionBar primary={buildAction} secondary={sellAction} label="Grundstücksaktionen" />
  </div>;
}

export function ControllerPossessions(props: PossessionsProps) {
  const { state, playerId, selectedGroupId, onSelectGroup } = props;
  const [selectedTileIndex, setSelectedTileIndex] = useState<number>();
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selectedTileIndex !== undefined) { detailHeading.current?.focus({ preventScroll: true }); detailHeading.current?.scrollIntoView({ block: "start", behavior: "auto" }); } }, [selectedTileIndex]);
  const player = state.players.find(entry => entry.id === playerId)!;
  const owned = state.propertyOwnerships.filter(entry => entry.ownerId === playerId);
  const redemptionPlan = getMortgageRedemptionPlan(state, playerId);
  const ownedGroups = PROPERTY_GROUPS.filter(group => owned.some(entry => BOARD_TILES[entry.tileIndex]?.propertyGroupId === group.id));
  const orderedOwnedGroups = [...ownedGroups].sort((left, right) => {
    const score = (id: PropertyGroupId) => {
      const members = getPropertyGroupTiles(id);
      const count = members.filter(member => owned.some(entry => entry.tileIndex === member.index)).length;
      const buildable = members.some(member => canBuildOnProperty(state, playerId, member.index).allowed);
      return buildable ? 1_000 + count : count === members.length ? 100 + count : count;
    };
    return score(right.id) - score(left.id);
  });
  const otherGroups = PROPERTY_GROUPS.filter(group => !ownedGroups.includes(group));
  const [openGroupId, setOpenGroupId] = useState<PropertyGroupId>();
  const tile = selectedTileIndex === undefined ? undefined : BOARD_TILES[selectedTileIndex];
  const renderGroup = (group: typeof PROPERTY_GROUPS[number]) => {
    const members = getPropertyGroupTiles(group.id);
    const ownedMembers = members.filter(member => owned.some(entry => entry.tileIndex === member.index));
    const missingMembers = members.filter(member => !ownedMembers.includes(member));
    const buildable = members.some(field => canBuildOnProperty(state, playerId, field.index).allowed);
    const maximallyBuilt = ownedMembers.length === members.length && members.every(member => state.propertyOwnerships.find(entry => entry.tileIndex === member.index)?.buildingLevel === 5);
    const hasMortgage = ownedMembers.some(member => state.propertyOwnerships.find(entry => entry.tileIndex === member.index)?.mortgaged);
    return <details className="controller-property-group property-group" key={group.id} open={openGroupId === group.id} style={{ "--property-group-accent": group.accent } as CSSProperties} onToggle={event => {
      if (event.currentTarget.open) setOpenGroupId(group.id);
      else if (openGroupId === group.id) setOpenGroupId(undefined);
    }}>
      <summary><span><strong>{group.displayName}</strong><b>{ownedMembers.length} / {members.length}</b></span>{hasMortgage ? <em className="controller-group-badge is-mortgaged">HYPOTHEK AKTIV</em> : (buildable || maximallyBuilt) && <em className={`controller-group-badge${maximallyBuilt ? " is-maxed" : ""}`}>{maximallyBuilt ? "MAXIMAL AUSGEBAUT" : "BAUBEREIT"}</em>}<small>Dein Besitz: {ownedMembers.map(member => member.name).join(" · ") || "–"}</small>{missingMembers.length > 0 && <small>Fehlt: {missingMembers.map(member => member.name).join(" · ")}</small>}</summary>
      <PropertyGroupOverview propertyGroup={group.displayName} tiles={members} ownerships={state.propertyOwnerships} players={state.players} viewerId={playerId} buildAvailable={buildable} economicallyActive={isGroupEconomicallyActive(state.propertyOwnerships, playerId, group.id)} selected={selectedGroupId === group.id} onSelect={onSelectGroup} onSelectTile={setSelectedTileIndex} gameState={state} connected={props.connected} onBuild={tileIndex => props.onBuild(SOCKET_EVENTS.propertyBuild, tileIndex)} onSell={tileIndex => props.onBuild(SOCKET_EVENTS.propertySellBuilding, tileIndex)} {...(props.onOfferTrade ? { onOfferTrade: props.onOfferTrade } : {})} showHeader={false} />
    </details>;
  };
  return <section className="ownership-list" id="controller-property">
    {tile ? <><button type="button" className="controller-back" onClick={() => setSelectedTileIndex(undefined)}>← Zur Gruppenübersicht</button><h2 ref={detailHeading} tabIndex={-1} className="controller-detail-heading">Grundstück</h2><ControllerPropertyDetails {...props} tile={tile} /></> : <>
      <div className="ownership-list__heading"><h2>Mein Besitz</h2><p>Tippe ein Feld an, um Werte und Aktionen zu sehen.</p></div>
      {owned.length === 0 && <p>Noch keine Ländereien, Häfen oder Versorgungswerke.</p>}
      {orderedOwnedGroups.map(renderGroup)}
      {owned.some(entry => BOARD_TILES[entry.tileIndex]?.type !== "property") && <section className="controller-special-properties"><h3>Häfen &amp; Versorgung</h3>{owned.filter(entry => BOARD_TILES[entry.tileIndex]?.type !== "property").map(entry => <button type="button" key={entry.tileIndex} onClick={() => setSelectedTileIndex(entry.tileIndex)}><span aria-hidden="true">{BOARD_TILES[entry.tileIndex]?.type === "harbor" ? "⚓" : "⚙"}</span><strong>{BOARD_TILES[entry.tileIndex]?.name}</strong><small>{entry.mortgaged ? "Belehnt" : "Dein Besitz"}</small></button>)}</section>}
      {redemptionPlan.tileIndices.length > 0 && <section className="controller-finance-section"><h3>Hypotheken</h3><p>{redemptionPlan.tileIndices.length} aktiv · alle auslösen: {redemptionPlan.totalCost} Gold</p><button type="button" disabled={!props.connected || !redemptionPlan.allowed || !props.onRedeemAllMortgages} onClick={props.onRedeemAllMortgages}>ALLE HYPOTHEKEN AUSLÖSEN</button>{!redemptionPlan.affordable && <small>Nicht genügend Gold für die atomare Gesamtauslösung.</small>}</section>}
      {otherGroups.length > 0 && <details className="controller-other-groups"><summary>Weitere Baugruppen ({otherGroups.length})</summary>{otherGroups.map(renderGroup)}</details>}
      <ControllerRelics {...props} />
      <details className="controller-possession-extras"><summary>Karten &amp; Bank · {player.heldCards?.length ?? 0} besondere Karten</summary><section className="held-cards"><h3>Besondere Karten</h3>{player.heldCards?.length ? player.heldCards.map(held => <article key={held.cardId}><strong>{getCardDefinition(held.cardId).title}</strong><span>{describeCardEffects(getCardDefinition(held.cardId))}</span></article>) : <p>Keine besonderen Karten.</p>}</section><div className="building-bank"><span>BAUWERKE</span><b>Unbegrenzt</b></div></details>
    </>}
  </section>;
}
