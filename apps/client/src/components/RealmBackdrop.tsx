import type { CSSProperties } from "react";
import { REALM_BACKDROP, type RealmBackdropImage } from "../mobile/realm-backdrop";

/** Feldbild unter der eigenen Figur als ruhiger, dunkler Hintergrund; ein neues Feld blendet weich ein. */
export function RealmBackdrop({ image }: { image: RealmBackdropImage | undefined }) {
  if (!image) return null;
  const style = {
    "--backdrop-brightness": REALM_BACKDROP.brightness,
    "--backdrop-blur": `${REALM_BACKDROP.blurPx}px`,
    "--backdrop-veil": REALM_BACKDROP.veil
  } as CSSProperties;
  return <div className="realm-backdrop" style={style} data-region={image.region} aria-hidden="true">
    <div key={image.path} className="realm-backdrop__image" style={{ backgroundImage: `url("${image.path}")` }} />
  </div>;
}
