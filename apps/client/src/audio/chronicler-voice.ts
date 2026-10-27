import { selectAudioVariant } from "./AudioManager";
import { VOICE_LINES, type VoicePriority, type VoiceRequest } from "./voice-lines";

/** Wie lange ein Satz warten darf, bevor er veraltet ist: Wichtiges länger, Alltägliches nur kurz. */
export const VOICE_MAX_WAIT_MS: Readonly<Record<VoicePriority, number>> = { high: 15_000, normal: 6_000 };
/** Mehr wartende Sätze erzählen nur noch Vergangenes. */
export const VOICE_QUEUE_CAPACITY = 3;

interface QueuedVoice extends VoiceRequest {
  requestedAt: number;
}

/**
 * Warteschlange der Sätze: Wichtige Sätze stehen vor allen normalen, sonst gilt die Reihenfolge des Eintreffens.
 * Veraltete Sätze werden beim Abholen verworfen; ist die Schlange voll, fällt der älteste normale Satz heraus.
 */
export class VoiceQueue {
  private items: QueuedVoice[] = [];

  constructor(private readonly maxWait = VOICE_MAX_WAIT_MS, private readonly capacity = VOICE_QUEUE_CAPACITY) {}

  get size(): number {
    return this.items.length;
  }

  enqueue(request: VoiceRequest, now: number): void {
    this.items.push({ ...request, requestedAt: now });
    while (this.items.length > this.capacity) {
      const oldestNormal = this.items.findIndex(item => item.priority === "normal");
      this.items.splice(oldestNormal >= 0 ? oldestNormal : 0, 1);
    }
  }

  next(now: number): VoiceRequest | undefined {
    this.items = this.items.filter(item => now - item.requestedAt <= this.maxWait[item.priority]);
    const index = Math.max(0, this.items.findIndex(item => item.priority === "high"));
    const [item] = this.items.splice(index, 1);
    return item && { key: item.key, priority: item.priority };
  }

  clear(): void {
    this.items = [];
  }
}

/** Spielt einen Satz ab und meldet sich, wenn er zu Ende ist (oder sofort, wenn die Stimme aus ist). */
export interface VoicePlayer {
  playVoice(path: string): Promise<void>;
}

/**
 * Der sprechende Chronist auf dem TV. Es spricht immer nur ein Satz; neue Sätze warten in der Schlange.
 * Varianten eines Satzes wechseln zufällig, aber nie zweimal hintereinander dieselbe.
 */
export class ChroniclerVoice {
  private readonly queue = new VoiceQueue();
  private readonly previousVariant = new Map<string, string>();
  private speaking = false;

  constructor(
    private readonly player: VoicePlayer,
    private readonly clock: () => number = () => performance.now(),
    private readonly random: () => number = Math.random
  ) {}

  get isSpeaking(): boolean {
    return this.speaking;
  }

  say(request: VoiceRequest): void {
    if (!VOICE_LINES[request.key]?.length) return;
    this.queue.enqueue(request, this.clock());
    this.pump();
  }

  /** Neue Partie oder Seitenwechsel: Wartendes verwerfen; ein laufender Satz darf ausklingen. */
  clear(): void {
    this.queue.clear();
  }

  private pump(): void {
    if (this.speaking) return;
    const next = this.queue.next(this.clock());
    if (!next) return;
    const path = selectAudioVariant(VOICE_LINES[next.key]!, this.previousVariant.get(next.key), this.random);
    if (!path) return;
    this.previousVariant.set(next.key, path);
    this.speaking = true;
    void this.player.playVoice(path).catch(() => undefined).then(() => {
      this.speaking = false;
      this.pump();
    });
  }
}
