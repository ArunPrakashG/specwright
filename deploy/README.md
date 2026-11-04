# Deploying to ovh-arun

Specwright runs at https://specwright.arunprakashg.com as two containers in `~/infra/apps/specwright`:
`specwright-web` (dashboard and review portal) and `specwright-worker` (builds). The main Caddy in
`~/infra/proxy` proxies the domain to the web container. Both containers use the shared Postgres
and share a `data` volume for spec files and build output.

## Every deploy

```bash
deploy/deploy.sh
```

This builds both images here, ships them over SSH, sets `TAG` in the server's `.env` and restarts the stack. The server keeps the three newest images for rollback: set an older `TAG` in `.env`, then run `docker compose up -d`.

## First-time setup (done once)

1. **Database:** create the role and database `specwright` in `shared-postgres`.
2. **Environment:** `~/infra/apps/specwright/.env`, mode 600, contains:
   - `DATABASE_URL=postgres://specwright:<password>@shared-postgres:5432/specwright`
   - `SPECWRIGHT_DATA_DIR=/data`
   - `SPECWRIGHT_ADMIN_TOKEN` (generate with `openssl rand -hex 24`)
   - `ANTHROPIC_API_KEY` (optional; drafting from a brief and comment triage need it)
3. **Caddy:** add a `specwright.arunprakashg.com` block to `~/infra/proxy/Caddyfile` that proxies to `specwright-web:3100`, then reload Caddy.
4. **DNS:** create a proxied `A` record for `specwright` in the `arunprakashg.com` Cloudflare zone, pointing to the server.

## Signing in

The admin token is in the server's `.env`:

```bash
ssh ovh-arun 'grep ^SPECWRIGHT_ADMIN_TOKEN= ~/infra/apps/specwright/.env'
```

Client review links (`/r/...`) are public and need no sign-in.

## Logs

```bash
ssh ovh-arun 'cd ~/infra/apps/specwright && docker compose logs -f --tail 100'
```
