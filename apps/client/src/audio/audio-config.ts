export const DEFAULT_MASTER_VOLUME = 1;
export const DEFAULT_MUSIC_VOLUME = 0.25;
export const DEFAULT_SFX_VOLUME = 0.8;
export const DEFAULT_UI_VOLUME = 0.5;

export const AUDIO_SETTINGS_STORAGE_KEY = "valenor:audio-settings:v1";

export type AudioGroup = "SFX" | "UI";

export type AudioEvent =
  | "DICE_ROLL"
  | "TOKEN_MOVE"
  | "GOLD_GAIN"
  | "GOLD_PAY"
  | "PROPERTY_BUY"
  | "PROPERTY_UPGRADE"
  | "PROPERTY_RENT"
  | "CARD_DRAW"
  | "CARD_REVEAL"
  | "EVENT_POSITIVE"
  | "EVENT_NEGATIVE"
  | "EVENT_EPIC"
  | "PRISON_ENTER"
  | "PRISON_EXIT"
  | "REALM_TRANSITION"
  | "START_PASS"
  | "UI_CLICK"
  | "UI_CONFIRM"
  | "UI_CANCEL"
  | "UI_ERROR"
  | "VICTORY"
  | "DEFEAT";

export interface AudioCueConfig {
  paths: readonly string[];
  group: AudioGroup;
  volume: number;
  cooldownMs: number;
  pitchVariation?: number;
  duckMusic?: boolean;
}

const sfx = (folder: string, file: string) => `/assets/audio/sfx/${folder}/${file}`;

export const MUSIC_TRACK = {
  path: "/assets/audio/music/valenor-main.mp3",
  loop: true,
  preload: "metadata" as const
};

export const AUDIO_CUES: Readonly<Record<AudioEvent, AudioCueConfig>> = {
  DICE_ROLL: { paths: [1, 2, 3, 4, 5].map((number) => sfx("dice", `dice-0${number}.ogg`)), group: "SFX", volume: 0.9, cooldownMs: 250, pitchVariation: 0.03 },
  TOKEN_MOVE: { paths: [1, 2, 3].map((number) => sfx("movement", `token-0${number}.ogg`)), group: "SFX", volume: 0.28, cooldownMs: 160, pitchVariation: 0.025 },
  GOLD_GAIN: { paths: [sfx("economy", "coins-gain-01.ogg"), sfx("economy", "coins-gain-02.ogg")], group: "SFX", volume: 0.72, cooldownMs: 350, pitchVariation: 0.02 },
  GOLD_PAY: { paths: [sfx("economy", "coins-pay-01.ogg"), sfx("economy", "coins-pay-02.ogg")], group: "SFX", volume: 0.7, cooldownMs: 350, pitchVariation: 0.02 },
  PROPERTY_BUY: { paths: [sfx("property", "property-buy.ogg")], group: "SFX", volume: 0.9, cooldownMs: 500 },
  PROPERTY_UPGRADE: { paths: [sfx("property", "property-upgrade.ogg")], group: "SFX", volume: 0.88, cooldownMs: 500 },
  PROPERTY_RENT: { paths: [sfx("property", "property-rent.ogg")], group: "SFX", volume: 0.78, cooldownMs: 450 },
  CARD_DRAW: { paths: [sfx("cards", "card-draw-01.ogg"), sfx("cards", "card-draw-02.ogg")], group: "SFX", volume: 0.7, cooldownMs: 400, pitchVariation: 0.015 },
  CARD_REVEAL: { paths: [sfx("cards", "card-reveal.ogg")], group: "SFX", volume: 0.72, cooldownMs: 500 },
  EVENT_POSITIVE: { paths: [sfx("events", "event-positive-01.ogg"), sfx("events", "event-positive-02.ogg")], group: "SFX", volume: 0.78, cooldownMs: 650 },
  EVENT_NEGATIVE: { paths: [sfx("events", "event-negative-01.ogg"), sfx("events", "event-negative-02.ogg")], group: "SFX", volume: 0.8, cooldownMs: 650 },
  EVENT_EPIC: { paths: [sfx("events", "event-epic.ogg")], group: "SFX", volume: 0.9, cooldownMs: 1_500, duckMusic: true },
  PRISON_ENTER: { paths: [sfx("prison", "prison-enter.ogg"), sfx("prison", "chains-01.ogg")], group: "SFX", volume: 0.82, cooldownMs: 1_000, duckMusic: true },
  PRISON_EXIT: { paths: [sfx("prison", "prison-exit.ogg")], group: "SFX", volume: 0.78, cooldownMs: 800 },
  REALM_TRANSITION: { paths: [sfx("world", "realm-transition-01.ogg"), sfx("world", "realm-transition-02.ogg")], group: "SFX", volume: 0.52, cooldownMs: 1_200 },
  START_PASS: { paths: [sfx("world", "start-pass.ogg")], group: "SFX", volume: 0.82, cooldownMs: 650 },
  UI_CLICK: { paths: [sfx("ui", "click-01.ogg"), sfx("ui", "click-02.ogg")], group: "UI", volume: 0.46, cooldownMs: 80, pitchVariation: 0.015 },
  UI_CONFIRM: { paths: [sfx("ui", "confirm.ogg")], group: "UI", volume: 0.58, cooldownMs: 180 },
  UI_CANCEL: { paths: [sfx("ui", "cancel.ogg")], group: "UI", volume: 0.52, cooldownMs: 180 },
  UI_ERROR: { paths: [sfx("ui", "error.ogg")], group: "UI", volume: 0.58, cooldownMs: 500 },
  VICTORY: { paths: [sfx("victory", "victory.ogg")], group: "SFX", volume: 0.95, cooldownMs: 5_000, duckMusic: true },
  DEFEAT: { paths: [sfx("victory", "defeat.ogg")], group: "SFX", volume: 0.85, cooldownMs: 5_000, duckMusic: true }
};

