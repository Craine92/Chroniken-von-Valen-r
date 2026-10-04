import type { GameState } from "@valenor/shared";

export interface GameStateScene {
  applyGameState(state: GameState): void;
}

export class GameSceneBridge {
  private scene: GameStateScene | null = null;

  constructor(private latestState: GameState) {}

  attach(scene: GameStateScene): void {
    this.scene = scene;
    scene.applyGameState(this.latestState);
  }

  detach(scene: GameStateScene): void {
    if (this.scene === scene) this.scene = null;
  }

  update(state: GameState): void {
    this.latestState = state;
    this.scene?.applyGameState(state);
  }
}
