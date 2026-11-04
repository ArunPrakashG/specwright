/**
 * The lock-on overlay injected into every preview. It draws the brackets, the rising
 * spec tag and comment pins on top of the store, and runs pick mode. It talks to the
 * dashboard only through postMessage on the same origin, and carries its own styles so
 * it never depends on the store's CSS.
 */

const css = `
html { padding: 44px 0 24px; background: transparent !important; overflow-x: clip; }
.swo-layer { --a: #1F4FD8; --a-soft: #E8EEFD; --on-a: #FFFFFF; --f: #C2332A; --f-soft: #FCEBEA; --done: #646C7A; --focus: #1F4FD8;
  --sh: 0 8px 24px rgba(14, 17, 22, .12), 0 2px 6px rgba(14, 17, 22, .06);
  position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000; font: 500 12px/1 "Geist", ui-sans-serif, system-ui, sans-serif; }
.swo-layer.swo-dark { --a: #7D97FF; --a-soft: #1A2342; --on-a: #0B0D11; --f: #FF7A6E; --f-soft: #2E1513; --focus: #98ADFF;
  --sh: 0 8px 24px rgba(0, 0, 0, .5), 0 2px 6px rgba(0, 0, 0, .3); }
.swo-layer *, .swo-layer *::before, .swo-layer *::after { box-sizing: border-box; }
.swo-box { position: absolute; pointer-events: none; }
.swo-brackets { position: absolute; inset: -6px; }
.swo-brackets i { position: absolute; width: 12px; height: 12px; border: 0 solid var(--a); }
.swo-brackets i:nth-child(1) { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; }
.swo-brackets i:nth-child(2) { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; }
.swo-brackets i:nth-child(3) { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; }
.swo-brackets i:nth-child(4) { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; }
.swo-fail .swo-brackets i { border-color: var(--f); }
.swo-hover .swo-brackets i { border-style: dashed; }
.swo-tag { position: absolute; left: -6px; top: -34px; display: inline-block; height: 22px; padding: 0 6px; border-radius: 4px; background: var(--a-soft); color: var(--a);
  font: 500 12px/22px "Geist Mono", ui-monospace, SFMono-Regular, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.swo-fail .swo-tag { background: var(--f-soft); color: var(--f); }
.swo-lock { animation: swo-lock 320ms cubic-bezier(.34, 1.4, .64, 1) both; }
.swo-rise { animation: swo-rise 200ms cubic-bezier(.2, 0, 0, 1) 40ms both; }
@keyframes swo-lock { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: scale(1); } }
@keyframes swo-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.swo-pin { position: absolute; width: 28px; height: 28px; margin: 0; padding: 0; border-radius: 50% 50% 50% 4px; border: 2px solid #FFFFFF; background: var(--a); color: var(--on-a);
  font: 600 12px/24px "Geist", ui-sans-serif, system-ui, sans-serif; text-align: center; box-shadow: var(--sh); cursor: pointer; pointer-events: auto;
  transition: transform 200ms cubic-bezier(.34, 1.4, .64, 1); }
.swo-pin:hover { transform: scale(1.08); }
.swo-pin.is-active { transform: scale(1.2); }
.swo-pin.is-done { background: #646C7A; color: #FFFFFF; }
.swo-pin:focus-visible, .swo-pickable:focus-visible { outline: 2px solid var(--focus, #1F4FD8); outline-offset: 2px; }
html.swo-picking, html.swo-picking * { cursor: crosshair !important; }
@media (prefers-reduced-motion: reduce) { .swo-lock, .swo-rise { animation: none; } .swo-pin { transition: none; } }
`;

