export function Mark({ size = 22, stroke = 2, bare = false, style }: { size?: number; stroke?: number; bare?: boolean; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" stroke="currentColor" strokeWidth={stroke} />
      {!bare && <rect x="9" y="9" width="6" height="6" style={{ fill: "var(--sw-accent)" }} />}
    </svg>
  );
}
