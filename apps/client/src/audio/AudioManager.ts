import {
  AUDIO_CUES,
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  DEFAULT_UI_VOLUME,
  isAudioEventAllowedForRole,
  MUSIC_TRACK,
  type AudioEvent,
  type AudioOutputRole
} from "./audio-config";

export type { AudioOutputRole } from "./audio-config";

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  uiEnabled: boolean;
  masterMuted: boolean;
  hapticsEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  masterVolume: DEFAULT_MASTER_VOLUME,
  musicVolume: DEFAULT_MUSIC_VOLUME,
  sfxVolume: DEFAULT_SFX_VOLUME,
  uiVolume: DEFAULT_UI_VOLUME,
  musicEnabled: true,
  sfxEnabled: true,
  uiEnabled: true,
  masterMuted: false,
  hapticsEnabled: true
};

const clampVolume = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const input = value && typeof value === "object" ? value as Partial<AudioSettings> : {};
  return {
    masterVolume: clampVolume(input.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
    musicVolume: clampVolume(input.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    sfxVolume: clampVolume(input.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
    uiVolume: clampVolume(input.uiVolume, DEFAULT_AUDIO_SETTINGS.uiVolume),
    musicEnabled: typeof input.musicEnabled === "boolean" ? input.musicEnabled : true,
    sfxEnabled: typeof input.sfxEnabled === "boolean" ? input.sfxEnabled : true,
    uiEnabled: typeof input.uiEnabled === "boolean" ? input.uiEnabled : true,
    masterMuted: typeof input.masterMuted === "boolean" ? input.masterMuted : false,
    hapticsEnabled: typeof input.hapticsEnabled === "boolean" ? input.hapticsEnabled : true
  };
}

export function selectAudioVariant(paths: readonly string[], previousPath: string | undefined, random = Math.random): string | undefined {
  if (paths.length === 0) return undefined;
  const candidates = paths.length > 1 && previousPath ? paths.filter((path) => path !== previousPath) : [...paths];
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

export class AudioManager {
  private settings = this.readSettings();
  private outputRole: AudioOutputRole = "board";
  private gameActive = false;
  private armed = false;
  private unlocked = false;
  private audioContext: AudioContext | undefined;
  private masterGain: GainNode | undefined;
  private sfxGain: GainNode | undefined;
  private uiGain: GainNode | undefined;
  private music: HTMLAudioElement | undefined;
  private musicFadeTimer: number | undefined;
  private musicDuckMultiplier = 1;
  private duckRestoreTimer: number | undefined;
  private readonly bufferLoads = new Map<string, Promise<AudioBuffer | undefined>>();
  private readonly cueLoads = new Map<AudioEvent, Promise<readonly { path: string; buffer: AudioBuffer }[]>>();
  private readonly previousVariants = new Map<AudioEvent, string>();
  private readonly lastPlayedAt = new Map<AudioEvent, number>();
  private readonly warnings = new Set<string>();
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private readonly subscribers = new Set<(settings: AudioSettings) => void>();
  private unlockHandler: (() => void) | undefined;
  private uiClickHandler: ((event: MouseEvent) => void) | undefined;

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  subscribe(listener: (settings: AudioSettings) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  updateSettings(patch: Partial<AudioSettings>): void {
    this.settings = normalizeAudioSettings({ ...this.settings, ...patch });
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private browsing and storage policies must never make audio game-critical.
    }
    this.syncVolumes();
    if (!this.settings.musicEnabled || this.settings.masterMuted || this.outputRole !== "board") this.pauseMusic();
    else if (this.gameActive && this.unlocked) void this.startMusic();
    this.subscribers.forEach((listener) => listener(this.getSettings()));
  }

  setOutputRole(role: AudioOutputRole): void {
    this.outputRole = role;
    if (role === "controller") this.pauseMusic();
    else if (this.gameActive && this.unlocked) void this.startMusic();
  }

  setGameActive(active: boolean): void {
    this.gameActive = active;
    if (!active) {
      this.stopMusic();
      return;
    }
    if (this.unlocked && this.outputRole === "board") void this.startMusic();
  }

  arm(): void {
    if (this.armed || typeof window === "undefined") return;
    this.armed = true;
    this.unlockHandler = () => { void this.unlock(); };
    window.addEventListener("pointerdown", this.unlockHandler, { capture: true });
    window.addEventListener("click", this.unlockHandler, { capture: true });
    window.addEventListener("keydown", this.unlockHandler, { capture: true });
  }

  bindUiSounds(): () => void {
    if (typeof document === "undefined" || this.uiClickHandler) return () => undefined;
    this.uiClickHandler = (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button,a,[role='button']") : null;
      if (!target || target.matches(":disabled,[aria-disabled='true']")) return;
      const explicitCue = target.dataset.audioCue as AudioEvent | undefined;
      this.play(explicitCue && explicitCue.startsWith("UI_") && explicitCue in AUDIO_CUES ? explicitCue : "UI_CLICK");
    };
    document.addEventListener("click", this.uiClickHandler, true);
    return () => {
      if (this.uiClickHandler) document.removeEventListener("click", this.uiClickHandler, true);
      this.uiClickHandler = undefined;
    };
  }

  async unlock(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      this.audioContext ??= this.createAudioContext();
      if (this.audioContext && this.audioContext.state === "suspended") await this.audioContext.resume();
      if (!this.audioContext || this.audioContext.state !== "running") return;
      this.unlocked = true;
      this.ensureGainGraph();
      // Warm timing-sensitive buffers after consent, before dice and field arrivals.
      if (this.outputRole === "board") {
        void this.loadCue("DICE_ROLL");
        void this.loadCue("TOKEN_MOVE");
      }
      document.documentElement.dataset.gameAudio = "ready";
      if (this.gameActive && this.outputRole === "board") await this.startMusic();
    } catch {
      // Autoplay restrictions can reject resume/play. A later interaction retries safely.
    }
  }

  play(event: AudioEvent): void {
    const cue = AUDIO_CUES[event];
    if (!this.unlocked || !this.audioContext || this.settings.masterMuted) return;
    if (!isAudioEventAllowedForRole(event, this.outputRole)) return;
    if (cue.group === "SFX" && !this.settings.sfxEnabled) return;
    if (cue.group === "UI" && !this.settings.uiEnabled) return;
    const now = performance.now();
    if (now - (this.lastPlayedAt.get(event) ?? -Infinity) < cue.cooldownMs) return;
    this.lastPlayedAt.set(event, now);

    void this.loadCue(event).then((available) => {
      if (available.length === 0 || !this.audioContext || this.activeSources.size >= 16) return;
      // The application surface was already authoritatively checked when play() was requested.
      // Routes are full-page surfaces, so a mutable second role check can only drop a valid
      // board cue while its first buffer is loading.
      if ((cue.group === "SFX" && !this.settings.sfxEnabled) || this.settings.masterMuted) return;
      const path = selectAudioVariant(available.map((entry) => entry.path), this.previousVariants.get(event));
      const selected = available.find((entry) => entry.path === path);
      if (!selected) return;
      this.previousVariants.set(event, selected.path);
      this.playBuffer(event, selected.buffer);
    }).catch(() => undefined);
  }

  stopMusic(): void {
    this.pauseMusic();
    if (!this.music) return;
    try { this.music.currentTime = 0; } catch { /* Metadata may not be loaded yet. */ }
  }

  dispose(): void {
    this.stopMusic();
    if (typeof window !== "undefined" && this.unlockHandler) {
      window.removeEventListener("pointerdown", this.unlockHandler, true);
      window.removeEventListener("click", this.unlockHandler, true);
      window.removeEventListener("keydown", this.unlockHandler, true);
    }
    if (typeof document !== "undefined" && this.uiClickHandler) document.removeEventListener("click", this.uiClickHandler, true);
    this.activeSources.forEach((source) => { try { source.stop(); } catch { /* Already stopped. */ } });
    void this.audioContext?.close().catch(() => undefined);
    this.armed = false;
    this.unlocked = false;
  }

  private readSettings(): AudioSettings {
    if (typeof window === "undefined") return { ...DEFAULT_AUDIO_SETTINGS };
    try {
      const stored = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
      return normalizeAudioSettings(stored ? JSON.parse(stored) : undefined);
    } catch {
      return { ...DEFAULT_AUDIO_SETTINGS };
    }
  }

  private createAudioContext(): AudioContext | undefined {
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Context ? new Context() : undefined;
  }

  private ensureGainGraph(): void {
    if (!this.audioContext || this.masterGain) return;
    this.masterGain = this.audioContext.createGain();
    this.sfxGain = this.audioContext.createGain();
    this.uiGain = this.audioContext.createGain();
    this.sfxGain.connect(this.masterGain);
    this.uiGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
    this.syncVolumes();
  }

  private syncVolumes(): void {
    const master = this.settings.masterMuted ? 0 : this.settings.masterVolume;
    if (this.audioContext && this.masterGain && this.sfxGain && this.uiGain) {
      const at = this.audioContext.currentTime;
      this.masterGain.gain.setTargetAtTime(master, at, 0.025);
      this.sfxGain.gain.setTargetAtTime(this.settings.sfxEnabled ? this.settings.sfxVolume : 0, at, 0.025);
      this.uiGain.gain.setTargetAtTime(this.settings.uiEnabled ? this.settings.uiVolume : 0, at, 0.025);
    }
    if (this.music) this.fadeMusicTo(this.musicTargetVolume(), 180);
  }

  private musicTargetVolume(): number {
    if (this.settings.masterMuted || !this.settings.musicEnabled || this.outputRole !== "board") return 0;
    return this.settings.masterVolume * this.settings.musicVolume * this.musicDuckMultiplier;
  }

  private async startMusic(): Promise<void> {
    if (!this.gameActive || !this.unlocked || this.outputRole !== "board" || !this.settings.musicEnabled || this.settings.masterMuted || typeof Audio === "undefined") return;
    if (!this.music) {
      this.music = new Audio(MUSIC_TRACK.path);
      this.music.loop = MUSIC_TRACK.loop;
      this.music.preload = MUSIC_TRACK.preload;
      this.music.volume = this.musicTargetVolume();
      this.music.addEventListener("error", () => this.warnOnce(MUSIC_TRACK.path, `Musikdatei fehlt oder kann nicht geladen werden: ${MUSIC_TRACK.path}`));
    }
    if (!this.music.paused) return;
    try {
      await this.music.play();
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotAllowedError") {
        this.warnOnce(MUSIC_TRACK.path, `Musik konnte nicht gestartet werden: ${MUSIC_TRACK.path}`);
      }
    }
  }

  private pauseMusic(): void {
    this.music?.pause();
  }

  private loadCue(event: AudioEvent): Promise<readonly { path: string; buffer: AudioBuffer }[]> {
    const existing = this.cueLoads.get(event);
    if (existing) return existing;
    const load = (async () => {
      const cue = AUDIO_CUES[event];
      const entries = await Promise.all(cue.paths.map(async (path) => ({ path, buffer: await this.loadBuffer(path) })));
      return entries.filter((entry): entry is { path: string; buffer: AudioBuffer } => Boolean(entry.buffer));
    })();
    this.cueLoads.set(event, load);
    return load;
  }

  private loadBuffer(path: string): Promise<AudioBuffer | undefined> {
    const existing = this.bufferLoads.get(path);
    if (existing) return existing;
    const load = (async () => {
      if (!this.audioContext) return undefined;
      try {
        const response = await fetch(path, { cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await this.audioContext.decodeAudioData(await response.arrayBuffer());
      } catch {
        this.warnOnce(path, `Audioeffekt fehlt oder ist ungültig: ${path}`);
        return undefined;
      }
    })();
    this.bufferLoads.set(path, load);
    return load;
  }

  private playBuffer(event: AudioEvent, buffer: AudioBuffer): void {
    if (!this.audioContext || !this.sfxGain || !this.uiGain) return;
    const cue = AUDIO_CUES[event];
    const source = this.audioContext.createBufferSource();
    const gain = this.audioContext.createGain();
    source.buffer = buffer;
    if (cue.pitchVariation) source.detune.value = (Math.random() * 2 - 1) * cue.pitchVariation * 1_200;
    gain.gain.value = cue.volume;
    source.connect(gain).connect(cue.group === "UI" ? this.uiGain : this.sfxGain);
    source.onended = () => this.activeSources.delete(source);
    this.activeSources.add(source);
    if (cue.duckMusic) this.duckMusic(Math.max(700, buffer.duration * 1_000 + 250));
    source.start();
  }

  private duckMusic(durationMs: number): void {
    if (!this.music || this.music.paused) return;
    this.musicDuckMultiplier = 0.55;
    this.fadeMusicTo(this.musicTargetVolume(), 180);
    if (this.duckRestoreTimer !== undefined) window.clearTimeout(this.duckRestoreTimer);
    this.duckRestoreTimer = window.setTimeout(() => {
      this.musicDuckMultiplier = 1;
      this.fadeMusicTo(this.musicTargetVolume(), 420);
    }, durationMs);
  }

  private fadeMusicTo(target: number, durationMs: number): void {
    if (!this.music || typeof window === "undefined") return;
    if (this.musicFadeTimer !== undefined) window.clearInterval(this.musicFadeTimer);
    const start = this.music.volume;
    const startedAt = performance.now();
    this.musicFadeTimer = window.setInterval(() => {
      if (!this.music) return;
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      this.music.volume = Math.min(1, Math.max(0, start + (target - start) * progress));
      if (progress >= 1 && this.musicFadeTimer !== undefined) {
        window.clearInterval(this.musicFadeTimer);
        this.musicFadeTimer = undefined;
      }
    }, 30);
  }

  private warnOnce(key: string, message: string): void {
    if (this.warnings.has(key)) return;
    this.warnings.add(key);
    console.warn(`[Valenør Audio] ${message}`);
  }
}

type HotAudioScope = typeof globalThis & { __valenorAudioManager?: AudioManager };
const hotAudioScope = globalThis as HotAudioScope;
const existingHotManager = import.meta.hot ? hotAudioScope.__valenorAudioManager : undefined;

// Vite can reload importers with different module URLs while an old manager keeps music alive.
// Reusing the per-page instance keeps board events, unlock state and the registered surface together.
export const audioManager = existingHotManager ?? new AudioManager();
if (import.meta.hot) {
  Object.setPrototypeOf(audioManager, AudioManager.prototype);
  hotAudioScope.__valenorAudioManager = audioManager;
}
