export type PropertyGroupId =
  | "group_mondhain"
  | "group_amethystwald"
  | "group_silberbach"
  | "group_kronenwald"
  | "group_aschelande"
  | "group_eisenoede"
  | "group_sonnensteppe"
  | "group_himmelsweite";

export interface PropertyGroupDefinition {
  id: PropertyGroupId;
  displayName: string;
  propertyIds: readonly string[];
  size: 2 | 3;
  buildCost: number;
  accent: `#${string}`;
  sigil: string;
}

export const PROPERTY_GROUPS: readonly PropertyGroupDefinition[] = [
  { id: "group_mondhain", displayName: "Mondhain", propertyIds: ["mondpfad", "sternenlichtung"], size: 2, buildCost: 50, accent: "#a6b7ce", sigil: "☾" },
  { id: "group_amethystwald", displayName: "Amethystwald", propertyIds: ["fluesterhain", "silberblatt", "amethystkrone"], size: 3, buildCost: 50, accent: "#9b5de5", sigil: "✦" },
  { id: "group_silberbach", displayName: "Silberbach", propertyIds: ["muehlenweg", "koenigsfurt", "rosenhain"], size: 3, buildCost: 100, accent: "#24c4b7", sigil: "≈" },
  { id: "group_kronenwald", displayName: "Kronenwald", propertyIds: ["falkenruh", "gruenwacht", "koenigsforst"], size: 3, buildCost: 100, accent: "#3eaf63", sigil: "♛" },
  { id: "group_aschelande", displayName: "Aschelande", propertyIds: ["staubkamm", "knochenpass", "rotfels"], size: 3, buildCost: 150, accent: "#f08a3c", sigil: "✹" },
  { id: "group_eisenoede", displayName: "Eisenöde", propertyIds: ["eisenklamm", "kriegsgrund", "schwarzgrat"], size: 3, buildCost: 150, accent: "#c94f45", sigil: "◆" },
  { id: "group_sonnensteppe", displayName: "Sonnensteppe", propertyIds: ["windgras", "adlerhoehe", "donnerpfad"], size: 3, buildCost: 200, accent: "#e5c04a", sigil: "☀" },
  { id: "group_himmelsweite", displayName: "Himmelsweite", propertyIds: ["geistertal", "himmelsgrat"], size: 2, buildCost: 200, accent: "#4387e6", sigil: "✧" }
] as const;

export function getPropertyGroup(group: PropertyGroupId | string | undefined): PropertyGroupDefinition | undefined {
  if (!group) return undefined;
  return PROPERTY_GROUPS.find((definition) => definition.id === group || definition.displayName === group);
}

export function getPropertyGroupForProperty(propertyId: string): PropertyGroupDefinition | undefined {
  return PROPERTY_GROUPS.find((definition) => definition.propertyIds.includes(propertyId));
}

export type PropertyGroupRole = "group-start" | "group-middle" | "group-end" | "group-single";

export function getPropertyGroupRole(group: PropertyGroupDefinition, propertyId: string): PropertyGroupRole | undefined {
  const index = group.propertyIds.indexOf(propertyId);
  if (index < 0) return undefined;
  if (group.propertyIds.length === 1) return "group-single";
  if (index === 0) return "group-start";
  if (index === group.propertyIds.length - 1) return "group-end";
  return "group-middle";
}
