/**
 * Sinnvolle Trennstellen für lange Wörter in Kartentiteln, an den Wortfugen („Weissagungs|spiegel“). Die automatische
 * Silbentrennung des Browsers trennt deutsche Zusammensetzungen oft unglücklich („Weissagungsspie-gel“); deshalb
 * trennt der Titel nur hier (CSS hyphens: manual). Ein Test prüft, dass jedes lange Titelwort eingetragen ist.
 */
export const TITLE_BREAKS: Readonly<Record<string, string>> = {
  Weissagungsspiegel: "Weis|sagungs|spiegel",
  Schicksalsgewebe: "Schicksals|gewebe",
  Krönungsbeitrag: "Krönungs|beitrag",
  Mondfinsternis: "Mond|finsternis",
  Steinlausplage: "Steinlaus|plage",
  Mondchronistin: "Mond|chronistin",
  Sternenlichts: "Sternen|lichts",
  Runenschmieds: "Runen|schmieds",
  Sternenorakel: "Sternen|orakel",
  Silberthrons: "Silber|throns",
  Zerbrochener: "Zer|brochener",
  Weggefährten: "Weg|gefährten",
  Himmelsweite: "Himmels|weite",
  Greifenfeder: "Greifen|feder",
  Prophezeiung: "Prophe|zeiung",
  Drachenpass: "Drachen|pass",
  Waldgeister: "Wald|geister",
  Mondseherin: "Mond|seherin",
  Silberstrom: "Silber|strom",
  Drachenfraß: "Drachen|fraß",
  Quellnymphe: "Quell|nymphe",
  Kronengarde: "Kronen|garde"
};

/** Ab dieser Länge braucht ein Titelwort eine eingetragene Trennstelle. */
export const LONG_TITLE_WORD = 11;

const SOFT_HYPHEN = "­";

/** Titel mit weichen Trennstrichen an den Wortfugen. */
export function hyphenateTitle(title: string): string {
  return title.replace(/[\p{L}]+/gu, word => TITLE_BREAKS[word]?.replaceAll("|", SOFT_HYPHEN) ?? word);
}
