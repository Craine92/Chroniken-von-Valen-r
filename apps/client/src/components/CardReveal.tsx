import { useState, type CSSProperties } from "react";
import { describeCardEffects, getCardDefinition, type ActiveCardState } from "@valenor/shared";
import { getCardArt, VALENOR_ASSETS } from "../game/assets/asset-manifest";
import { CARD_FRAME_OPENINGS } from "../game/assets/card-frame-openings";
import { Icon } from "./icons/Icon";
import { hyphenateTitle } from "./card-title";

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

/**
 * Eine Abenteuer- oder Schicksalskarte im Goldrahmen, in drei Ebenen: hinten der Rahmen (gibt die Größe vor), darauf
 * Bild und Pergament mit Titel und Text – zugeschnitten auf genau die innere Öffnung des Rahmens –, ganz vorn der Rahmen
 * noch einmal mit ausgeschnittener Öffnung. So liegt nichts über Medaillons und Ranken. Die Öffnung und die sichere
 * Textfläche stammen aus den Rahmenbildern selbst (scripts/card-frame-openings.py).
 */
export function CardReveal({ activeCard, compact = false }: { activeCard: ActiveCardState; compact?: boolean }) {
  const card = getCardDefinition(activeCard.cardId);
  const asset = card.deck === "adventure" ? VALENOR_ASSETS.cards.adventureFrame : VALENOR_ASSETS.cards.fateFrame;
  const opening = CARD_FRAME_OPENINGS[card.deck];
  const [failedPath, setFailedPath] = useState<string>();
  const art = getCardArt(card.id);
  const showArt = Boolean(art) && failedPath !== art?.path;
  const framed = failedPath !== asset.path;
  const style = framed ? {
    "--opening-top": percent(opening.inset.top), "--opening-right": percent(opening.inset.right),
    "--opening-bottom": percent(opening.inset.bottom), "--opening-left": percent(opening.inset.left),
    "--opening-mask": `url("${opening.mask}")`, "--text-bottom": opening.textBottom, "--text-side": opening.textSide
  } as CSSProperties : undefined;
  return (
    <article className={`card-reveal card-reveal--${card.deck} card-reveal--asset ${compact ? "card-reveal--compact" : ""}${framed ? " card-reveal--framed" : " card-reveal--fallback"}${showArt ? " card-reveal--illustrated" : ""}`} style={style} data-testid="card-reveal">
      {framed && <img className="card-reveal__frame" src={asset.path} alt="" aria-hidden="true" width={asset.intendedPixelSize[0]} height={asset.intendedPixelSize[1]} onError={() => setFailedPath(asset.path)} />}
      <div className="card-reveal__content">
        <div className={`card-reveal__art${showArt ? "" : " card-reveal__art--placeholder"}`} data-card-art={card.id}>
          {showArt ? <img src={art!.path} alt="" onError={() => setFailedPath(art!.path)} /> : !compact && <Icon name={card.deck === "adventure" ? "adventure" : "fate"} />}
        </div>
        <div className="card-reveal__text">
          <small>{card.deck === "adventure" ? "ABENTEUER" : "SCHICKSAL"}</small>
          <h2>{hyphenateTitle(card.title)}</h2>
          <p>{card.flavorText}</p>
          <strong>{describeCardEffects(card)}</strong>
        </div>
      </div>
      {framed && <img className="card-reveal__frame-overlay" src={opening.overlay} alt="" aria-hidden="true" />}
    </article>
  );
}
