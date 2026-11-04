#!/usr/bin/env bash
# One-command Netlify deploy for BACKSTOP.
#   pnpm deploy:netlify
# Asks for the Postgres connection string without echoing it, generates an
# auth secret on first run, saves both to the Netlify site, migrates, builds,
# and deploys. Secrets are never written to disk or printed, except the auth
# secret once on first run so you can keep it.
set -euo pipefail

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

say "1/6  Netlify sign-in"
if ! npx --yes netlify-cli status >/dev/null 2>&1; then
  npx --yes netlify-cli login
fi

say "2/6  Site"
if [ ! -f .netlify/state.json ]; then
  read -r -p "Site name (becomes <name>.netlify.app): " SITE_NAME
  npx --yes netlify-cli sites:create --name "$SITE_NAME"
else
  echo "Already linked to a site."
fi

say "3/6  Secrets"
if [ -z "${DATABASE_URL:-}" ]; then
  read -r -s -p "Paste the Neon pooled connection string (hidden): " DATABASE_URL
  echo
fi
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "That does not look like a Postgres connection string." >&2; exit 1 ;;
esac
export DATABASE_URL
npx --yes netlify-cli env:set DATABASE_URL "$DATABASE_URL" >/dev/null
echo "Saved DATABASE_URL to the site."

if npx --yes netlify-cli env:get BETTER_AUTH_SECRET >/dev/null 2>&1 \
  && [ -n "$(npx --yes netlify-cli env:get BETTER_AUTH_SECRET 2>/dev/null)" ]; then
  echo "BETTER_AUTH_SECRET already set on the site; keeping it."
else
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  npx --yes netlify-cli env:set BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET" >/dev/null
  echo "Generated and saved BETTER_AUTH_SECRET. Keep a copy:"
  echo "  $BETTER_AUTH_SECRET"
fi

say "4/6  Database tables"
pnpm migrate:production

say "5/6  Build"
NITRO_PRESET=netlify pnpm build

say "6/6  Deploy"
npx --yes netlify-cli deploy --prod --dir=dist --functions=.netlify/functions-internal

say "Done. Open the URL above, create your account, then connect AI in the agent panel."
