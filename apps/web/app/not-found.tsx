export default function NotFound() {
  return (
    <main id="main" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 600 }}>Nothing here</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--sw-text-2)" }}>This link may be mistyped, or the page was removed.</p>
      </div>
    </main>
  );
}
