"use client";
import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        className="sw-btn sw-btn--secondary sw-btn--icon"
        type="button"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: "var(--sw-pass)" }}><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.5" /></svg>
        )}
      </button>
      <span className="sw-sr" role="status">{copied ? "Copied" : ""}</span>
    </>
  );
}

export function CopyField({ text, label }: { text: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <code style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", padding: "9px 12px", borderRadius: "var(--sw-radius-md)", background: "var(--sw-surface-2)", fontFamily: "var(--sw-font-mono)", fontSize: 12 }}>{text}</code>
      <CopyButton text={text} label={label} />
    </div>
  );
}
