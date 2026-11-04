# Deploy and demo BACKSTOP

## Deploy to Netlify

You need a Netlify account, a persistent PostgreSQL database (Neon's free tier works), and Node.js 22.22+.

1. **Database.** Create a Postgres database and copy its connection string.
   ```bash
   export DATABASE_URL='postgres://…'
   ```
2. **Auth secret.** Generate once, keep it in a password manager, reuse it on every deploy.
   ```bash
   export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
   ```
3. **Create the site and save both values in Netlify.**
   ```bash
   npx netlify login
   npx netlify sites:create --name backstop-<something-unique>
   npx netlify env:set DATABASE_URL "$DATABASE_URL"
   npx netlify env:set BETTER_AUTH_SECRET "$BETTER_AUTH_SECRET"
   ```
   Using a custom domain? Also set `BETTER_AUTH_URL` to `https://your-domain`.
4. **Migrate, build, deploy.**
   ```bash
   pnpm migrate:production
   NITRO_PRESET=netlify pnpm build
   npx netlify deploy --prod --dir=dist --functions=.netlify/functions-internal
   ```
5. **First visit.** Open the printed URL, create an account, then connect AI in the agent panel (Builder.io or your own key). The local connection does not carry over to production.

To ship an update, repeat step 4.

## Before recording

- On the Overview, use **reset** next to "fictional sample" to return Northstar Studio to its imported state.
- Check the agent panel says it is connected.
- Use a fresh browser profile at a desktop width, with the agent panel closed until step 3.

## The 90-second demo

| # | Screen | Do | Point out |
|---|---|---|---|
| 1 | `/map` | Choose **Primary administrator loses phone**, press **Run simulation**. | Blocked edges turn red. Email, code, cloud and vault access are blocked; the domain registrar survives through the hardware key. |
| 2 | `/map` | Click **Workspace email**, then **Show path on map**. | The causal path lights up; everything else dims. |
| 3 | `/map` | Press **Ask agent to explain**. | The agent answers from the saved run and says these are model results, not live provider state. |
| 4 | Agent | Ask: "Create a high-priority task to add an independent email login route." | The task appears on Remediation at once. The map does not change. |
| 5 | `/map` | On Workspace email, **Add a route**: carries Access, label "Independently configured hardware key", needs Backup hardware key · Access, ALL, verified. Run the scenario again. | Only the phone stays blocked. The recovery-loop warning stays, and is not called a lockout. |
| 6 | `/runbook` | Scroll, then **Print**. | Built only from saved records; every route says "not tested" until a person records a test. |

Optional: in the inspector, **Record a test**, pick Passed and tick the confirmation. Then ask the agent to mark a test passed and show that it cannot.

## Checks

```bash
pnpm typecheck
pnpm test                 # unit tests
pnpm agent-native:doctor  # framework guards
pnpm check:isolation      # needs the local dev database; two synthetic users
```
