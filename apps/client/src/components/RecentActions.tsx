import type { GameState } from "@valenor/shared";

const ACTION_SIGILS: Partial<Record<GameState["economyLog"][number]["kind"], string>> = {
  purchase: "♜", rent: "✦", tax: "♛", auction: "⚖", building: "⌂", mortgage: "⛓",
  trade: "⇄", bankruptcy: "⊘", start: "ᚱ", tavern: "⚄", dragon: "♞", relic: "✧", quest: "✓"
};

export function RecentActions({ state, className = "economy-log" }: { state: GameState; className?: string }) {
  return <aside className={className} aria-live="polite">
    <strong>LETZTE AKTIONEN</strong>
    {state.economyLog.slice(-3).reverse().map(entry => <p key={entry.id} title={entry.message}>
      <i aria-hidden="true">{ACTION_SIGILS[entry.kind] ?? "·"}</i><span>{entry.message}</span>
    </p>)}
  </aside>;
}
