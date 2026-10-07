import { useState } from "react";
import type { PlayerCharacterId } from "@valenor/shared";
import { getCharacterAsset } from "../game/assets/asset-manifest";

export function PlayerPortrait({ characterId }: { characterId: PlayerCharacterId }) {
  const [failed, setFailed] = useState<string>();
  const asset = getCharacterAsset(characterId);
  return <span className="hud-player__portrait" aria-hidden="true">
    {failed !== asset.key ? <img src={asset.path} alt="" onError={() => setFailed(asset.key)} /> : "✦"}
  </span>;
}
