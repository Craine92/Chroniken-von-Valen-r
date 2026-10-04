export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark ${compact ? "brand-mark--compact" : ""}`} aria-label="Chroniken von Valenør">
      <span className="brand-mark__flourish" aria-hidden="true">✦</span>
      <span className="brand-mark__main">CHRONIKEN</span>
      {!compact && <span className="brand-mark__of">VON</span>}
      <span className="brand-mark__name">VALENØR</span>
    </div>
  );
}
