import type { AiDifficulty, GameConfig, GameMode, QuickGameDuration } from "@valenor/shared";

const DURATIONS: QuickGameDuration[] = [60, 75, 90];

interface GameModeSelectorProps {
  config: GameConfig;
  onChange: (config: GameConfig) => void;
  disabled?: boolean;
}

export function GameModeSelector({ config, onChange, disabled }: GameModeSelectorProps) {
  const selectMode = (mode: GameMode) => {
    onChange(mode === "quick" ? { mode: "quick", quickGameDurationMinutes: 75, aiDifficulty: config.aiDifficulty ?? "normal" } : { mode: "chronicles", aiDifficulty: config.aiDifficulty ?? "normal" });
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
            onClick={() => onChange({ mode: "quick", quickGameDurationMinutes: duration, aiDifficulty: config.aiDifficulty ?? "normal" })}
            disabled={disabled || config.mode !== "quick"}
          >
            {duration} MIN
          </button>
        ))}
      </div>
      <div className="difficulty-picker" aria-label="KI-Schwierigkeit">
        <span>KI-Schwierigkeit</span>
        {(["easy", "normal", "hard"] as AiDifficulty[]).map((difficulty) => <button key={difficulty} type="button" className={(config.aiDifficulty ?? "normal") === difficulty ? "is-selected" : ""} disabled={disabled} onClick={() => onChange({ ...config, aiDifficulty: difficulty })}>{difficulty === "easy" ? "LEICHT" : difficulty === "normal" ? "NORMAL" : "SCHWER"}</button>)}
        <small>{(config.aiDifficulty ?? "normal") === "easy" ? "Große Reserven, vorsichtige Käufe und seltene Aktionen." : (config.aiDifficulty ?? "normal") === "hard" ? "Die bisherige, offensive KI mit engen Reserven." : "Ausgewogene Entscheidungen und Reserven."}</small>
      </div>
    </section>
  );
}
