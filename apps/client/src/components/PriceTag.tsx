import type { PriceInfo } from "@valenor/shared";

const gold = (value: number) => value.toLocaleString("de-DE");

/**
 * Ein Preis, den Ereignisse, Weltimpulse oder Relikte verändern: alter Preis durchgestrichen, neuer daneben und darunter
 * der Grund (z. B. „Segen der Baumeister −25 %“). Unveränderte Preise erscheinen ganz normal.
 */
export function PriceTag({ info, unit = "Gold", reasons = true }: { info: PriceInfo; unit?: string; reasons?: boolean }) {
  if (!info.changed) return <span className="price-tag">{gold(info.effective)} {unit}</span>;
  const tone = info.effective < info.base ? "cheaper" : "dearer";
  return <span className={`price-tag price-tag--${tone}`}>
    <s aria-label={`statt ${gold(info.base)} ${unit}`}>{gold(info.base)}</s> <b>{gold(info.effective)} {unit}</b>
    {reasons && info.modifiers.length > 0 && <small className="price-tag__reason">{info.modifiers.map(modifier => `${modifier.label} ${modifier.effect}`).join(" · ")}</small>}
  </span>;
}

/** Kurzform für Knöpfe: „150 Gold statt 200“. */
export function priceText(info: PriceInfo, unit = "Gold"): string {
  return info.changed ? `${gold(info.effective)} ${unit} statt ${gold(info.base)}` : `${gold(info.effective)} ${unit}`;
}
