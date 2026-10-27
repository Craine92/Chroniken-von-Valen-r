/**
 * Minimaler Markdown-Leser für ATTRIBUTIONS.md: Überschriften, Absätze, Listen und Tabellen.
 * Abschnitte zwischen <!-- credits:skip-start … --> und <!-- credits:skip-end --> sind Pflegehinweise und werden ausgelassen.
 */
export type CreditsBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());

export function parseCreditsMarkdown(markdown: string): CreditsBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: CreditsBlock[] = [];
  let skipping = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (/<!--\s*credits:skip-start/.test(line)) { skipping = true; continue; }
    if (/<!--\s*credits:skip-end/.test(line)) { skipping = false; continue; }
    if (skipping || !line.trim() || /^<!--.*-->$/.test(line.trim())) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!.trim() }); continue; }
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index]!.trim().startsWith("|")) tableLines.push(lines[index++]!);
      index--;
      const [header, , ...body] = tableLines;
      blocks.push({ kind: "table", headers: cells(header!), rows: body.map(cells) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index]!)) items.push(lines[index++]!.replace(/^\s*[-*]\s+/, "").trim());
      index--;
      blocks.push({ kind: "list", items });
      continue;
    }
    const paragraph: string[] = [line.trim()];
    while (index + 1 < lines.length && lines[index + 1]!.trim() && !/^(#|\||\s*[-*]\s|<!--)/.test(lines[index + 1]!)) paragraph.push(lines[++index]!.trim());
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

/** Zerlegt Inline-Text in Code, Fettung, Adressen und Klartext. Adressen bleiben Text, weil das Spiel keine fremden Seiten öffnet. */
export type CreditsInline = { kind: "text" | "code" | "strong" | "url"; text: string };

export function parseCreditsInline(text: string): CreditsInline[] {
  const parts: CreditsInline[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s,;)"]+[^\s,;)".])/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push({ kind: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ kind: "code", text: match[1] });
    else if (match[2] !== undefined) parts.push({ kind: "strong", text: match[2] });
    else if (match[3] !== undefined) parts.push({ kind: "text", text: `${match[3]} (` }, { kind: "url", text: match[4]! }, { kind: "text", text: ")" });
    else parts.push({ kind: "url", text: match[5]! });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
