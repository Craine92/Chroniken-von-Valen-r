export interface ControllerAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export function ControllerActionBar({ primary, secondary, label = "Schnellaktionen" }: {
  primary?: ControllerAction | undefined;
  secondary?: ControllerAction | undefined;
  label?: string;
}) {
  if (!primary && !secondary) return null;
  return <aside className="controller-action-bar" aria-label={label}>
    {primary && <button type="button" className={`is-${primary.tone ?? "primary"}`} disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</button>}
    {secondary && <button type="button" className={`is-${secondary.tone ?? "secondary"}`} disabled={secondary.disabled} onClick={secondary.onClick}>{secondary.label}</button>}
  </aside>;
}
