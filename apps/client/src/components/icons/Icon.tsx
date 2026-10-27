import type { PropertyGroupId, QuestId, RelicId } from "@valenor/shared";
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from "./icon-data";

export type { IconName } from "./icon-data";

/** Einheitliches Icon des Design-Systems; übernimmt Farbe (currentColor) und Größe (1em) vom umgebenden Text. */
export function Icon({ name, label, className }: { name: IconName; label?: string | undefined; className?: string | undefined }) {
  return <svg className={`icon icon--${name}${className ? ` ${className}` : ""}`} viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`} width="1em" height="1em" fill="currentColor" focusable="false"
    {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
    <path d={ICON_PATHS[name]} />
  </svg>;
}

export const GROUP_ICONS: Record<PropertyGroupId, IconName> = {
  group_mondhain: "group-mondhain", group_amethystwald: "group-amethystwald", group_silberbach: "group-silberbach", group_kronenwald: "group-kronenwald",
  group_aschelande: "group-aschelande", group_eisenoede: "group-eisenoede", group_sonnensteppe: "group-sonnensteppe", group_himmelsweite: "group-himmelsweite"
};

export const RELIC_ICONS: Record<RelicId, IconName> = {
  runestone: "rune", "merchant-seal": "seal", "dungeon-amulet": "amulet", "golden-feather": "feather"
};

export const QUEST_ICONS: Record<QuestId, IconName> = {
  traveler: "rune", landbuyer: "property", seafarer: "harbor", builder: "building", landlord: "crown", dragonfriend: "dragon", fortunehunter: "tavern", tollpayer: "gold"
};

export const DIE_ICONS: readonly IconName[] = ["die-1", "die-2", "die-3", "die-4", "die-5", "die-6"];
export const dieIcon = (value: number): IconName => DIE_ICONS[Math.min(6, Math.max(1, Math.round(value))) - 1]!;

/** Icon für ein Brettfeld mit Besitz: Regionssiegel, Hafen oder Versorgung. */
export function tileIcon(tile: { type: string; propertyGroupId?: PropertyGroupId | undefined }): IconName {
  if (tile.propertyGroupId) return GROUP_ICONS[tile.propertyGroupId];
  return tile.type === "harbor" ? "harbor" : tile.type === "utility" ? "utility" : "property";
}
