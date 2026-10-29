import { useEffect, useRef } from "react";
import { BrandMark } from "../BrandMark";

/** Die Schritte für Freunde, die Valenør zum ersten Mal auf ihrem Windows-PC spielen. Kurz und ohne Fachwörter. */
export const GUIDE_STEPS: readonly { title: string; lines: readonly string[] }[] = [
  { title: "Installieren", lines: [
    "Die Datei „Chroniken-von-Valenor-Setup“ doppelt anklicken.",
    "Windows warnt vielleicht: „Der Computer wurde durch Windows geschützt.“ Das passiert bei Spielen ohne teure Signatur. Auf „Weitere Informationen“ klicken, dann auf „Trotzdem ausführen“.",
    "Dem Assistenten folgen. Danach liegt Valenør auf dem Desktop und im Startmenü."
  ] },
  { title: "Firewall erlauben", lines: [
    "Der Assistent erlaubt Valenør automatisch, im privaten Heim-WLAN Verbindungen anzunehmen.",
    "Fragt Windows trotzdem nach (z. B. bei der Portable-Version): „Private Netzwerke“ anhaken und „Zugriff zulassen“ wählen.",
    "Das WLAN sollte in Windows als „Privates Netzwerk“ eingestellt sein (Einstellungen → Netzwerk und Internet → WLAN → Netzwerkprofil)."
  ] },
  { title: "Handys ins selbe WLAN", lines: [
    "Alle Handys müssen im selben WLAN sein wie der Laptop – nicht im Gäste-WLAN und nicht nur über mobile Daten.",
    "Internet braucht das Spiel nicht. Es reicht ein gemeinsames WLAN, zur Not auch der Hotspot eines Handys."
  ] },
  { title: "QR-Code scannen", lines: [
    "Valenør starten. Die Lobby zeigt einen QR-Code.",
    "Mit der Kamera des Handys scannen und den Link öffnen. Namen und Figur wählen, dann „Bereit“.",
    "Klappt der QR-Code nicht, die Adresse unter dem QR-Code im Handy-Browser eintippen."
  ] },
  { title: "Laptop ans Netzteil", lines: [
    "Mit Netzteil läuft das Spiel flüssiger. Im Akkubetrieb bremst Windows die Grafik stark.",
    "Am besten den Laptop per HDMI an den Fernseher anschließen."
  ] }
];

export const GUIDE_TIPS: readonly [string, string][] = [
  ["Handy findet das Spiel nicht", "Ist das Handy im selben WLAN? Ist das WLAN in Windows „Privat“? Valenør einmal neu starten."],
  ["„Kein WLAN gefunden“", "Den Laptop mit dem WLAN verbinden und Valenør neu starten."],
  ["Vollbild verlassen", "F11 schaltet zwischen Vollbild und Fenster um. Alt+F4 beendet das Spiel."],
  ["Etwas stimmt nicht", "Valenør neu starten. Das Protokoll liegt unter %APPDATA%\\Chroniken von Valenør\\logs\\valenor.log."]
];

function GuideBody() {
  return <>
    <ol className="friend-guide__steps">
      {GUIDE_STEPS.map((step, index) => <li key={step.title}>
        <span className="friend-guide__number" aria-hidden="true">{index + 1}</span>
        <div><h2>{step.title}</h2>{step.lines.map(line => <p key={line}>{line}</p>)}</div>
      </li>)}
    </ol>
    <section className="friend-guide__tips" aria-label="Wenn etwas nicht klappt">
      <h2>Wenn etwas nicht klappt</h2>
      <dl>{GUIDE_TIPS.map(([problem, help]) => <div key={problem}><dt>{problem}</dt><dd>{help}</dd></div>)}</dl>
    </section>
  </>;
}

/** Eigene Seite /anleitung, auch als Vorlage für die Anleitung.pdf. */
export function FriendGuidePage() {
  return <main className="friend-guide friend-guide--page">
    <header><BrandMark compact /><div><p className="eyebrow">Für Freunde</p><h1>So spielt ihr Valenør</h1><p>Ein Laptop, ein Fernseher, ein Handy pro Person – und ein gemeinsames WLAN.</p></div></header>
    <GuideBody />
  </main>;
}

/** Die Anleitung als Fenster über der Lobby; Escape oder „Schließen“ beendet es. */
export function FriendGuideDialog({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="friend-guide-overlay" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="friend-guide friend-guide--dialog" role="dialog" aria-modal="true" aria-labelledby="friend-guide-title">
      <header><div><p className="eyebrow">Für Freunde</p><h1 id="friend-guide-title">So spielt ihr Valenør</h1></div><button ref={close} type="button" className="friend-guide__close" onClick={onClose}>Schließen</button></header>
      <GuideBody />
    </section>
  </div>;
}
