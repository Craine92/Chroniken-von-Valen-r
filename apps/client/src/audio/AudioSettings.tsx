import { useEffect, useState } from "react";
import { audioManager, type AudioOutputRole, type AudioSettings as Settings } from "./AudioManager";

function VolumeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const percent = Math.round(value * 100);
  return (
    <label className="audio-volume-control">
      <span>{label}<b>{percent}%</b></span>
      <input type="range" min="0" max="100" step="1" value={percent} onChange={(event) => onChange(Number(event.target.value) / 100)} />
    </label>
  );
}

export function AudioSettingsPanel({ role = "primary" }: { role?: AudioOutputRole }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => audioManager.getSettings());

  useEffect(() => audioManager.subscribe(setSettings), []);
  const update = (patch: Partial<Settings>) => audioManager.updateSettings(patch);

  return (
    <div className={`audio-settings ${open ? "is-open" : ""}`}>
      <button className="audio-settings__trigger" type="button" aria-expanded={open} aria-label="Audioeinstellungen" data-audio-cue={open ? "UI_CANCEL" : "UI_CLICK"} onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">{settings.masterMuted ? "♩" : "♫"}</span>
      </button>
      {open && (
        <aside className="audio-settings__panel" aria-label="Audio">
          <header><div><small>EINSTELLUNGEN</small><h2>Audio</h2></div><button type="button" aria-label="Schließen" data-audio-cue="UI_CANCEL" onClick={() => setOpen(false)}>×</button></header>
          <VolumeControl label="Gesamtlautstärke" value={settings.masterVolume} onChange={(masterVolume) => update({ masterVolume })} />
          <VolumeControl label="Musik" value={settings.musicVolume} onChange={(musicVolume) => update({ musicVolume })} />
          <VolumeControl label="Soundeffekte" value={settings.sfxVolume} onChange={(sfxVolume) => update({ sfxVolume })} />
          <VolumeControl label="UI-Sounds" value={settings.uiVolume} onChange={(uiVolume) => update({ uiVolume })} />
          <div className="audio-settings__toggles">
            <button type="button" aria-pressed={settings.musicEnabled} onClick={() => update({ musicEnabled: !settings.musicEnabled })}><i />Musik {settings.musicEnabled ? "an" : "aus"}</button>
            <button type="button" aria-pressed={settings.sfxEnabled} onClick={() => update({ sfxEnabled: !settings.sfxEnabled })}><i />Effekte {settings.sfxEnabled ? "an" : "aus"}</button>
            <button type="button" aria-pressed={settings.uiEnabled} onClick={() => update({ uiEnabled: !settings.uiEnabled })}><i />UI {settings.uiEnabled ? "an" : "aus"}</button>
            {role === "controller" && <button type="button" aria-pressed={settings.hapticsEnabled} onClick={() => update({ hapticsEnabled: !settings.hapticsEnabled })}><i />Haptik {settings.hapticsEnabled ? "an" : "aus"}</button>}
          </div>
          <button className="audio-settings__mute" type="button" aria-pressed={settings.masterMuted} data-audio-cue={settings.masterMuted ? "UI_CONFIRM" : "UI_CANCEL"} onClick={() => update({ masterMuted: !settings.masterMuted })}>{settings.masterMuted ? "Ton wieder einschalten" : "Alles stummschalten"}</button>
        </aside>
      )}
    </div>
  );
}

export function AudioRuntime({ role }: { role: AudioOutputRole }) {
  useEffect(() => {
    audioManager.setOutputRole(role);
    audioManager.arm();
    return audioManager.bindUiSounds();
  }, [role]);
  return <AudioSettingsPanel role={role} />;
}
