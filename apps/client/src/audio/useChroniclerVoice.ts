import { useEffect, useRef } from "react";
import type { GameState } from "@valenor/shared";
import { deriveGameMoments } from "../game/living/moments";
import { audioManager } from "./AudioManager";
import { ChroniclerVoice } from "./chronicler-voice";
import { GAME_START_VOICE, pickVoiceRequest, type VoiceRequest } from "./voice-lines";

const ANNOUNCED_STORAGE_KEY = "valenor:voice-start-announced";

/** Eine Partie gilt als frisch, solange die erste Runde noch nicht über den ersten Zug hinaus ist. */
export function isFreshGame(state: GameState): boolean {
  return state.status === "playing" && state.currentRound <= 1 && state.turnNumber <= 1;
}

/** Schlüssel einer Partie, damit der Spielbeginn auch nach einem Neuladen des TVs nur einmal angesagt wird. */
export const gameKey = (state: GameState) => `${state.roomId}:${state.startedAt}`;

/** Welche Sätze ein neuer Spielstand auslöst: einmal der Spielbeginn, danach höchstens ein Satz pro Stand. */
export function deriveVoiceRequests(previous: GameState | undefined, next: GameState, alreadyAnnounced: (key: string) => boolean): VoiceRequest[] {
  const requests: VoiceRequest[] = [];
  if (isFreshGame(next) && !alreadyAnnounced(gameKey(next))) requests.push(GAME_START_VOICE);
  if (previous && previous !== next) {
    const request = pickVoiceRequest(deriveGameMoments(previous, next), next);
    if (request) requests.push(request);
  }
  return requests;
}

function readAnnounced(): Set<string> {
  try { return new Set(JSON.parse(window.sessionStorage.getItem(ANNOUNCED_STORAGE_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

function rememberAnnounced(announced: Set<string>): void {
  try { window.sessionStorage.setItem(ANNOUNCED_STORAGE_KEY, JSON.stringify([...announced].slice(-10))); } catch { /* Nur Komfort. */ }
}

/** Die Stimme des Chronisten auf dem TV. Die Rolle („board“) und alle Schalter prüft der Audio-Manager. */
export function useChroniclerVoice(gameState: GameState): void {
  const voice = useRef<ChroniclerVoice | undefined>(undefined);
  voice.current ??= new ChroniclerVoice(audioManager);
  const previous = useRef<GameState | undefined>(undefined);
  const announced = useRef<Set<string> | undefined>(undefined);

  useEffect(() => {
    announced.current ??= readAnnounced();
    const seen = announced.current;
    deriveVoiceRequests(previous.current, gameState, key => seen.has(key)).forEach(request => {
      if (request === GAME_START_VOICE) { seen.add(gameKey(gameState)); rememberAnnounced(seen); }
      voice.current!.say(request);
    });
    previous.current = gameState;
  }, [gameState]);

  useEffect(() => () => voice.current?.clear(), []);
}
