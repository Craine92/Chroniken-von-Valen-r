import type { CSSProperties } from "react";
import type { LandingPreview } from "../mobile/landing-preview";

/** Zielfeld nach dem eigenen Wurf: Feldbild, Name, Gruppe, Besitzer und was dort passiert. */
export function MobileTargetField({ preview }: { preview: LandingPreview }) {
  const style = { ...(preview.groupColor ? { "--target-group": preview.groupColor } : {}) } as CSSProperties;
  return <section className={`target-field target-field--${preview.tone}`} style={style} aria-live="polite" aria-label={`Zielfeld ${preview.name}`}>
    {preview.imagePath && <img className="target-field__image" src={preview.imagePath} alt="" />}
    <div className="target-field__body">
      <small>DU LANDEST AUF</small>
      <strong>{preview.name}</strong>
      {(preview.groupName || preview.ownerName) && <p className="target-field__meta">
        {preview.groupName && <span className="target-field__group">{preview.groupName}</span>}
        {preview.ownerName && <span className={`target-field__owner${preview.ownerColor ? ` player-theme--${preview.ownerColor}` : ""}`}>Besitz: {preview.ownerName}</span>}
      </p>}
      <b className="target-field__action">{preview.action}</b>
    </div>
  </section>;
}
