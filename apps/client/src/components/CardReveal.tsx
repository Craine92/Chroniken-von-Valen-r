import { useState } from "react";
import { describeCardEffects, getCardDefinition, type ActiveCardState } from "@valenor/shared";
import { getCardArt, VALENOR_ASSETS } from "../game/assets/asset-manifest";
import { Icon } from "./icons/Icon";

export function CardReveal({ activeCard, compact = false }: { activeCard: ActiveCardState; compact?: boolean }) {
  const card = getCardDefinition(activeCard.cardId);
  const asset = card.deck === "adventure" ? VALENOR_ASSETS.cards.adventureFrame : VALENOR_ASSETS.cards.fateFrame;
  const [failedPath, setFailedPath] = useState<string>();
  const art = getCardArt(card.id);
  return (
    <article className={`card-reveal card-reveal--${card.deck} card-reveal--asset ${compact ? "card-reveal--compact" : ""}${failedPath === asset.path ? " card-reveal--fallback" : ""}`} data-testid="card-reveal">
      {failedPath !== asset.path && <img className="card-reveal__frame" src={asset.path} alt="" aria-hidden="true" width={asset.intendedPixelSize[0]} height={asset.intendedPixelSize[1]} onError={() => setFailedPath(asset.path)} />}
      <div className="card-reveal__content">
        {/* Platz für das spätere Kartenbild; bis dahin das Siegel des Stapels. */}
        {!compact && <div className={`card-reveal__art${art ? "" : " card-reveal__art--placeholder"}`} data-card-art={card.id}>
          {art ? <img src={art.path} alt="" /> : <Icon name={card.deck === "adventure" ? "adventure" : "fate"} />}
        </div>}
        <small>{card.deck === "adventure" ? "ABENTEUER" : "SCHICKSAL"}</small>
        <h2>{card.title}</h2>
        <p>{card.flavorText}</p>
        <strong>{describeCardEffects(card)}</strong>
      </div>
    </article>
  );
}
