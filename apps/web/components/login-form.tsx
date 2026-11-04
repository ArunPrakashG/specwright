"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { Issues } from "./new-project";

export function LoginForm({ next, autoFocus = true }: { next: string; autoFocus?: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="next" value={next} />
      <div className="sw-field">
        <label htmlFor="token">Admin token</label>
        <input id="token" name="token" type="password" className="sw-input" required autoComplete="current-password" autoFocus={autoFocus} aria-describedby="token-hint" />
        <p id="token-hint" className="sw-hint">The value of SPECWRIGHT_ADMIN_TOKEN on this server.</p>
      </div>
      <Issues state={state} />
      <button className="sw-btn sw-btn--primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
