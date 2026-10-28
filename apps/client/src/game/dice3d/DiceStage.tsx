import { useEffect, useRef } from "react";
import type { GameState } from "@valenor/shared";
import { audioManager } from "../../audio/AudioManager";

type DiceModules = [typeof import("./dice-physics"), typeof import("./dice-renderer")];

/** Startwert eines Wurfs aus dem Spielstand: gleicher Wurf, gleiche Bahn – auch nach einem Neuladen. */
export function getDiceSeed(state: GameState): number {
  const roll = state.lastDiceRoll;
  return (state.turnContext.rollSequence * 7_919 + state.turnNumber * 31 + (roll?.die1 ?? 0) * 7 + (roll?.die2 ?? 0)) >>> 0;
}

export function getDiceRollKey(state: GameState): string | undefined {
  if (!state.lastDiceRoll || !["rolling", "dungeonRolling"].includes(state.turnPhase)) return undefined;
  return `${state.turnNumber}:${state.turnContext.rollSequence}:${state.lastDiceRoll.die1}:${state.lastDiceRoll.die2}`;
}

/**
 * Echte 3D-Würfel über dem Brett. three.js und cannon-es werden erst geladen, wenn diese Ansicht erscheint, und nur
 * auf „high“ und „medium“ ohne reduzierte Bewegung. Ohne WebGL meldet `onAvailability(false)`, und das Brett zeigt
 * die bisherige Würfelanzeige. Die Augenzahl kommt immer aus dem Spielstand des Servers.
 */
export function DiceStage({ gameState, quality, onAvailability }: { gameState: GameState; quality: "high" | "medium"; onAvailability: (available: boolean) => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const renderer = useRef<InstanceType<DiceModules[1]["DiceRenderer"]> | undefined>(undefined);
  const physics = useRef<DiceModules[0] | undefined>(undefined);
  const lastKey = useRef<string | undefined>(getDiceRollKey(gameState));

  useEffect(() => {
    let active = true;
    void Promise.all([import("./dice-physics"), import("./dice-renderer")]).then(([physicsModule, rendererModule]) => {
      if (!active || !mount.current) return;
      try {
        renderer.current = new rendererModule.DiceRenderer(mount.current, quality);
        physics.current = physicsModule;
        onAvailability(true);
      } catch {
        onAvailability(false);
      }
    }).catch(() => { if (active) onAvailability(false); });
    return () => {
      active = false;
      renderer.current?.dispose();
      renderer.current = undefined;
      onAvailability(false);
    };
  }, [quality]);

  useEffect(() => {
    const key = getDiceRollKey(gameState);
    if (!key || key === lastKey.current || !renderer.current || !physics.current || !gameState.lastDiceRoll) return;
    lastKey.current = key;
    const { die1, die2, isDouble } = gameState.lastDiceRoll;
    const plan = physics.current.planThrow(die1, die2, getDiceSeed(gameState));
    mount.current!.dataset.lastRoll = `${die1}-${die2}`;
    renderer.current.play({
      ...plan,
      double: isDouble,
      onImpact: () => audioManager.play("DICE_IMPACT"),
      onSettled: () => { if (mount.current) mount.current.dataset.settled = key; }
    });
  }, [gameState]);

  return <div ref={mount} className="dice-stage" aria-hidden="true" data-testid="dice-stage" />;
}
