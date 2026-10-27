export const BOARD_WIDTH = 1_700;
export const BOARD_HEIGHT = 1_000;
export const BOARD_HALF_WIDTH = BOARD_WIDTH / 2;
export const BOARD_HALF_HEIGHT = BOARD_HEIGHT / 2;
/** Tiefe aller Randfelder: genug Fläche, damit das Feldbild unter Namens- und Preisband zur Geltung kommt. */
export const BOARD_FIELD_DEPTH = 190;
export const BOARD_CORNER_WIDTH = BOARD_FIELD_DEPTH;
export const BOARD_CORNER_HEIGHT = BOARD_FIELD_DEPTH;
export const BOARD_HORIZONTAL_FIELD_DEPTH = BOARD_FIELD_DEPTH;
export const BOARD_SIDE_FIELD_DEPTH = BOARD_FIELD_DEPTH;
export const BOARD_HORIZONTAL_FIELD_COUNT = 12;
export const BOARD_VERTICAL_FIELD_COUNT = 6;
export const BOARD_HORIZONTAL_CELL_WIDTH = (BOARD_WIDTH - BOARD_CORNER_WIDTH * 2) / BOARD_HORIZONTAL_FIELD_COUNT;
export const BOARD_VERTICAL_CELL_HEIGHT = (BOARD_HEIGHT - BOARD_CORNER_HEIGHT * 2) / BOARD_VERTICAL_FIELD_COUNT;
export const BOARD_INNER_WIDTH = BOARD_WIDTH - BOARD_SIDE_FIELD_DEPTH * 2;
export const BOARD_INNER_HEIGHT = BOARD_HEIGHT - BOARD_HORIZONTAL_FIELD_DEPTH * 2;
export const BOARD_INNER_HALF_WIDTH = BOARD_INNER_WIDTH / 2;
export const BOARD_INNER_HALF_HEIGHT = BOARD_INNER_HEIGHT / 2;

// Compatibility aliases for presentation code that only needs one scalar.
export const BOARD_CELL_SIZE = BOARD_HORIZONTAL_CELL_WIDTH;
export const BOARD_CORNER_SIZE = BOARD_CORNER_WIDTH;
export const BOARD_SIZE = BOARD_WIDTH;
export const BOARD_HALF = BOARD_HALF_WIDTH;
export const BOARD_CAMERA_PADDING = { horizontal: 40, vertical: 40 } as const;

export function getBoardFitZoom(viewportWidth: number, viewportHeight: number): number {
  return Math.min(
    viewportWidth / (BOARD_WIDTH + BOARD_CAMERA_PADDING.horizontal),
    viewportHeight / (BOARD_HEIGHT + BOARD_CAMERA_PADDING.vertical)
  );
}

export type BoardSide = "bottom" | "left" | "top" | "right" | "corner";

export interface TilePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  side: BoardSide;
}

