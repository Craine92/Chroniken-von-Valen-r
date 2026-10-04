import Phaser from "phaser";
import { validateBoardTiles, type GameState } from "@valenor/shared";
import { ValenorBoardScene } from "./scenes/ValenorBoardScene";
import { ValenorPreloadScene, type PreloadCallbacks } from "./scenes/ValenorPreloadScene";
import { DEFAULT_BOARD_PRESENTATION_MODE, type BoardPresentationMode } from "./board-presentation";

export function createGame(parent: HTMLElement, gameState: GameState, preloadCallbacks: PreloadCallbacks = {}, presentationMode: BoardPresentationMode = DEFAULT_BOARD_PRESENTATION_MODE) {
  validateBoardTiles();
  const scene = new ValenorBoardScene(gameState, presentationMode);
  const preloadScene = new ValenorPreloadScene(preloadCallbacks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth,
    height: parent.clientHeight,
    backgroundColor: "#05060c",
    transparent: false,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [preloadScene, scene],
    render: { antialias: true }
  });
  return { game, scene };
}
