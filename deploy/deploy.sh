#!/usr/bin/env bash
# Build the images here, ship them to ovh-arun and restart the stack there.
#
#   deploy/deploy.sh            build HEAD's tree and deploy it
#   SKIP_BUILD=1 TAG=... deploy/deploy.sh   ship images already built here
#
# First-time server setup (database, .env, Caddy, DNS) is in deploy/README.md.
set -euo pipefail

HOST=${HOST:-ovh-arun}
DIR=infra/apps/specwright
cd "$(dirname "$0")/.."

if [ -z "${TAG:-}" ]; then
  TAG=$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)
  git diff --quiet HEAD -- apps packages Dockerfile package.json pnpm-lock.yaml || TAG="$TAG-dirty"
fi

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "Building specwright-web:$TAG and specwright-worker:$TAG"
  docker build --target web -t "specwright-web:$TAG" .
  docker build --target worker -t "specwright-worker:$TAG" .
fi

echo "Shipping them to $HOST"
# One archive, so the layers both images share travel once.
docker save "specwright-web:$TAG" "specwright-worker:$TAG" | gzip -1 | ssh "$HOST" 'gunzip | docker load'
scp -q deploy/docker-compose.yml "$HOST:$DIR/docker-compose.yml"

echo "Starting them"
ssh "$HOST" "cd $DIR && \
  (grep -q '^TAG=' .env && sed -i 's/^TAG=.*/TAG=$TAG/' .env || echo 'TAG=$TAG' >> .env) && \
  docker compose up -d && \
  for i in \$(seq 40); do s=\$(docker inspect -f '{{.State.Health.Status}}' specwright-web); [ \"\$s\" = healthy ] && break; sleep 3; done; \
  docker compose ps && \
  for r in specwright-web specwright-worker; do \
    docker images \$r --format '{{.Tag}}' | sort -r | tail -n +4 | sed \"s/^/\$r:/\" | xargs -r docker rmi -f >/dev/null; \
  done"
# (keeps the three newest images of each on the server for a quick rollback: set TAG in .env and `docker compose up -d`)

echo "live: $TAG"
