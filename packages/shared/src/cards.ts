import { BOARD_TILES } from "./board";

export type CardDeckType = "adventure" | "fate";

export type CardEffect =
  | { type: "receiveFromBank"; amount: number }
  | { type: "payBank"; amount: number }
  | { type: "payEachPlayer"; amount: number }
  | { type: "receiveFromEachPlayer"; amount: number }
  | { type: "moveToTile"; targetTileId: string; direction: "forward"; collectStart: boolean; resolveDestination: true }
  | { type: "moveRelative"; offset: number; resolveDestination: true }
  | { type: "moveToNearest"; target: "harbor" | "utility"; collectStart: true; resolveDestination: true }
  | { type: "goToDungeon" }
  | { type: "repair"; settlementUnitCost: number; grandStructureCost: number }
  | { type: "keepDungeonRelease" };

export interface CardDefinition {
  id: string;
  deck: CardDeckType;
  title: string;
  flavorText: string;
  effects: readonly CardEffect[];
  keepable?: boolean;
}

const adventure = (id: string, title: string, flavorText: string, effect: CardEffect, keepable = false): CardDefinition =>
  ({ id, deck: "adventure", title, flavorText, effects: [effect], ...(keepable ? { keepable: true } : {}) });
const fate = (id: string, title: string, flavorText: string, effect: CardEffect, keepable = false): CardDefinition =>
  ({ id, deck: "fate", title, flavorText, effects: [effect], ...(keepable ? { keepable: true } : {}) });

export const ADVENTURE_CARDS: readonly CardDefinition[] = [
  adventure("adv_001", "Lohn des Runenschmieds", "Ein alter Meister erkennt das Zeichen auf deiner Münze und belohnt deinen Mut.", { type: "receiveFromBank", amount: 100 }),
  adventure("adv_002", "Schatz der Nebelbucht", "Unter den morschen Planken wartet eine Truhe, die noch keinem Kapitän gehörte.", { type: "receiveFromBank", amount: 150 }),
  adventure("adv_003", "Greifenfeder", "Ein Händler zahlt für die silberne Feder mehr, als du zu hoffen wagtest.", { type: "receiveFromBank", amount: 75 }),
  adventure("adv_004", "Dank der Waldgeister", "Du löst einen uralten Dornkreis. Der Hain antwortet mit klingendem Gold.", { type: "receiveFromBank", amount: 50 }),
  adventure("adv_005", "Kobolde im Nachtlager", "Als der Morgen graut, fehlen Proviant, Stiefel und ein gut gefüllter Beutel.", { type: "payBank", amount: 75 }),
  adventure("adv_006", "Zoll der Eisenöde", "Die Brückenwächter lassen niemanden ohne königliches Wegegeld passieren.", { type: "payBank", amount: 50 }),
  adventure("adv_007", "Fluch des schwarzen Schatzes", "Das Gold funkelt verführerisch. Sein alter Hüter fordert dennoch seinen Preis.", { type: "payBank", amount: 150 }),
  adventure("adv_008", "Drachenfraß", "Deine Packtiere entkommen dem jungen Drachen – deine Vorräte nicht.", { type: "payBank", amount: 100 }),
  adventure("adv_009", "Die Runen rufen heim", "Über dem Horizont öffnet sich ein vertrauter Schimmer. Kehre zum Runentor zurück.", { type: "moveToTile", targetTileId: "runentor", direction: "forward", collectStart: true, resolveDestination: true }),
  adventure("adv_010", "Segel nach Nordhafen", "Ein schnelles Handelsschiff nimmt dich mit, ehe der Morgennebel fällt.", { type: "moveToTile", targetTileId: "nordhafen", direction: "forward", collectStart: true, resolveDestination: true }),
  adventure("adv_011", "Der Mondhirsch weist den Weg", "Silberne Hufe führen dich über verborgene Pfade zum nächsten sicheren Hafen.", { type: "moveToNearest", target: "harbor", collectStart: true, resolveDestination: true }),
  adventure("adv_012", "Ruf des Wegsteins", "Eine blaue Rune weist zur nächsten Quelle der Zivilisation.", { type: "moveToNearest", target: "utility", collectStart: true, resolveDestination: true }),
  adventure("adv_013", "Sturmfahrt", "Der Wind bläht die roten Segel und trägt dich bis zum Sturmkai.", { type: "moveToTile", targetTileId: "sturmkai", direction: "forward", collectStart: true, resolveDestination: true }),
  adventure("adv_014", "Irrlicht im Moor", "Das flackernde Licht führt dich im Kreis. Gehe drei Felder zurück.", { type: "moveRelative", offset: -3, resolveDestination: true }),
  adventure("adv_015", "Pfad des ersten Mondes", "Ein uralter Torbogen setzt dich am Mondpfad wieder auf die Straße.", { type: "moveToTile", targetTileId: "mondpfad", direction: "forward", collectStart: true, resolveDestination: true }),
  adventure("adv_016", "Festmahl der Gefährten", "Du bestehst auf die große Tafelrunde und übernimmst die Zeche aller Reisenden.", { type: "payEachPlayer", amount: 25 }),
  adventure("adv_017", "Karte des wandernden Händlers", "Für jeden Gefährten lässt du eine Abschrift der kostbaren Route anfertigen.", { type: "payEachPlayer", amount: 50 }),
  adventure("adv_018", "Beute der Ruinen", "Deine Gefährten kaufen dir kleine Anteile an einem Fund aus vergessenen Hallen ab.", { type: "receiveFromEachPlayer", amount: 20 }),
  adventure("adv_019", "Ballade vom Drachenpass", "Jeder am Feuer zahlt gern für die wahre Geschichte deiner Reise.", { type: "receiveFromEachPlayer", amount: 25 }),
  adventure("adv_020", "Sturm über den Siedlungen", "Der Sturm zerreißt Dächer und knickt die Türme deiner Ländereien.", { type: "repair", settlementUnitCost: 25, grandStructureCost: 100 }),
  adventure("adv_021", "Steinlausplage", "Winzige Runenfresser nagen an Mauern und Fundamenten deines Besitzes.", { type: "repair", settlementUnitCost: 40, grandStructureCost: 115 }),
  adventure("adv_022", "Ketten der Kronengarde", "Ein verwechselt geglaubtes Siegel bringt dich ohne Umweg in den Dunklen Kerker.", { type: "goToDungeon" }),
  adventure("adv_023", "Pakt des dunklen Magiers", "Die versprochene Abkürzung endet hinter eisenbeschlagenen Kerkertoren.", { type: "goToDungeon" }),
  adventure("adv_024", "Siegel der freien Pfade", "Das Zeichen der Wegwächter öffnet einmal selbst die Tore des Dunklen Kerkers.", { type: "keepDungeonRelease" }, true),
  adventure("adv_025", "Der verlorene Schatz", "Unter den Wurzeln einer uralten Eiche entdeckst du eine Truhe, deren Schloss längst dem Rost erlegen ist.", { type: "receiveFromBank", amount: 150 }),
  adventure("adv_026", "Überfall am Weltenweg", "Räuber brechen aus dem Unterholz hervor. Deine Börse überlebt die Begegnung nicht unversehrt.", { type: "payBank", amount: 100 }),
  adventure("adv_027", "Schiff der freien Kapitäne", "Eine fremde Besatzung bietet dir eine schnelle Passage entlang der Küsten Valenørs an.", { type: "moveToNearest", target: "harbor", collectStart: true, resolveDestination: true }),
  adventure("adv_028", "Festmahl der Gefährten", "Du lädst deine Weggefährten an eine reich gedeckte Tafel. Großzügigkeit hat ihren Preis.", { type: "payEachPlayer", amount: 25 })
];

