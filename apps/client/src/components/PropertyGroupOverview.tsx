import type { CSSProperties } from "react";
import { getPropertyGroup, type BoardTile, type GamePlayerState, type PropertyGroupId, type PropertyOwnership } from "@valenor/shared";
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
  onSelectTile
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
      <header className="property-group__header">
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
      </header>
      <div className="property-group__members">
        {tiles.map((tile) => {
          const ownership = ownershipByTile.get(tile.index);
          const owner = ownership ? playerById.get(ownership.ownerId) : undefined;
          const ownedByViewer = ownership?.ownerId === viewerId;
          const status = ownership?.mortgaged
            ? "Belehnt"
            : ownedByViewer
              ? "Dein Besitz"
              : owner
                ? `Besitz: ${owner.name}`
                : "Noch frei";
          return (
            <Member className={`property-group__member${ownedByViewer ? " is-owned" : ""}${owner && !ownedByViewer ? " is-rival" : ""}`} key={tile.index} type={onSelectTile ? "button" : undefined} onClick={onSelectTile ? () => onSelectTile(tile.index) : undefined}>
              <span className={`property-group__owner${owner ? ` property-group__owner--${owner.color}` : ""}`} aria-hidden="true">{ownedByViewer ? "◆" : owner ? "◇" : "·"}</span>
              <div><strong>{tile.name}</strong>{onSelectTile ? <span className="controller-status-chips"><small>{ownedByViewer ? "Dein Besitz" : owner ? `Besitz: ${owner.name}` : "Frei"}</small>{ownership?.mortgaged && <small>Belehnt</small>}</span> : <small>{status}</small>}</div>
              {onSelectTile && <span className="controller-member-sigil" aria-hidden="true">{visual.sigil}</span>}
            </Member>
          );
        })}
      </div>
      <p className={`property-group__build-status${buildAvailable ? " can-build" : ""}`}>
        {buildAvailable ? "✦ " : ""}{onSelectTile && missingCount > 0 ? `Fehlt: ${missingTiles.map((tile) => tile.name).join(" · ")}` : buildStatus}
        {onSelectTile && buildAvailable && <span className="property-group__build-hint">Grundstück auswählen</span>}
      </p>
      {onSelectTile && onSelect && groupDefinition && <button type="button" className="controller-board-focus" aria-pressed={selected} onClick={() => onSelect(groupDefinition.id)}>{selected ? "Markierung aufheben" : "Gruppe auf dem Board markieren"}</button>}
    </div>
  );
}
