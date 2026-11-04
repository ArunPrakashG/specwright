# Specwright

Turn a client brief into a store they own, on any platform, verified before it ships.

Specwright keeps one platform-neutral **Site Spec** per store: design tokens, pages made of sections, the catalogue, markets, policies and integration goals. Platform adapters turn the spec into a real store. WooCommerce is first; Shopify is next. Every build runs the same storefront checks before anyone sees it, and clients review the result on a white-label page with comments pinned to spec ids.

## Quick start

Needs Node 22 and pnpm 10.

```bash
pnpm install
pnpm specwright init my-store
pnpm specwright build my-store
```

`init` copies the Hale & Field sample store. `build` writes a WooCommerce block theme and catalogue, boots it in WordPress Playground, runs the checks and fixes what the spec can fix. No PHP, MySQL or Docker needed.

## CLI

| Command | What it does |
|---|---|
| `init [dir]` | Start from the sample (`--example`) or draft from a brief (`--brief brief.md`) |
| `draft <brief.md>` | Draft a spec and its illustrations from a brief |
| `validate [dir]` | Check `spec.json` against the schema and cross-references |
| `plan [dir]` | Show how the target platform meets each part of the spec |
| `render [dir]` | Write the reference render of a page (`--page`, `--market`) |
| `build [dir]` | Emit, preview and check a store; auto-fix up to three times (`--no-fix`, `--json`) |
| `preview [dir]` | Build, then keep the preview store running |
| `schema` | Print the Site Spec JSON Schema |
| `worker` | Run dashboard builds from the queue |

`draft` and comment triage call Claude with your own `ANTHROPIC_API_KEY`. Requests use server-side fallbacks, so a request the primary model declines is retried on a fallback model in the same call. Without a key, triage falls back to keyword rules and everything else still works.

## Dashboard and review portal

```bash
docker compose up -d db
pnpm dev        # dashboard on http://localhost:3100
pnpm worker     # runs queued builds
```

Copy `.env.example` to `.env` first. Projects, builds and review comments live in Postgres; spec files and build output live under `SPECWRIGHT_DATA_DIR`.

## Self-host

```bash
echo "SPECWRIGHT_ADMIN_TOKEN=$(openssl rand -hex 24)" >> .env
docker compose up -d
```

The token signs in the agency side; client review links stay public. Starts Postgres, the dashboard on port 3100 and a build worker. Data persists in the `db` and `data` volumes.

## Layout

| Package | Role |
|---|---|
| `packages/spec` | Site Spec schema, validation, contrast helpers |
| `packages/sections` | Section library and reference render (MIT) |
| `packages/core` | `StoreAdapter` interface and the build pipeline |
| `packages/adapter-woocommerce` | Block theme, catalogue and Playground preview |
| `packages/checks` | Journey, accessibility, performance and visual checks |
| `packages/ai` | Brief drafting and comment triage |
| `packages/db` | Postgres schema, queue and data access |
| `packages/cli` | The `specwright` command |
| `apps/web` | Dashboard and client review portal |

A new platform is one package that implements `StoreAdapter`; the checks and the review portal work unchanged.

## License

The engine is AGPL-3.0. The section library in `packages/sections` is MIT so emitted themes carry no copyleft obligations.
