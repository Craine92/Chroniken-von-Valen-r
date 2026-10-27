// ATTRIBUTIONS.md wird beim Build in das Bundle übernommen und ist damit auch im gepackten Windows-Build verfügbar,
// obwohl die Datei selbst nicht mit ausgeliefert wird.
import attributions from "../../../../../ATTRIBUTIONS.md?raw";
import { CreditsDialog } from "./CreditsDialog";

export default function CreditsOverlay({ onClose }: { onClose: () => void }) {
  return <CreditsDialog markdown={attributions} onClose={onClose} />;
}
