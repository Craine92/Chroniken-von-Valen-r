import type { RegionType } from "@valenor/shared";
import type { GameMomentKind } from "./moments";

/** Satzgruppen: je Ereignistyp, dazu Varianten für hohe Miete, den Drachen ohne Relikt und mehrere Sieger. */
export type ChroniclePool = GameMomentKind | "rentHigh" | "dragonEmpty" | "victoryShared";

/**
 * Sätze des Chronisten. Platzhalter: {player}, {other}, {tile}, {gold}, {building}, {group}, {relic}, {title}, {winner}.
 * Ein Satz mit einem Platzhalter, für den es keinen Wert gibt, wird übersprungen. Satzzeichen am Ende setzt der Chronist.
 */
export const CHRONICLE_LINES: Readonly<Record<ChroniclePool, readonly string[]>> = {
  purchase: [
    "{tile} fällt an {player}",
    "{player} erwirbt {tile} für {gold} Gold",
    "Ein neues Banner weht über {tile}",
    "{player} setzt das Siegel unter die Urkunde von {tile}",
    "Für {gold} Gold wechselt {tile} in die Hände von {player}",
    "{tile} gehört nun {player}",
    "{player} schlägt zu: {tile} ist gesichert",
    "Die Schreiber notieren: {tile} gehört jetzt {player}"
  ],
  auctionWon: [
    "{player} ersteigert {tile} für {gold} Gold",
    "Der Hammer fällt: {tile} geht an {player}",
    "Höchstgebot {gold} Gold. {tile} gehört {player}",
    "Zum Ersten, zum Zweiten … {tile} an {player}",
    "{player} bietet alle aus und nimmt {tile} mit"
  ],
  build: [
    "{player} errichtet {building} auf {tile}",
    "Auf {tile} wächst {building} empor",
    "Hämmer klingen auf {tile}: {player} baut",
    "Stein auf Stein: {tile} erhält {building}",
    "{tile} wächst. {player} lässt bauen",
    "Mörtel, Balken, Ehrgeiz: {player} baut {building}"
  ],
  rent: [
    "{player} zahlt {gold} Gold an {other}",
    "{other} kassiert {gold} Gold von {player}",
    "Der Zoll von {tile} ist fällig: {gold} Gold für {other}",
    "{player} lässt {gold} Gold in die Truhe von {other} klimpern",
    "Wer {tile} betritt, zahlt. {player} legt {gold} Gold auf den Tisch",
    "{gold} Gold wandern von {player} zu {other}"
  ],
  rentHigh: [
    "Ein harter Tag für {player}: {gold} Gold an {other}",
    "{other} reibt sich die Hände, {player} zahlt {gold} Gold",
    "Autsch! {gold} Gold Miete auf {tile}",
    "Das schmerzt: {player} verliert {gold} Gold an {other}",
    "{tile} zeigt Zähne. {player} zahlt {gold} Gold",
    "Die Truhe von {player} wird leichter: {gold} Gold an {other}"
  ],
  groupComplete: [
    "{player} vereint {group}. Nun darf gebaut werden",
    "Ganz {group} hört auf {player}",
    "{group} ist vollständig in der Hand von {player}",
    "Die Karte färbt sich: {group} gehört {player}",
    "{player} hält alle Siegel von {group}"
  ],
  tradeSealed: [
    "{player} und {other} besiegeln einen Handel",
    "Handschlag zwischen {player} und {other}. Das Siegel ist gesetzt",
    "Ein Pakt ist geschlossen: {player} und {other} sind sich einig",
    "Wachs tropft, Siegel drückt: {player} und {other} handeln",
    "Die Schreiber eilen herbei. {player} und {other} haben getauscht"
  ],
  bankrupt: [
    "{player} verlässt die Chronik. Die Truhe ist leer",
    "Das Gold von {player} ist versiegt",
    "{player} bricht unter der Last der Schulden zusammen",
    "Ein letzter Blick in leere Taschen: {player} ist bankrott",
    "Die Krone pfändet. {player} scheidet aus"
  ],
  dragon: [
    "Der Drache mustert {player} und lässt {relic} zurück",
    "Feuer und Schuppen! {player} trotzt dem Hüter und erhält {relic}",
    "{player} begegnet dem wandernden Drachen. {relic} glänzt im Gepäck",
    "Der Hüter der Relikte neigt das Haupt vor {player}: {relic}"
  ],
  dragonEmpty: [
    "Der Drache schnaubt, mustert {player} und zieht weiter",
    "{player} begegnet dem Drachen, doch die Reliktplätze sind schon voll",
    "Ein Schatten über {player}. Der Drache fliegt weiter"
  ],
  dungeonEnter: [
    "Die Kerkertür fällt hinter {player} ins Schloss",
    "{player} wandert in den Dunklen Kerker",
    "Ketten rasseln. {player} sitzt fest",
    "Die Wachen führen {player} ab",
    "Feuchte Mauern, kaltes Stroh: {player} ist im Kerker"
  ],
  dungeonLeave: [
    "{player} ist wieder frei",
    "Das Schloss springt auf, {player} tritt ins Licht",
    "{player} entkommt dem Kerker",
    "Frische Luft für {player}"
  ],
  tavernWin: [
    "{player} räumt den Weltenweg-Pott ab: {gold} Gold",
    "Die Taverne jubelt! {player} gewinnt {gold} Gold",
    "Krüge klirren. {player} streicht {gold} Gold ein"
  ],
  tavernLoss: [
    "{player} verzockt sich. Das Gold bleibt im Pott",
    "Die Würfel der Taverne sind gnadenlos zu {player}",
    "Gelächter am Tresen: {player} geht leer aus"
  ],
  tax: [
    "{player} zahlt {gold} Gold in den Weltenweg-Pott",
    "Die Steuereintreiber besuchen {player}: {gold} Gold",
    "Der Pott wächst. {player} gibt {gold} Gold"
  ],
  startPass: [
    "{player} passiert das Runentor und erhält {gold} Gold",
    "Die Runen leuchten auf. {gold} Gold für {player}",
    "Ein neuer Umlauf beginnt für {player}",
    "Das Runentor grüßt {player} mit {gold} Gold"
  ],
  double: [
    "Pasch! {player} darf noch einmal",
    "Die Würfel lieben {player}: Pasch",
    "Zwei gleiche Augen. {player} würfelt erneut",
    "Das Glück zwinkert {player} zu. Pasch!"
  ],
  chronicleEvent: [
    "Ein neues Kapitel: {title}",
    "Die Chronik verkündet: {title}",
    "Etwas regt sich in Valenør: {title}"
  ],
  worldImpulse: [
    "Ein Weltimpuls erschüttert Valenør: {title}",
    "Die Welt hält inne: {title}",
    "Magie liegt in der Luft: {title}"
  ],
  lastRound: [
    "Die Sanduhr ist leer. Die letzte Runde beginnt",
    "Ein letztes Mal rollen die Würfel",
    "Die letzten Seiten der Chronik werden geschrieben"
  ],
  victory: [
    "{winner} krönt die Chronik von Valenør",
    "Die Chronik ist geschrieben. {winner} triumphiert",
    "Ganz Valenør jubelt {winner} zu",
    "Der Thron gehört {winner}"
  ],
  victoryShared: [
    "{winner} teilen sich den Thron von Valenør",
    "Gemeinsam an der Spitze: {winner}",
    "Ganz Valenør jubelt {winner} zu",
    "Die Chronik endet mit einem Gleichstand: {winner}"
  ]
};

