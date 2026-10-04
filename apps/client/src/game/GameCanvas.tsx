import { useEffect, useRef, useState } from "react";
import type { GameState, PropertyGroupId } from "@valenor/shared";
import { createGame } from "./createGame";
import type { ValenorBoardScene } from "./scenes/ValenorBoardScene";
import { GameSceneBridge } from "./GameSceneBridge";
import { DEFAULT_BOARD_PRESENTATION_MODE, type BoardPresentationMode } from "./board-presentation";

export function GameCanvas({ gameState, focusedPropertyGroupId, presentationMode = DEFAULT_BOARD_PRESENTATION_MODE }: { gameState: GameState; focusedPropertyGroupId?: PropertyGroupId | undefined; presentationMode?: BoardPresentationMode | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ValenorBoardScene | null>(null);
  const initialStateRef = useRef(gameState);
  const bridgeRef = useRef<GameSceneBridge | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  if (!bridgeRef.current) bridgeRef.current = new GameSceneBridge(gameState);

  useEffect(() => {
    if (!containerRef.current) return;
    let active = true;
    const { game, scene } = createGame(containerRef.current, initialStateRef.current, {
      onProgress: (progress) => { if (active) setLoadProgress(progress); },
      onComplete: () => { if (active) setLoading(false); }
    }, presentationMode);
    sceneRef.current = scene;
    bridgeRef.current!.attach(scene);
    return () => {
      active = false;
      bridgeRef.current?.detach(scene);
      sceneRef.current = null;
      game.destroy(true);
    };
  }, [presentationMode]);

  useEffect(() => {
    bridgeRef.current!.update(gameState);
  }, [gameState]);

  useEffect(() => {
    sceneRef.current?.focusPropertyGroup(focusedPropertyGroupId);
  }, [focusedPropertyGroupId]);

  return (
    <div className="game-canvas" data-testid="valenor-game-container" aria-label="Spielbrett von Valenør">
      <div ref={containerRef} className="game-canvas__mount" />
      {loading && <div className="asset-loading" role="status"><span>Valenør erwacht …</span><progress value={loadProgress} max={1} aria-label="Grafikassets werden geladen" /></div>}
    </div>
  );
}
