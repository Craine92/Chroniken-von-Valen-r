export function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`connection-badge ${connected ? "is-connected" : "is-disconnected"}`}>
      <span className="connection-badge__dot" aria-hidden="true" />
      {connected ? "Verbunden" : "Verbindung wird gesucht"}
    </span>
  );
}