function overlay() {
  const ORIGIN = location.origin;
  const layer = document.createElement("div");
  layer.className = "swo-layer";
  layer.setAttribute("data-specwright-overlay", "");
  document.body.appendChild(layer);

  type Pin = { n: number; id: string; done: boolean; active: boolean };
  let state = { select: "", tone: "accent", pins: [] as Pin[], pick: false, clickSelects: false, dark: false };
  let hover = "";
  const madeFocusable: Element[] = [];

  const post = (msg: Record<string, unknown>) => parent.postMessage({ source: "specwright-preview", ...msg }, ORIGIN);
  const find = (id: string) => (id ? document.querySelector(`[data-spec-id="${CSS.escape(id)}"]`) : null);
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, left: r.left + scrollX, width: r.width, height: r.height };
  };
  const ownerId = (node: EventTarget | null) => (node instanceof Element ? node.closest("[data-spec-id]")?.getAttribute("data-spec-id") ?? "" : "");

  function lockBox(id: string, cls: string) {
    const el = find(id);
    if (!el) return null;
    const wrap = document.createElement("div");
    wrap.className = `swo-box ${cls}`;
    wrap.dataset.for = id;
    const brackets = document.createElement("span");
    brackets.className = "swo-brackets swo-lock";
    brackets.setAttribute("aria-hidden", "true");
    brackets.innerHTML = "<i></i><i></i><i></i><i></i>";
    const tag = document.createElement("span");
    tag.className = "swo-tag swo-rise";
    tag.textContent = id;
    wrap.append(brackets, tag);
    return wrap;
  }

  function place() {
    const docWidth = document.documentElement.clientWidth;
    for (const node of Array.from(layer.children) as HTMLElement[]) {
      const el = find(node.dataset.for ?? "");
      if (!el) {
        node.hidden = true;
        continue;
      }
      node.hidden = false;
      const b = box(el);
      if (node.classList.contains("swo-pin")) {
        const inside = b.width >= 200 && b.height >= 120;
        const top = inside ? b.top + 12 : b.top - 14;
        const left = inside ? b.left + b.width - 40 : b.left + b.width - 14;
        node.style.top = `${Math.max(2, top)}px`;
        node.style.left = `${Math.min(Math.max(2, left), docWidth - 32)}px`;
      } else {
        Object.assign(node.style, { top: `${b.top}px`, left: `${b.left}px`, width: `${b.width}px`, height: `${b.height}px` });
        const tag = node.querySelector<HTMLElement>(".swo-tag");
        if (tag) {
          tag.style.maxWidth = `${Math.max(80, docWidth - b.left - 2)}px`;
          placeTag(tag, el, b, docWidth);
        }
      }
    }
  }

  // Text and media in a band of the page, in document coordinates, that the tag should not cover.
  function blockers(el: Element, top: number, bottom: number) {
    const out: { top: number; bottom: number; left: number; right: number }[] = [];
    const push = (r: DOMRect) => {
      const t = r.top + scrollY;
      if (r.width && r.height && t < bottom && t + r.height > top) out.push({ top: t, bottom: t + r.height, left: r.left + scrollX, right: r.right + scrollX });
    };
    const range = document.createRange();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim() || layer.contains(n)) continue;
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) push(r);
    }
    for (const m of Array.from(document.querySelectorAll("img, svg, video, input, select, textarea, button"))) {
      if (m !== el && !m.contains(el) && !layer.contains(m)) push(m.getBoundingClientRect());
    }
    return out;
  }

  // Above the brackets reads best. When that would cover text: right-aligned above, then inside a
  // large element's corner, then below.
  function placeTag(tag: HTMLElement, el: Element, b: { top: number; left: number; width: number; height: number }, docWidth: number) {
    const w = tag.offsetWidth;
    const h = tag.offsetHeight || 22;
    const above = -6 - 4 - h;
    const below = b.height + 6 + 4;
    const right = Math.min(b.width + 6 - w, docWidth - b.left - w - 2);
    const roomy = b.height >= h * 3 && b.width >= w + 16;
    const spots = [
      { top: above, left: -6 },
      { top: above, left: right },
      ...(roomy ? [{ top: 8, left: 8 }] : []),
      { top: below, left: -6 },
      { top: below, left: right },
    ];
    const near = blockers(el, b.top + above - 2, b.top + Math.max(below, 8) + h + 2);
    const clear = spots.find((s) => {
      const t = b.top + s.top, l = b.left + s.left;
      return t >= 0 && !near.some((r) => r.top < t + h + 2 && r.bottom > t - 2 && r.left < l + w + 2 && r.right > l - 2);
    });
    const spot = clear ?? (b.top + above >= 0 ? spots[0]! : spots[1]!);
    tag.style.top = `${spot.top}px`;
    tag.style.left = `${spot.left}px`;
  }

  function draw(scroll: boolean) {
    layer.replaceChildren();
    layer.classList.toggle("swo-dark", state.dark);
    const shown = state.pick && hover ? hover : state.select;
    const lock = lockBox(shown, `${state.tone === "fail" ? "swo-fail" : ""} ${state.pick && hover ? "swo-hover" : ""}`);
    if (lock) layer.append(lock);
    for (const p of state.pins) {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = `swo-pin${p.done ? " is-done" : ""}${p.active ? " is-active" : ""}`;
      pin.dataset.for = p.id;
      pin.dataset.n = String(p.n);
      pin.textContent = String(p.n);
      pin.setAttribute("aria-label", `Comment ${p.n}${p.done ? ", resolved" : ""}`);
      pin.setAttribute("aria-pressed", p.active ? "true" : "false");
      layer.append(pin);
    }
    place();
    if (scroll && !state.pick) {
      follow = true;
      reveal(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  }

  // Keep the selection in view while images and fonts settle, until the person scrolls.
  let follow = false;
  function reveal(smooth: boolean) {
    const el = find(state.select);
    if (!el) return;
    const b = box(el);
    const fits = b.height < innerHeight * 0.7;
    const top = Math.max(0, fits ? b.top - (innerHeight - b.height) / 2 : b.top - 56);
    if (Math.abs(scrollY - top) > 2) scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }
  const settle = () => {
    place();
    if (follow && !state.pick) reveal(false);
  };
  for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) addEventListener(type, () => (follow = false), { passive: true, capture: true });

  function setPick(on: boolean) {
    document.documentElement.classList.toggle("swo-picking", on);
    if (on) {
      for (const el of Array.from(document.querySelectorAll("[data-spec-id]"))) {
        if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea, summary")) {
          el.setAttribute("tabindex", "0");
          el.classList.add("swo-pickable");
          madeFocusable.push(el);
        }
      }
    } else {
      for (const el of madeFocusable.splice(0)) {
        el.removeAttribute("tabindex");
        el.classList.remove("swo-pickable");
      }
      hover = "";
    }
  }

  const isPin = (v: unknown): v is Pin => {
    const p = v as Pin;
    return !!p && typeof p.n === "number" && typeof p.id === "string" && typeof p.done === "boolean" && typeof p.active === "boolean";
  };

  addEventListener("message", (e) => {
    if (e.origin !== ORIGIN || e.source !== parent) return;
    const d = e.data;
    if (!d || d.source !== "specwright" || d.type !== "state") return;
    if (typeof d.select !== "string" || !Array.isArray(d.pins) || !d.pins.every(isPin)) return;
    const changed = d.select !== state.select;
    const pickChanged = !!d.pick !== state.pick;
    state = { select: d.select, tone: d.tone === "fail" ? "fail" : "accent", pins: d.pins, pick: !!d.pick, clickSelects: !!d.clickSelects, dark: !!d.dark };
    if (pickChanged) setPick(state.pick);
    draw(changed);
  });

  const pick = (target: EventTarget | null) => {
    const id = ownerId(target);
    if (id) post({ type: "pick", id });
  };

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const pin = target?.closest?.(".swo-pin") as HTMLElement | null;
      if (pin) {
        e.preventDefault();
        post({ type: "pin", n: Number(pin.dataset.n) });
        return;
      }
      if (target?.closest?.("summary") && !state.pick && !state.clickSelects) return;
      if (state.pick) {
        e.preventDefault();
        e.stopPropagation();
        pick(target);
        return;
      }
      if (state.clickSelects) {
        e.preventDefault();
        const id = ownerId(target);
        if (id) post({ type: "select", id });
        return;
      }
      const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a) {
        e.preventDefault();
        const url = new URL(a.getAttribute("href") ?? "", location.href);
        if (url.origin === ORIGIN) post({ type: "navigate", path: url.pathname });
      }
    },
    true,
  );
  document.addEventListener("submit", (e) => e.preventDefault(), true);
  document.addEventListener("mouseover", (e) => {
    if (!state.pick) return;
    const id = ownerId(e.target);
    if (id && id !== hover) {
      hover = id;
      draw(false);
    }
  });
  document.addEventListener("focusin", (e) => {
    if (!state.pick || (e.target as Element)?.closest?.(".swo-layer")) return;
    const id = ownerId(e.target);
    if (id && id !== hover) {
      hover = id;
      draw(false);
    }
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (!state.pick) return;
      if (e.key === "Escape") {
        e.preventDefault();
        post({ type: "cancel" });
      } else if ((e.key === "Enter" || e.key === " ") && !(e.target as Element)?.closest?.(".swo-layer")) {
        e.preventDefault();
        pick(e.target);
      }
    },
    true,
  );

  new ResizeObserver(settle).observe(document.body);
  addEventListener("resize", settle);
  document.fonts?.ready.then(settle);
  addEventListener("load", settle);
  post({ type: "ready" });
}

const GEIST = "https://fonts.googleapis.com/css2?family=Geist:wght@500;600&family=Geist+Mono:wght@500&display=swap";

export const overlayHead = `<meta name="robots" content="noindex">\n<link rel="stylesheet" href="${GEIST}">\n<style data-specwright-overlay>${css}</style>`;

export function withOverlay(html: string) {
  const script = `<script data-specwright-overlay>(${overlay.toString()})();</script>`;
  return html.replace("</body>", `${script}\n</body>`);
}
