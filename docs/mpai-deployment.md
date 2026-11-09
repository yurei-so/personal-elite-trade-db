# mpai development deployment

mpai runs this development service from a release built from `dev`. The app
uses its own PostgreSQL 17 cluster on a local-only Unix socket at
`/run/user/1000/.s.PGSQL.55438`. It does not share the system PostgreSQL
cluster with Context Server. The dashboard listens on `127.0.0.1:8787` and
uses the dashboard password hash in the private runtime `.env` file.

The two user units in `deploy/systemd/` run PostgreSQL and the dashboard plus
EDDN listener. Runtime configuration lives in
`~/.config/personal-elite-trade-db/`; release source and compiled assets live
under `~/.local/share/personal-elite-trade-db/releases/`. Keep the deployed
source commit, build receipt, and active `current` symlink aligned with `dev`.
Do not commit credentials or a database dump.

From the workstation, access the dashboard through an SSH forward:

```bash
ssh -L 8787:127.0.0.1:8787 mpai
```

Then open `http://127.0.0.1:8787/dashboard` and sign in with the existing
dashboard password. The dashboard is not exposed on mpai's network interface.

Before a release switch, preserve the old release and validate the new build
and database connection. Restart only `elite-db-app.service` after switching
`current`. Confirm the dashboard responds locally, EDDN is connected, and
the database rows remain present. The PostgreSQL unit should not be restarted
for an app-only deployment.

The source workstation currently runs PostgreSQL 18 while mpai runs 17. A
schema-only restore was checked before the initial transfer; the PostgreSQL 18
plain dump's `\restrict`, `\unrestrict`, and `SET transaction_timeout` lines
were omitted for PostgreSQL 17 compatibility. The initial data migration and
post-start checks are recorded in [mpai-live-2026-11-09.md](mpai-live-2026-11-09.md).