export const FATE_CARDS: readonly CardDefinition[] = [
  fate("fate_001", "Segen des Sternenlichts", "Ein heller Stern steht über deiner Reise und füllt deine Börse.", { type: "receiveFromBank", amount: 100 }),
  fate("fate_002", "Erbe der Mondchronistin", "Eine versiegelte Schatulle trägt seit Generationen deinen Namen.", { type: "receiveFromBank", amount: 200 }),
  fate("fate_003", "Silberner Losstein", "Die Mondseher ziehen dein Zeichen aus der Schale des Glücks.", { type: "receiveFromBank", amount: 50 }),
  fate("fate_004", "Dank der Kronengarde", "Dein Hinweis verhindert einen Überfall auf die königliche Straße.", { type: "receiveFromBank", amount: 75 }),
  fate("fate_005", "Glück der Himmelsweite", "Ein seltener Himmelsopal fällt direkt vor deine Füße.", { type: "receiveFromBank", amount: 150 }),
  fate("fate_006", "Markt der tausend Laternen", "Deine Waren finden Käufer aus allen vier Regionen Valenørs.", { type: "receiveFromBank", amount: 100 }),
  fate("fate_007", "Lächeln der Quellnymphe", "Klares Wasser offenbart Münzen, die lange als verloren galten.", { type: "receiveFromBank", amount: 25 }),
  fate("fate_008", "Fluch der Mondfinsternis", "Bis das Licht zurückkehrt, verlangt der Tempel ein kostbares Opfer.", { type: "payBank", amount: 100 }),
  fate("fate_009", "Ruf zum Winterfest", "Die Krone erwartet einen angemessenen Beitrag von allen Vasallen.", { type: "payBank", amount: 75 }),
  fate("fate_010", "Zerbrochener Weissagungsspiegel", "Sieben Jahre Pech lassen sich nur mit Silberstaub abwenden.", { type: "payBank", amount: 50 }),
  fate("fate_011", "Schuld beim Sternenorakel", "Die Antwort war wahr. Nun fordert das Orakel den vereinbarten Preis.", { type: "payBank", amount: 150 }),
  fate("fate_012", "Nacht der langen Schatten", "Schutzrunen müssen erneuert werden, bevor die Dunkelheit wiederkehrt.", { type: "payBank", amount: 25 }),
  fate("fate_013", "Tribut des Silberthrons", "Ein königlicher Bote überbringt eine unerwartet schwere Forderung.", { type: "payBank", amount: 200 }),
  fate("fate_014", "Heimkehr unter Runen", "Das Tor erkennt dein wahres Zeichen und ruft dich nach Hause.", { type: "moveToTile", targetTileId: "runentor", direction: "forward", collectStart: true, resolveDestination: true }),
  fate("fate_015", "Silberstrom", "Die Strömung des Schicksals trägt dich zur nächsten Quelle der Zivilisation.", { type: "moveToNearest", target: "utility", collectStart: true, resolveDestination: true }),
  fate("fate_016", "Drei Schritte im Nebel", "Die Zukunft weicht zurück, sobald du sie zu greifen versuchst.", { type: "moveRelative", offset: -3, resolveDestination: true }),
  fate("fate_017", "Gabe an die Weggefährten", "Eine Prophezeiung mahnt dich, den kommenden Wohlstand schon heute zu teilen.", { type: "payEachPlayer", amount: 25 }),
  fate("fate_018", "Krönungsbeitrag", "Dein Name steht auf der Liste jener, die das Fest der Gefährten ausrichten.", { type: "payEachPlayer", amount: 50 }),
  fate("fate_019", "Geburtstag unter zwei Monden", "Jeder Gefährte bringt dir einen kleinen Beutel Sternengold.", { type: "receiveFromEachPlayer", amount: 20 }),
  fate("fate_020", "Weissagung des goldenen Jahres", "Wer mit dir reist, beteiligt sich an den Kosten der großen Deutung.", { type: "receiveFromEachPlayer", amount: 25 }),
  fate("fate_021", "Riss im Schicksalsgewebe", "Unsichtbare Spannungen erschüttern jedes deiner errichteten Bauwerke.", { type: "repair", settlementUnitCost: 25, grandStructureCost: 100 }),
  fate("fate_022", "Nachtfrost der Mondlosen", "Eis sprengt Mauern und lässt selbst große Hallen ächzen.", { type: "repair", settlementUnitCost: 40, grandStructureCost: 115 }),
  fate("fate_023", "Urteil der drei Seher", "Drei übereinstimmende Schatten bedeuten nur eines: den Dunklen Kerker.", { type: "goToDungeon" }),
  fate("fate_024", "Gunst der Mondseherin", "Ihr silbernes Zeichen löst einmal die Ketten des Dunklen Kerkers.", { type: "keepDungeonRelease" }, true),
  fate("fate_025", "Die goldene Prophezeiung", "Die Seher erkennen Wohlstand auf deinem Weg und ihre Worte werden schneller wahr als erwartet.", { type: "receiveFromBank", amount: 175 }),
  fate("fate_026", "Schatten über der Krone", "Eine düstere Weissagung zwingt dich zu einer kostspieligen Opfergabe.", { type: "payBank", amount: 125 }),
  fate("fate_027", "Ruf des Runentors", "Die alten Runen flammen auf und ziehen dich über die Wege Valenørs zurück zum Tor.", { type: "moveToTile", targetTileId: "runentor", direction: "forward", collectStart: true, resolveDestination: true }),
  fate("fate_028", "Gunst der Gefährten", "Das Schicksal wendet die Herzen deiner Weggefährten zu deinen Gunsten.", { type: "receiveFromEachPlayer", amount: 25 })
];

