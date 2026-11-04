"use client";

import { useEffect, useRef, useState } from "react";

export interface Pin {
  n: number;
  id: string;
  done: boolean;
  active: boolean;
}

export interface PreviewProps {
  src: string;
  title: string;
  mobile?: boolean;
  variant?: "spec" | "review" | "snippet";
  select: string;
  tone?: "accent" | "fail";
  pins?: Pin[];
  pick?: boolean;
  clickSelects?: boolean;
  onSelect?(id: string): void;
  onPin?(n: number): void;
  onPick?(id: string): void;
  onCancel?(): void;
  onNavigate?(path: string): void;
}

type FromPreview =
  | { source: "specwright-preview"; type: "ready" | "cancel" }
  | { source: "specwright-preview"; type: "select" | "pick"; id: string }
  | { source: "specwright-preview"; type: "pin"; n: number }
  | { source: "specwright-preview"; type: "navigate"; path: string };

function parse(data: unknown): FromPreview | null {
  const d = data as Record<string, unknown>;
  if (!d || typeof d !== "object" || d.source !== "specwright-preview") return null;
  switch (d.type) {
    case "ready":
    case "cancel":
      return d as FromPreview;
    case "select":
    case "pick":
      return typeof d.id === "string" && d.id.length < 200 ? (d as FromPreview) : null;
    case "pin":
      return typeof d.n === "number" && Number.isInteger(d.n) ? (d as FromPreview) : null;
    case "navigate":
      return typeof d.path === "string" && d.path.startsWith("/") ? (d as FromPreview) : null;
    default:
      return null;
  }
}

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/** The reference render in an iframe, with lock-on, pins and pick mode driven over postMessage. */
export function PreviewFrame(p: PreviewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(0);
  const dark = useDark();
  const handlers = useRef(p);
  handlers.current = p;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      const m = parse(e.data);
      if (!m) return;
      const h = handlers.current;
      if (m.type === "ready") setReady((n) => n + 1);
      else if (m.type === "select") h.onSelect?.(m.id);
      else if (m.type === "pick") h.onPick?.(m.id);
      else if (m.type === "pin") h.onPin?.(m.n);
      else if (m.type === "cancel") h.onCancel?.();
      else if (m.type === "navigate") h.onNavigate?.(m.path);
    };
    addEventListener("message", onMessage);
    // The preview can finish loading before hydration, so its "ready" message may be gone already.
    try {
      if (frame.current?.contentDocument?.readyState === "complete") setReady((n) => n + 1);
    } catch {}
    return () => removeEventListener("message", onMessage);
  }, []);

  const pinsKey = JSON.stringify(p.pins ?? []);
  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage(
      { source: "specwright", type: "state", select: p.select, tone: p.tone ?? "accent", pins: p.pins ?? [], pick: !!p.pick, clickSelects: !!p.clickSelects, dark },
      location.origin,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.select, p.tone, pinsKey, p.pick, p.clickSelects, dark]);

  const cls = ["sw-frame", p.mobile ? "is-mobile" : "", p.variant === "review" ? "is-review" : "", p.variant === "snippet" ? "is-snippet" : ""].join(" ");
  return (
    <div className={cls}>
      <iframe ref={frame} src={p.src} title={p.title} sandbox="allow-scripts allow-same-origin" onLoad={() => setReady((n) => n + 1)} />
    </div>
  );
}
