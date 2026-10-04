import { getBuildingName, getMortgageRedemptionCost, getMortgageValue, type BoardTile, type GamePlayerState, type PropertyOwnership } from "@valenor/shared";

const TYPE_LABEL = { property: "Land", harbor: "Hafen", utility: "Versorgung" } as const;

export function PropertyCard({ tile, ownership, owner, compact = false, completeGroup = false, groupEconomicallyActive = true }: {
  tile: BoardTile;
  ownership?: PropertyOwnership;
  owner?: GamePlayerState;
  compact?: boolean;
  completeGroup?: boolean;
  groupEconomicallyActive?: boolean;
}) {
  if (!tile.economy) return null;
  return (
    <article className={`property-card property-card--${tile.region ?? "neutral"} ${compact ? "property-card--compact" : ""}`}>
      <div className="property-card__seal" aria-hidden="true"><span>{tile.type === "harbor" ? "⚓" : tile.type === "utility" ? "⚙" : "♜"}</span></div>
      <small>{TYPE_LABEL[tile.type as keyof typeof TYPE_LABEL] ?? "Besitz"} · Feld {tile.index}</small>
      <strong>{tile.name}</strong>
      {tile.propertyGroup && <span>{tile.propertyGroup}</span>}
      <dl>
        <div><dt>Kaufpreis</dt><dd>{tile.economy.purchasePrice} Gold</dd></div>
        {tile.economy.baseRent !== undefined && <div><dt>Grundmiete</dt><dd>{tile.economy.baseRent} Gold</dd></div>}
        <div><dt>Hypothekenwert</dt><dd>{getMortgageValue(tile)} Gold</dd></div>
        {ownership?.mortgaged && <div><dt>Auslösung</dt><dd>{getMortgageRedemptionCost(tile)} Gold</dd></div>}
        {ownership && tile.type === "property" && tile.region && tile.economy.buildCost && (
          <>
            <div><dt>Baustufe</dt><dd>{ownership.buildingLevel} · {getBuildingName(tile.region, ownership.buildingLevel)}</dd></div>
            <div><dt>Baukosten</dt><dd>{tile.economy.buildCost} Gold</dd></div>
          </>
        )}
      </dl>
      <em>{ownership && owner ? `Im Besitz von ${owner.name}` : "Noch unbeansprucht"}</em>
      {ownership?.mortgaged && <b className="property-card__mortgaged">⛓ Verpfändet</b>}
      {completeGroup && <b className="property-card__complete">✓ Vollständige Region</b>}
      {completeGroup && !groupEconomicallyActive && <p className="property-card__warning">Regionsbonus ruht aufgrund einer Hypothek.</p>}
      {ownership && tile.type === "property" && tile.region && tile.economy.rentSchedule && (
        <div className="property-card__rents" aria-label="Mietstaffel">
          <span><b>Vollständige Region</b>{tile.economy.rentSchedule[0] * 2} Gold</span>
          {tile.economy.rentSchedule.slice(1).map((rent, index) => (
            <span key={`${tile.index}-${index + 1}`}>
              <b>{getBuildingName(tile.region!, (index + 1) as 1 | 2 | 3 | 4 | 5)}</b>{rent} Gold
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
