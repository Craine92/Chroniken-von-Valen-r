import type { GameState } from "@valenor/shared";
import { Icon, type IconName } from "./icons/Icon";

const ACTION_ICONS: Partial<Record<GameState["economyLog"][number]["kind"], IconName>> = {
  purchase: "property", rent: "gold", tax: "crown", auction: "auction", building: "building", mortgage: "mortgage",
  trade: "trade", bankruptcy: "bankruptcy", start: "rune", tavern: "tavern", dragon: "dragon", relic: "relic", quest: "check"
};

export function RecentActions({ state, className = "economy-log" }: { state: GameState; className?: string }) {
  return <aside className={className} aria-live="polite">
    <strong>LETZTE AKTIONEN</strong>
    {state.economyLog.slice(-3).reverse().map(entry => <p key={entry.id} title={entry.message}>
      <i aria-hidden="true">{ACTION_ICONS[entry.kind] ? <Icon name={ACTION_ICONS[entry.kind]!} /> : null}</i><span>{entry.message}</span>
    </p>)}
  </aside>;
}
