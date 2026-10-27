import { useEffect, useRef } from "react";
import { Icon } from "../icons/Icon";
import { parseCreditsInline, parseCreditsMarkdown, type CreditsBlock } from "./credits-markdown";

function Inline({ text }: { text: string }) {
  return <>{parseCreditsInline(text).map((part, index) => part.kind === "code" ? <code key={index}>{part.text}</code>
    : part.kind === "strong" ? <strong key={index}>{part.text}</strong>
      : part.kind === "url" ? <span key={index} className="credits__url">{part.text}</span>
        : <span key={index}>{part.text}</span>)}</>;
}

function Block({ block }: { block: CreditsBlock }) {
  if (block.kind === "heading") return block.level === 1 ? null : <h3>{block.text}</h3>;
  if (block.kind === "paragraph") return <p><Inline text={block.text} /></p>;
  if (block.kind === "list") return <ul>{block.items.map((item, index) => <li key={index}><Inline text={item} /></li>)}</ul>;
  // Tabellenzeilen als Karten: lange Pfade und Lizenztexte bleiben so auch auf dem TV lesbar.
  return <div className="credits__entries">{block.rows.map((row, rowIndex) => <article key={rowIndex} className="credits__entry">
    <h4><Inline text={row[0] ?? ""} /></h4>
    <dl>{block.headers.slice(1).map((header, index) => <div key={header}><dt>{header}</dt><dd><Inline text={row[index + 1] ?? ""} /></dd></div>)}</dl>
  </article>)}</div>;
}

/** Übersicht der Mitwirkenden und Lizenzen; Inhalt kommt unverändert aus ATTRIBUTIONS.md. */
export function CreditsDialog({ markdown, onClose }: { markdown: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="credits-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="credits" role="dialog" aria-modal="true" aria-labelledby="credits-title">
      <header className="credits__header">
        <div><p className="eyebrow">Chroniken von Valenør</p><h2 id="credits-title">Mitwirkende &amp; Lizenzen</h2></div>
        <button ref={closeButton} type="button" className="credits__close" onClick={onClose}><Icon name="close" /> Schließen</button>
      </header>
      <p className="credits__intro">Dieses Spiel verwendet die folgenden Werke. Danke an alle, die sie geschaffen und frei zur Verfügung gestellt haben.</p>
      <div className="credits__body">{parseCreditsMarkdown(markdown).map((block, index) => <Block key={index} block={block} />)}</div>
    </section>
  </div>;
}
