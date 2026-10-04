export interface GameSoundCue {
  id: "dice-roll";
  startedAt: number;
}

export interface GameSoundService {
  cue(sound: GameSoundCue): void;
}

// Audio assets and playback are intentionally deferred; game logic never depends on sound.