/** Schlusswendungen je Reich, angehängt an Käufe, Auktionen und Bauten. */
export const REALM_FLOURISHES: Readonly<Record<RegionType, readonly string[]>> = {
  elves: [
    "die Glühwürmchen tanzen",
    "im Amethystwald flüstern die Bäume",
    "die Kristalle schimmern heller",
    "ein Elfenlied weht durch die Zweige",
    "der Nebel zwischen den Stämmen lichtet sich"
  ],
  humans: [
    "die Glocken läuten",
    "im Kronenwald hebt man die Krüge",
    "die Herolde rufen es aus",
    "auf den Feldern hält man kurz inne",
    "ein Banner knattert im Wind"
  ],
  orcs: [
    "die Trommeln schweigen",
    "in der Eisenöde glüht die Esse",
    "die Kriegshörner antworten",
    "Asche rieselt über das Land",
    "die Schmiede halten den Atem an"
  ],
  steppe: [
    "der Wind trägt es über das Gras",
    "über der Sonnensteppe kreist ein Falke",
    "die Nomaden nicken anerkennend",
    "die Sonne brennt ein wenig heller",
    "in der Ferne wiehern die Pferde"
  ]
};

/** Welche Ereignisse eine Schlusswendung des Reichs bekommen. */
export const FLOURISHED_MOMENTS: ReadonlySet<GameMomentKind> = new Set(["purchase", "auctionWon", "build"]);

/** Die Feder wartet: Text, solange noch nichts geschehen ist. */
export const CHRONICLE_IDLE_LINE = "Der Chronist taucht die Feder ein …";
