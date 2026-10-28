// Erzeugt von scripts/card-frame-openings.py aus den Rahmenbildern – nicht von Hand ändern.

/**
 * Innere Öffnung der Kartenrahmen: Lage als Anteil des Rahmenbildes (oben, rechts, unten, links) und die sichere
 * Textfläche als Anteil der Öffnung (Abstand unten zur Höhe, seitlich zur Breite), damit Medaillon und Ecken unten
 * keinen Text verdecken. `overlay` ist der Rahmen mit ausgeschnittener Öffnung, `mask` die Form der Öffnung.
 */
export interface CardFrameOpening {
  overlay: string;
  mask: string;
  inset: { top: number; right: number; bottom: number; left: number };
  textBottom: number;
  textSide: number;
}

export const CARD_FRAME_OPENINGS: Readonly<Record<"adventure" | "fate", CardFrameOpening>> = {
  adventure: {
    overlay: "/assets/cards/CardAbenteuer-overlay.webp",
    mask: "/assets/cards/CardAbenteuer-opening.png",
    inset: { top: 0.2307, right: 0.1437, bottom: 0.1453, left: 0.1456 },
    textBottom: 0.1045,
    textSide: 0.0332
  },
  fate: {
    overlay: "/assets/cards/CardSchicksal-overlay.webp",
    mask: "/assets/cards/CardSchicksal-opening.png",
    inset: { top: 0.2421, right: 0.1512, bottom: 0.1634, left: 0.1512 },
    textBottom: 0.1120,
    textSide: 0.0339
  }
};
