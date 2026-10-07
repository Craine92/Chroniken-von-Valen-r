import { useState } from "react";
import { RELIC_DEFINITIONS, type RelicId } from "@valenor/shared";
import { RELIC_ASSETS } from "../game/assets/asset-manifest";

export function RelicIcon({ id }: { id: RelicId }) {
  const [missing, setMissing] = useState(false);
  const relic = RELIC_DEFINITIONS[id];
  return <span className="controller-relic-icon" role="img" aria-label={relic.name}>
    {missing ? <span aria-hidden="true">{relic.symbol}</span> :
      <img src={RELIC_ASSETS[id].path} alt="" onError={() => setMissing(true)} />}
  </span>;
}