export const CARD_DEFINITIONS: readonly CardDefinition[] = [...ADVENTURE_CARDS, ...FATE_CARDS];
const CARD_BY_ID = new Map(CARD_DEFINITIONS.map((card) => [card.id, card]));

export function getCardDefinition(cardId: string): CardDefinition {
  const card = CARD_BY_ID.get(cardId);
  if (!card) throw new Error(`Unbekannte Karte: ${cardId}`);
  return card;
}

export function describeCardEffects(card: CardDefinition): string {
  return card.effects.map((effect) => {
    switch (effect.type) {
      case "receiveFromBank": return `Du erhältst ${effect.amount} Gold.`;
      case "payBank": return `Du zahlst ${effect.amount} Gold.`;
      case "payEachPlayer": return `Du zahlst jedem Gefährten ${effect.amount} Gold.`;
      case "receiveFromEachPlayer": return `Jeder Gefährte zahlt dir ${effect.amount} Gold.`;
      case "moveToTile": return `Reise vorwärts zu ${BOARD_TILES.find((tile) => tile.id === effect.targetTileId)?.name ?? effect.targetTileId}.`;
      case "moveRelative": return `Gehe ${Math.abs(effect.offset)} Felder ${effect.offset < 0 ? "zurück" : "vor"}.`;
      case "moveToNearest": return `Reise zum nächsten ${effect.target === "harbor" ? "Hafen" : "Versorgungsfeld"}.`;
      case "goToDungeon": return "Begib dich direkt in den Dunklen Kerker.";
      case "repair": return `${effect.settlementUnitCost} Gold je Baueinheit, ${effect.grandStructureCost} Gold je Großbau.`;
      case "keepDungeonRelease": return "Behalte diese Karte. Sie befreit dich einmal aus dem Dunklen Kerker.";
    }
  }).join(" ");
}
