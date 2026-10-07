export const BOARD_WIDTH = 1_700;
export const BOARD_HEIGHT = 960;
export const BOARD_HALF_WIDTH = BOARD_WIDTH / 2;
export const BOARD_HALF_HEIGHT = BOARD_HEIGHT / 2;
export const BOARD_CORNER_WIDTH = 160;
export const BOARD_CORNER_HEIGHT = 135;
export const BOARD_HORIZONTAL_FIELD_DEPTH = 135;
export const BOARD_SIDE_FIELD_DEPTH = 135;
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

const FORMATIONS = {
  1: [{ x: 0, y: 0 }],
  2: [{ x: -23, y: 0 }, { x: 23, y: 0 }],
  3: [{ x: 0, y: -20 }, { x: -24, y: 19 }, { x: 24, y: 19 }],
  4: [{ x: -23, y: -19 }, { x: 23, y: -19 }, { x: -23, y: 19 }, { x: 23, y: 19 }],
  5: [{x:-46,y:-19},{x:0,y:-19},{x:46,y:-19},{x:-23,y:19},{x:23,y:19}],
  6: [{x:-46,y:-19},{x:0,y:-19},{x:46,y:-19},{x:-46,y:19},{x:0,y:19},{x:46,y:19}]
} as const;

export function getTokenFormationOffset(count: number, index: number) {
  const formation = FORMATIONS[Math.min(6, Math.max(1, count)) as keyof typeof FORMATIONS];
  return formation[index] ?? { x: 0, y: 0 };
}

/** Upright artwork footprints, expressed in units of the current field's shorter side. */
export function getTileInnerAnchor(tileIndex: number, purpose: "token" | "dragon" | "building", occupiedByBuilding = false) {
  const place = getTilePlacement(tileIndex);
  const unit = Math.min(place.width, place.height);
  const normal = getInnerEdgeOffset(tileIndex, 0);
  const bounds = purpose === "building" ? {left:.32,right:.32,top:.76,bottom:.25}
    : purpose === "dragon" ? {left:.54,right:.54,top:.72,bottom:.46}
    : {left:occupiedByBuilding ? .98 : .52,right:occupiedByBuilding ? .98 : .52,top:.92,bottom:.44};
  return {x:normal.x ? normal.x + Math.sign(normal.x)*unit*(normal.x>0 ? bounds.left : bounds.right) : 0,
    y:normal.y ? normal.y + Math.sign(normal.y)*unit*(normal.y>0 ? bounds.top : bounds.bottom) : 0};
}

/** Compact formations use the same geometry-derived anchor as the pointer. */
export function getTokenSlotOffset(tileIndex: number, count: number, index: number, occupiedByBuilding = false) {
  const normalized = ((tileIndex % 40) + 40) % 40;
  const place = getTilePlacement(normalized);
  const unit = Math.min(place.width, place.height);
  const anchor = getTileInnerAnchor(normalized,"token",occupiedByBuilding);
  if (count >= 5 && anchor.y) anchor.y += Math.sign(anchor.y) * unit * .35;
  if (count >= 5 && place.side === "corner") {
    const edge = getInnerEdgeOffset(normalized,0);
    anchor.x = edge.x + Math.sign(edge.x) * unit * .31;
  }
  const formationUnit = Math.min(unit,BOARD_CELL_SIZE);
  const columnGap = formationUnit * (count >= 5 && place.side !== "top" && place.side !== "bottom" ? .78 : .92);
  const rowGap = formationUnit * (count >= 5 ? 1.75 : 1.4);
  const columns = count >= 5 ? 3 : 2;
  if (place.side === "corner") {
    const sx = normalized === 0 || normalized === 33 ? -1 : 1;
    const sy = normalized === 0 || normalized === 13 ? -1 : 1;
    const slot = {x:(index % columns)*columnGap,y:Math.floor(index / columns)*rowGap};
    return { x: anchor.x+sx*slot.x, y: anchor.y+sy*slot.y };
  }
  const horizontal = place.side === "bottom" || place.side === "top";
  if(horizontal){
    if (count >= 5) return {x:(index % columns - 1)*columnGap,y:anchor.y+Math.sign(anchor.y)*(Math.floor(index / columns)+(occupiedByBuilding ? 1 : 0))*rowGap};
    const tangent = occupiedByBuilding ? unit*.64 : columnGap/2;
    const column = count<=1 ? occupiedByBuilding ? (place.x>0 ? -tangent : tangent) : 0 : index%2 ? tangent : -tangent;
    const row = count<=2 ? 0 : index>=2 ? rowGap : 0;
    return {x:column,y:anchor.y+Math.sign(anchor.y)*row};
  }
  // On upright side fields, rotate the six-seat formation to two columns and three rows.
  const column = count<=1 ? 0 : (index % 2)*columnGap;
  const row = count >= 5 ? (Math.floor(index/2)-1)*rowGap : count<=2 ? 0 : index>=2 ? rowGap/2 : -rowGap/2;
  const halfRows = count >= 5 ? rowGap : count>2 ? rowGap/2 : 0;
  const minY = -BOARD_INNER_HALF_HEIGHT + unit*.92 + halfRows;
  const maxY = BOARD_INNER_HALF_HEIGHT - unit*(count >= 5 ? .8 : .44) - halfRows;
  const centerY = Math.max(minY,Math.min(maxY,place.y));
  return {x:anchor.x+Math.sign(anchor.x)*column,y:centerY-place.y+row};
}

export function getDragonAnchor(tileIndex: number, visualScale = 1) {
  const edge=getInnerEdgeOffset(tileIndex,0),anchor=getTileInnerAnchor(tileIndex,"dragon");
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

export function getTokenLabelOffset(tileIndex: number) {
  const place = getTilePlacement(tileIndex);
  return { x:0,y:Math.min(place.width,place.height)*.25 };
}
