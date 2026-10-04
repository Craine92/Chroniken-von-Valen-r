import { describeCardEffects, getCardDefinition, type ActiveCardState } from "@valenor/shared";

export function CardReveal({ activeCard, compact = false }: { activeCard: ActiveCardState; compact?: boolean }) {
  const card = getCardDefinition(activeCard.cardId);
  const illustrationGlyphs = card.deck === "adventure" ? ["⚔", "⌂", "⚓", "♜", "✦"] : ["☾", "✧", "⌛", "♛", "◇"];
  const illustrationIndex = [...activeCard.cardId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % illustrationGlyphs.length;
  return (
    <article className={`card-reveal card-reveal--${card.deck} ${compact ? "card-reveal--compact" : ""}`} data-testid="card-reveal">
      <span className="card-reveal__corner card-reveal__corner--top" aria-hidden="true">◆</span>
      <span className="card-reveal__symbol" aria-hidden="true">{card.deck === "adventure" ? "✦" : "☾"}</span>
      <small>{card.deck === "adventure" ? "ABENTEUER" : "SCHICKSAL"}</small>
      <h2>{card.title}</h2>
      <div className="card-reveal__illustration" aria-hidden="true"><i>{illustrationGlyphs[illustrationIndex]}</i><span /></div>
      <p>{card.flavorText}</p>
      <strong>{describeCardEffects(card)}</strong>
      <span className="card-reveal__corner card-reveal__corner--bottom" aria-hidden="true">◆</span>
    </article>
  );
}
