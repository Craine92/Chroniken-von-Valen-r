import { useState } from "react";
import { describeCardEffects, getCardDefinition, type ActiveCardState } from "@valenor/shared";
import { getCardArt, VALENOR_ASSETS } from "../game/assets/asset-manifest";
import { Icon } from "./icons/Icon";

/**
 * Eine Abenteuer- oder Schicksalskarte im Goldrahmen. Das Themenbild füllt das Pergamentfenster im Hochformat; Titel,
 * Text und Wirkung liegen unten auf einem Pergamentverlauf. Ohne Bild bleibt das Siegel des Stapels.
 */
export function CardReveal({ activeCard, compact = false }: { activeCard: ActiveCardState; compact?: boolean }) {
  const card = getCardDefinition(activeCard.cardId);
  const asset = card.deck === "adventure" ? VALENOR_ASSETS.cards.adventureFrame : VALENOR_ASSETS.cards.fateFrame;
  const [failedPath, setFailedPath] = useState<string>();
  const art = getCardArt(card.id);
  const showArt = Boolean(art) && failedPath !== art?.path;
  return (
    <article className={`card-reveal card-reveal--${card.deck} card-reveal--asset ${compact ? "card-reveal--compact" : ""}${failedPath === asset.path ? " card-reveal--fallback" : ""}${showArt ? " card-reveal--illustrated" : ""}`} data-testid="card-reveal">
      {failedPath !== asset.path && <img className="card-reveal__frame" src={asset.path} alt="" aria-hidden="true" width={asset.intendedPixelSize[0]} height={asset.intendedPixelSize[1]} onError={() => setFailedPath(asset.path)} />}
      <div className="card-reveal__content">
        <div className={`card-reveal__art${showArt ? "" : " card-reveal__art--placeholder"}`} data-card-art={card.id}>
          {showArt ? <img src={art!.path} alt="" onError={() => setFailedPath(art!.path)} /> : !compact && <Icon name={card.deck === "adventure" ? "adventure" : "fate"} />}
        </div>
        <div className="card-reveal__text">
          <small>{card.deck === "adventure" ? "ABENTEUER" : "SCHICKSAL"}</small>
          <h2>{card.title}</h2>
          <p>{card.flavorText}</p>
          <strong>{describeCardEffects(card)}</strong>
        </div>
      </div>
    </article>
  );
}
