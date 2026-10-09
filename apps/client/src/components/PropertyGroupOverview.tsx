import type { CSSProperties } from "react";
import { getPropertyGroup, getBuildingName, canBuildOnProperty, canSellBuilding, getEffectiveBuildingSaleValue, getEffectiveBuildCost, getEffectiveRent, type BoardTile, type GamePlayerState, type GameState, type PropertyGroupId, type PropertyOwnership } from "@valenor/shared";
import { getPropertyGroupVisual } from "../game/tiles/board-tile-theme";

interface PropertyGroupOverviewProps {
  propertyGroup: string;
  tiles: readonly BoardTile[];
  ownerships: readonly PropertyOwnership[];
  players: readonly GamePlayerState[];
  viewerId: string;
  buildAvailable: boolean;
  economicallyActive: boolean;
  selected?: boolean;
  onSelect?: (groupId: PropertyGroupId) => void;
  onSelectTile?: (tileIndex: number) => void;
  gameState?: GameState;
  connected?: boolean;
  onBuild?: (tileIndex: number) => void;
  onSell?: (tileIndex: number) => void;
  onOfferTrade?: (ownerId: string, tileIndex: number) => void;
  showHeader?: boolean;
}

export function PropertyGroupOverview({
  propertyGroup,
  tiles,
  ownerships,
  players,
  viewerId,
  buildAvailable,
  economicallyActive,
  selected = false,
  onSelect,
  onSelectTile,
  gameState,
  connected = true,
  onBuild,
  onSell,
  onOfferTrade,
  showHeader = true
}: PropertyGroupOverviewProps) {
  const visual = getPropertyGroupVisual(propertyGroup);
  const groupDefinition = getPropertyGroup(propertyGroup);
  const ownershipByTile = new Map(ownerships.map((ownership) => [ownership.tileIndex, ownership]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const ownedCount = tiles.filter((tile) => ownershipByTile.get(tile.index)?.ownerId === viewerId).length;
  const complete = ownedCount === tiles.length;
  const missingTiles = tiles.filter((tile) => ownershipByTile.get(tile.index)?.ownerId !== viewerId);
  const missingCount = tiles.length - ownedCount;
  const Member = onSelectTile ? "button" : "div";
  const buildStatus = buildAvailable
    ? "Bauen jetzt möglich"
    : complete && !economicallyActive
      ? "Set vollständig · Bonus ruht"
      : complete
        ? "Set vollständig · aktuell kein Bauplatz"
        : `${ownedCount}/${tiles.length} · Fehlt: ${missingTiles.map((tile) => tile.name).join(", ")}`;

  return (
    <div
      className={`property-group__overview${complete ? " is-complete" : ""}${buildAvailable ? " can-build" : ""}${selected ? " is-selected" : ""}`}
      style={{ "--property-group-accent": visual.cssAccent } as CSSProperties}
      role={onSelect && !onSelectTile ? "button" : undefined}
      tabIndex={onSelect && !onSelectTile ? 0 : undefined}
      aria-pressed={onSelect && !onSelectTile ? selected : undefined}
      aria-label={onSelect && !onSelectTile ? `${propertyGroup} auf dem Spielbrett ${selected ? "nicht mehr hervorheben" : "hervorheben"}` : undefined}
      onClick={onSelectTile ? undefined : () => groupDefinition && onSelect?.(groupDefinition.id)}
      onKeyDown={(event) => {
        if (!onSelectTile && groupDefinition && onSelect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(groupDefinition.id);
        }
      }}
    >
      {showHeader && <header className="property-group__header">
        <span className="property-group__sigil" aria-hidden="true">{visual.sigil}</span>
        <div className="property-group__identity">
          <strong>{propertyGroup}</strong>
          <small>{tiles.length}ER-SET · BAUGRUPPE</small>
        </div>
        <div className="property-group__progress" aria-label={`${ownedCount} von ${tiles.length} Feldern in deinem Besitz`}>
          <span className="property-group__nodes" aria-hidden="true">
            {tiles.map((tile) => {
              const ownership = ownershipByTile.get(tile.index);
              const state = ownership?.ownerId === viewerId ? "is-owned" : ownership ? "is-rival" : "is-free";
              return <i className={state} key={tile.index} />;
            })}
          </span>
          <b>{ownedCount}/{tiles.length}</b>
        </div>
      </header>}
      <div className="property-group__members">
        {tiles.map((tile) => {
          const ownership = ownershipByTile.get(tile.index);
          const owner = ownership ? playerById.get(ownership.ownerId) : undefined;
          const ownedByViewer = ownership?.ownerId === viewerId;
          const level = ownership?.buildingLevel ?? 0;
          const build = ownedByViewer && gameState ? canBuildOnProperty(gameState, viewerId, tile.index) : undefined;
          const sell = ownedByViewer && gameState && level > 0 ? canSellBuilding(gameState, viewerId, tile.index) : undefined;
          const canDevelop = tile.type === "property" && Boolean(tile.region);
          const tradeOwner = owner && !ownedByViewer && !owner.isBankrupt ? owner : undefined;
          const status = ownership?.mortgaged
            ? "Belehnt"
            : ownedByViewer
              ? "Dein Besitz"
              : owner
                ? `Besitz: ${owner.name}`
                : "Noch frei";
          return (
            <div className="property-group__entry" key={tile.index}>
            <Member className={`property-group__member${ownedByViewer ? " is-owned" : ""}${owner && !ownedByViewer ? " is-rival" : ""}`} type={onSelectTile ? "button" : undefined} onClick={onSelectTile ? () => onSelectTile(tile.index) : undefined}>
              <span className={`property-group__owner${owner ? ` property-group__owner--${owner.color}` : ""}`} aria-hidden="true">{ownedByViewer ? "◆" : owner ? "◇" : "·"}</span>
              <div><strong>{tile.name}</strong>{onSelectTile ? <span className="controller-status-chips"><small>{ownedByViewer ? "Dein Besitz" : owner ? `Besitz: ${owner.name}` : "Frei"}</small>{ownership?.mortgaged && <small>Belehnt</small>}</span> : <small>{status}</small>}
                {tile.region && <span className="controller-property-level"><span className="controller-level-dots" aria-hidden="true">{[1,2,3,4,5].map(dot => <i className={dot <= level ? "is-active" : undefined} key={dot} />)}</span><small>{level === 0 ? "UNBEBAUT" : `STUFE ${level} · ${getBuildingName(tile.region, level)}`}</small></span>}
                {ownedByViewer && gameState && <span className="controller-property-rent">Aktuelle Miete: <b>{getEffectiveRent(gameState, tile, viewerId)} Gold</b></span>}
              </div>
              {onSelectTile && <span className="controller-member-sigil" aria-hidden="true">{visual.sigil}</span>}
            </Member>
            {ownedByViewer && canDevelop && gameState && onBuild && <div className="controller-inline-property-actions">
              <button type="button" className="controller-inline-build" disabled={!connected || !build?.allowed} title={build?.reason} onClick={event => { event.stopPropagation(); onBuild(tile.index); }}>+ BAUEN · {getEffectiveBuildCost(gameState, tile)} GOLD</button>
              {level > 0 && onSell && <button type="button" className="controller-inline-sell" disabled={!connected || !sell?.allowed} title={sell?.reason} onClick={event => { event.stopPropagation(); onSell(tile.index); }}>− VERKAUFEN · {getEffectiveBuildingSaleValue(gameState, tile)} GOLD</button>}
            </div>}
            {ownedByViewer && canDevelop && build && !build.allowed && level < 5 && <p className="controller-inline-build-reason">{build.reason?.replace(/^Du musst zuerst /, "Zuerst ").replace("Du besitzt nicht die gesamte Baugruppe.", "Komplette Gruppe erforderlich.")}</p>}
            {ownedByViewer && level > 0 && sell && !sell.allowed && <p className="controller-inline-build-reason">{sell.reason?.replace("Du musst zuerst eine höhere Baustufe auf ", "Zuerst Baustufe auf ").replace(/ verkaufen\.$/, " reduzieren.")}</p>}
            {tradeOwner && onOfferTrade && <button type="button" className="controller-inline-trade" onClick={event => { event.stopPropagation(); onOfferTrade(tradeOwner.id, tile.index); }}>HANDEL ANBIETEN</button>}
            </div>
          );
        })}
      </div>
      <p className={`property-group__build-status${buildAvailable ? " can-build" : ""}`}>
        {buildAvailable ? "✦ " : ""}{onSelectTile && missingCount > 0 ? `Fehlt: ${missingTiles.map((tile) => tile.name).join(" · ")}` : buildStatus}
        {onSelectTile && buildAvailable && <span className="property-group__build-hint">{onBuild ? "Direkt bei der Straße bauen" : "Grundstück auswählen"}</span>}
      </p>
      {onSelectTile && onSelect && groupDefinition && <button type="button" className="controller-board-focus" aria-pressed={selected} onClick={() => onSelect(groupDefinition.id)}>{selected ? "Markierung aufheben" : "Gruppe auf dem Board markieren"}</button>}
    </div>
  );
}
