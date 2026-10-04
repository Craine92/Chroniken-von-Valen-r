import type { GameConfig, GameMode, QuickGameDuration } from "@valenor/shared";

const DURATIONS: QuickGameDuration[] = [60, 75, 90];

interface GameModeSelectorProps {
  config: GameConfig;
  onChange: (config: GameConfig) => void;
  disabled?: boolean;
}

export function GameModeSelector({ config, onChange, disabled }: GameModeSelectorProps) {
  const selectMode = (mode: GameMode) => {
    onChange(mode === "quick" ? { mode: "quick", quickGameDurationMinutes: 75 } : { mode: "chronicles" });
  };

  return (
    <section className="mode-panel">
      <div className="mode-panel__heading">
        <p className="eyebrow">Art der Chronik</p>
        <h2>Spielmodus</h2>
      </div>
      <div className="mode-cards">
        <button
          className={`mode-card ${config.mode === "chronicles" ? "is-selected" : ""}`}
          type="button"
          onClick={() => selectMode("chronicles")}
          disabled={disabled}
          aria-pressed={config.mode === "chronicles"}
        >
          <span className="mode-card__icon" aria-hidden="true">♜</span>
          <strong>Chroniken-Modus</strong>
          <span>Das vollständige Abenteuer. Erobert Reiche, errichtet Festungen und treibt eure Rivalen in den Ruin.</span>
          <small>OHNE ZEITLIMIT</small>
        </button>
        <button
          className={`mode-card ${config.mode === "quick" ? "is-selected" : ""}`}
          type="button"
          onClick={() => selectMode("quick")}
          disabled={disabled}
          aria-pressed={config.mode === "quick"}
        >
          <span className="mode-card__icon" aria-hidden="true">◷</span>
          <strong>Schnelles Abenteuer</strong>
          <span>Eine kompaktere Chronik für einen Spieleabend. Mehr Tempo, mehr Entscheidungen und ein festes Ende.</span>
          <small>FESTE SPIELDAUER</small>
        </button>
      </div>
      <div className={`duration-picker ${config.mode === "quick" ? "is-visible" : ""}`} aria-hidden={config.mode !== "quick"}>
        <span>Dauer</span>
        {DURATIONS.map((duration) => (
          <button
            key={duration}
            type="button"
            className={config.quickGameDurationMinutes === duration ? "is-selected" : ""}
            onClick={() => onChange({ mode: "quick", quickGameDurationMinutes: duration })}
            disabled={disabled || config.mode !== "quick"}
          >
            {duration} MIN
          </button>
        ))}
      </div>
    </section>
  );
}