export function getTilePlacement(index: number): TilePlacement {
  const normalized = ((index % 40) + 40) % 40;
  const horizontalCell = BOARD_HORIZONTAL_CELL_WIDTH;
  const verticalCell = BOARD_VERTICAL_CELL_HEIGHT;
  const halfWidth = BOARD_HALF_WIDTH;
  const halfHeight = BOARD_HALF_HEIGHT;
  const cornerWidth = BOARD_CORNER_WIDTH;
  const cornerHeight = BOARD_CORNER_HEIGHT;

  if (normalized === 0) return { x: halfWidth - cornerWidth / 2, y: halfHeight - cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  if (normalized < 13) return { x: halfWidth - cornerWidth - (normalized - 1) * horizontalCell - horizontalCell / 2, y: halfHeight - BOARD_HORIZONTAL_FIELD_DEPTH / 2, width: horizontalCell, height: BOARD_HORIZONTAL_FIELD_DEPTH, rotation: 0, side: "bottom" };
  if (normalized === 13) return { x: -halfWidth + cornerWidth / 2, y: halfHeight - cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  if (normalized < 20) return { x: -halfWidth + BOARD_SIDE_FIELD_DEPTH / 2, y: halfHeight - cornerHeight - (normalized - 14) * verticalCell - verticalCell / 2, width: BOARD_SIDE_FIELD_DEPTH, height: verticalCell, rotation: 0, side: "left" };
  if (normalized === 20) return { x: -halfWidth + cornerWidth / 2, y: -halfHeight + cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  if (normalized < 33) return { x: -halfWidth + cornerWidth + (normalized - 21) * horizontalCell + horizontalCell / 2, y: -halfHeight + BOARD_HORIZONTAL_FIELD_DEPTH / 2, width: horizontalCell, height: BOARD_HORIZONTAL_FIELD_DEPTH, rotation: 0, side: "top" };
  if (normalized === 33) return { x: halfWidth - cornerWidth / 2, y: -halfHeight + cornerHeight / 2, width: cornerWidth, height: cornerHeight, rotation: 0, side: "corner" };
  return { x: halfWidth - BOARD_SIDE_FIELD_DEPTH / 2, y: -halfHeight + cornerHeight + (normalized - 34) * verticalCell + verticalCell / 2, width: BOARD_SIDE_FIELD_DEPTH, height: verticalCell, rotation: 0, side: "right" };
}

export function getTileWorldPosition(index: number) {
  const { x, y } = getTilePlacement(index);
  return { x, y };
}

export type FieldKind = "portrait" | "landscape" | "corner";

export interface FieldRect { left: number; top: number; right: number; bottom: number }

/**
 * Aufteilung eines Feldes in Feldkoordinaten (Mitte = 0/0): Namens- und Preisband, die Leiste in Gruppenfarbe,
 * der Bauplatz an der Innenkante und die Standfläche der Figuren. Die Bänder bedecken zusammen höchstens ein Drittel.
 */
export interface FieldZones {
  kind: FieldKind;
  /** Richtung zur Brettmitte. */
  inward: { x: number; y: number };
  nameBand: FieldRect;
  priceBand?: FieldRect;
  groupStrip: FieldRect;
  building?: FieldRect;
  tokens: FieldRect;
}

export const FIELD_BANDS = {
  portrait: { name: 40, price: 22 },
  landscape: { name: 30 },
  corner: { name: 56 },
  groupStrip: 6,
  inset: 4
} as const;

export function getFieldKind(tileIndex: number): FieldKind {
  const side = getTilePlacement(tileIndex).side;
  return side === "corner" ? "corner" : side === "left" || side === "right" ? "landscape" : "portrait";
}

export function getFieldZones(tileIndex: number): FieldZones {
  const place = getTilePlacement(tileIndex);
  const kind = getFieldKind(tileIndex);
  const halfW = place.width / 2, halfH = place.height / 2, inset = FIELD_BANDS.inset, strip = FIELD_BANDS.groupStrip;
  const edge = getInnerEdgeOffset(tileIndex, 0);
  const inward = { x: Math.sign(edge.x), y: Math.sign(edge.y) };
  if (kind === "portrait") {
    const nameBottom = -halfH + FIELD_BANDS.portrait.name, priceTop = halfH - FIELD_BANDS.portrait.price;
    return {
      kind, inward,
      nameBand: { left: -halfW, top: -halfH, right: halfW, bottom: nameBottom },
      priceBand: { left: -halfW, top: priceTop, right: halfW, bottom: halfH },
      groupStrip: inward.y < 0 ? { left: -halfW + inset, top: -halfH + inset, right: halfW - inset, bottom: -halfH + inset + strip }
        : { left: -halfW + inset, top: halfH - inset - strip, right: halfW - inset, bottom: halfH - inset },
      building: { left: -halfW + 8, top: nameBottom + 2, right: halfW - 8, bottom: nameBottom + 74 },
      tokens: { left: -halfW + inset + 2, top: nameBottom + 2, right: halfW - inset - 2, bottom: priceTop - 6 }
    };
  }
  if (kind === "landscape") {
    const nameBottom = -halfH + FIELD_BANDS.landscape.name, buildingWidth = 64;
    const building = inward.x > 0
      ? { left: halfW - inset - strip - buildingWidth, top: nameBottom, right: halfW - inset - strip, bottom: halfH - inset }
      : { left: -halfW + inset + strip, top: nameBottom, right: -halfW + inset + strip + buildingWidth, bottom: halfH - inset };
    return {
      kind, inward,
      nameBand: { left: -halfW, top: -halfH, right: halfW, bottom: nameBottom },
      groupStrip: inward.x > 0 ? { left: halfW - inset - strip, top: -halfH + inset, right: halfW - inset, bottom: halfH - inset }
        : { left: -halfW + inset, top: -halfH + inset, right: -halfW + inset + strip, bottom: halfH - inset },
      building,
      tokens: { left: -halfW + inset + strip + 2, top: nameBottom + 1, right: halfW - inset - strip - 2, bottom: halfH - inset - 12 }
    };
  }
  const nameTop = halfH - FIELD_BANDS.corner.name;
  return {
    kind, inward,
    nameBand: { left: -halfW, top: nameTop, right: halfW, bottom: halfH },
    groupStrip: { left: 0, top: 0, right: 0, bottom: 0 },
    tokens: { left: -halfW + inset + 6, top: -halfH + inset + 2, right: halfW - inset - 6, bottom: nameTop - 14 }
  };
}

/**
 * Größe einer Figur bei Platzfaktor 1 in Weltpixeln, inklusive der TV-Vergrößerung der Figuren
 * (TOKEN_VISUAL_CONFIG mal getBoardVisualScale): Sockelbreite sowie Höhe über und unter den Füßen.
 */
export const TOKEN_FOOTPRINT = { width: 59, above: 108, below: 15, nominalVisualScale: 1.23 } as const;
/** Größter Platzfaktor je Figurenzahl; die aktive Figur steht vorne und wird etwas größer. */
export const TOKEN_SEAT_MAX_SCALE = [1, .86, .76, .7, .62, .58] as const;
export const ACTIVE_TOKEN_SCALE_BOOST = 1.15;
const TOKEN_ROW_STEP = .34;

export interface TokenSeat {
  /** Position der Füße relativ zur Feldmitte. */
  x: number;
  y: number;
  /** Platzfaktor; 1 entspricht der bisherigen Figurengröße auf dem TV. */
  scale: number;
  row: number;
  front: boolean;
}

function splitRows(count: number, rows: number, columns: number): number[] {
  if (rows === 1) return [count];
  // Vorne eine ungerade Zahl, damit die aktive Figur mittig vorne steht – solange hinten genug Platz bleibt.
  let front = Math.min(columns, count - (rows - 1));
  if (front % 2 === 0 && count - (front - 1) <= columns * (rows - 1)) front -= 1;
  const back: number[] = [];
  let rest = count - front;
  for (let row = 0; row < rows - 1; row += 1) {
    const inRow = Math.ceil(rest / (rows - 1 - row));
    back.push(inRow);
    rest -= inRow;
  }
  return [...back, front];
}

function layoutSeats(zone: FieldRect, count: number): TokenSeat[] {
  const width = zone.right - zone.left, height = zone.bottom - zone.top;
  const cap = TOKEN_SEAT_MAX_SCALE[count - 1]!;
  const tall = TOKEN_FOOTPRINT.above + TOKEN_FOOTPRINT.below;
  let best = { rows: 1, columns: count, scale: 0 };
  for (let rows = 1; rows <= Math.min(3, count); rows += 1) {
    const columns = Math.ceil(count / rows);
    // Nachbarn dürfen sich um 8 % überlappen; die äußeren Figuren bleiben ganz auf der Standfläche.
    const byWidth = width / (TOKEN_FOOTPRINT.width * (1 + (columns - 1) * .92));
    const byHeight = height / (tall + (rows - 1) * TOKEN_ROW_STEP * tall);
    const scale = Math.min(cap, byWidth, byHeight);
    if (scale > best.scale + .01) best = { rows, columns, scale };
  }
  const { rows, columns, scale } = best;
  const counts = splitRows(count, rows, columns);
  const tokenWidth = TOKEN_FOOTPRINT.width * scale;
  const spacing = columns > 1 ? Math.min((width - tokenWidth) / (columns - 1), tokenWidth * 1.08) : 0;
  const centerX = (zone.left + zone.right) / 2;
  const frontFeet = zone.bottom - TOKEN_FOOTPRINT.below * scale;
  const seats: TokenSeat[] = [];
  // Reihenfolge: vordere Reihe von der Mitte nach außen, dann die Reihen dahinter.
  for (let row = rows - 1; row >= 0; row -= 1) {
    const inRow = counts[row]!;
    const y = frontFeet - (rows - 1 - row) * TOKEN_ROW_STEP * tall * scale;
    const order = Array.from({ length: inRow }, (_, index) => index)
      .sort((a, b) => Math.abs(a - (inRow - 1) / 2) - Math.abs(b - (inRow - 1) / 2) || a - b);
    order.forEach(index => seats.push({ x: centerX + (index - (inRow - 1) / 2) * spacing, y, scale, row, front: row === rows - 1 }));
  }
  return seats;
}

/**
 * Platz einer Figur auf ihrem Feld. Bis zu sechs Figuren stehen in ein bis drei Reihen auf der Standfläche,
 * die aktive Figur vorne in der Mitte und etwas größer. Steht ein Gebäude auf dem Feld, bleibt sein Bauplatz frei.
 */
export function getTokenSeat(tileIndex: number, count: number, index: number, options: { activeIndex?: number; occupiedByBuilding?: boolean } = {}): TokenSeat {
  const zones = getFieldZones(tileIndex);
  const zone = { ...zones.tokens };
  if (options.occupiedByBuilding && zones.building) {
    if (zones.kind === "portrait") zone.top = zones.building.bottom - 30;
    else if (zones.inward.x > 0) zone.right = zones.building.left;
    else zone.left = zones.building.right;
  }
  const total = Math.min(6, Math.max(1, count));
  const seats = layoutSeats(zone, total);
  const active = options.activeIndex !== undefined && options.activeIndex >= 0 && options.activeIndex < total ? options.activeIndex : undefined;
  const seatIndex = active === undefined ? index : index === active ? 0 : index < active ? index + 1 : index;
  const seat = seats[Math.min(seats.length - 1, Math.max(0, seatIndex))]!;
  if (active === undefined || index !== active || total === 1) return seat;
  // Größer als die anderen, aber nie über die Standfläche hinaus (sonst verdeckt der Kopf den Feldnamen).
  const fits = (seat.y - zone.top) / TOKEN_FOOTPRINT.above;
  return { ...seat, scale: Math.max(seat.scale, Math.min(seat.scale * ACTIVE_TOKEN_SCALE_BOOST, fits)) };
}

/** Bauplatz in Feldkoordinaten: Fußpunkt (Mitte unten) und das Rechteck, in das das Gebäudebild passt. */
export function getBuildingSeat(tileIndex: number) {
  const zones = getFieldZones(tileIndex);
  const box = zones.building ?? zones.tokens;
  return { x: (box.left + box.right) / 2, y: box.bottom, width: box.right - box.left, height: box.bottom - box.top };
}

/** Where the dragon stands just inside the board, expressed in units of the field's shorter side. */
export function getTileInnerAnchor(tileIndex: number) {
  const place = getTilePlacement(tileIndex);
  const unit = Math.min(place.width, place.height);
  const normal = getInnerEdgeOffset(tileIndex, 0);
  const bounds = {left:.54,right:.54,top:.72,bottom:.46};
  return {x:normal.x ? normal.x + Math.sign(normal.x)*unit*(normal.x>0 ? bounds.left : bounds.right) : 0,
    y:normal.y ? normal.y + Math.sign(normal.y)*unit*(normal.y>0 ? bounds.top : bounds.bottom) : 0};
}

export function getDragonAnchor(tileIndex: number, visualScale = 1) {
  const edge=getInnerEdgeOffset(tileIndex,0),anchor=getTileInnerAnchor(tileIndex);
  return {x:edge.x+(anchor.x-edge.x)*visualScale,y:edge.y+(anchor.y-edge.y)*visualScale};
}

export const REALM_LABEL_POSITIONS = {
  humans: {xFactor:.35,yFactor:.36}, orcs: {xFactor:.62,yFactor:.2},
  elves: {xFactor:.29,yFactor:.89}, steppe: {xFactor:.61,yFactor:.67}
} as const;

export const REALM_LABEL_ALTERNATIVES = {
  humans:[[.35,.53],[.35,.2],[.35,.8],[.63,.52],[.26,.45]],
  orcs:[[.68,.35],[.6,.53],[.55,.15],[.32,.48]],
  elves:[[.26,.76],[.26,.62],[.6,.88]],
  steppe:[[.65,.85],[.5,.9],[.73,.57],[.26,.62],[.27,.73]]
} as const;

export const REALM_LABEL_SAFE_ZONES = [
  {x:-470,y:-20,width:160,height:205}, {x:310,y:-20,width:160,height:205},
  {x:-125,y:-120,width:250,height:255}
] as const;

export function getInnerEdgeOffset(tileIndex: number, extra = 12) {
  const place = getTilePlacement(tileIndex);
  if (place.side === "corner") {
    const normalized = ((tileIndex % 40) + 40) % 40;
    return {
      x: (normalized === 0 || normalized === 33 ? -1 : 1) * (place.width / 2 + extra),
      y: (normalized === 0 || normalized === 13 ? -1 : 1) * (place.height / 2 + extra)
    };
  }
  if (place.side === "bottom") return { x: 0, y: -place.height / 2 - extra };
  if (place.side === "left") return { x: place.width / 2 + extra, y: 0 };
  if (place.side === "top") return { x: 0, y: place.height / 2 + extra };
  return { x: -place.width / 2 - extra, y: 0 };
}

