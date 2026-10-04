// Compatibility facade for older imports. New code uses semantic audio events.
import { audioManager } from "../audio/AudioManager";
import type { AudioEvent } from "../audio/audio-config";

export type GameSoundCue = "dice" | "move" | "purchase" | "build" | "event" | "runegate";

const LEGACY_CUES: Record<GameSoundCue, AudioEvent> = {
  dice: "DICE_ROLL",
  move: "TOKEN_MOVE",
  purchase: "PROPERTY_BUY",
  build: "PROPERTY_UPGRADE",
  event: "CARD_REVEAL",
  runegate: "START_PASS"
};

export function armGameAudio(): void {
  audioManager.arm();
}

export function playGameSound(cue: GameSoundCue): void {
  audioManager.play(LEGACY_CUES[cue]);
}
