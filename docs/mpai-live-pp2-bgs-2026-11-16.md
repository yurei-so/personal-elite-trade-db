# mpai PP2.0/BGS rollout receipt — 2026-11-16

## Release and recovery

- App `dev` commits: `1819271` (PP2.0/BGS observation history) and `783be08`
  (remove database initialization from npm postinstall).
- EDDB adapter `dev` commit: `fb13a04` (read-only PP2.0/BGS/market history).
- Active app release: `releases/1819271`; the prior `58473c3` release remains
  preserved for reference. Only `elite-db-app.service` was stopped and started;
  PostgreSQL remained running.
- A fresh custom-format backup was taken before schema or data changes at
  `~/.local/share/personal-elite-trade-db/backups/personal_elite_trade_db-pre-pp2-bgs-20261116.dump`.
  `pg_restore -l` succeeded. SHA-256:
  `ae299614ecf93e9f0065d591c18652a1bec93d01e3e7c72878960d1feaf6b160`.
- `2026-11-16-eddn-price-semantics-v1` was recorded at `2026-11-16 14:37:14
  CST`. The pre-stop projection contained 9,440,025 EDDN rows; the migration
  ran with the writer stopped. The new EDDN mapper was checked against 15,080 latest market-history
  pairs; all 15,080 matched and there were zero price-direction mismatches.

## Snapshot and live observations

- The provided PowerPlay snapshot re-imported 100,545 current system/power
  rows. The history table has 100,545 baseline rows; source snapshot values
  have not yielded historical transitions yet. Two rows remain unmatched to
  imported systems.
- The provided station snapshot re-imported 749,657 station records. It
  recorded 702,088 controlling-faction observations across 702,085 distinct
  stations; 36,165 rows had no matching system, 73 were duplicate station
  identities, and one was malformed. No identity was guessed.
- At the captured live check, `bgs_system_observations` contained 140 EDDN
  journal observations and `bgs_faction_observations` contained 744 faction
  records. `market_snapshots` contained 154 events and `market_observations`
  contained 24,309 commodity observations. These are early collection counts,
  not a claim of broad coverage or a predictive result.

## Runtime and access

- PostgreSQL 17.10 schema doctor passed with all expected columns, constraints,
  foreign keys, and indexes.
- `elite-db-app.service` and `tunnel-client@roost-eddb.service` were active with
  successful exit status and zero unexpected restarts at verification.
- `eddb_readonly` received SELECT only on the seven new PP2.0/BGS/history tables.
  A `SET ROLE eddb_readonly` read confirmed those relations are queryable.
- Yurei Devkit verification passed: runtime unit and Tunnel Kit doctor (11/11).
  Its output notes the user manager is degraded, but the project-specific checks
  pass.
- The desktop EDDB connector returned `SERVICE_BINDING_INVALID` from
  `eddb_connect`, so access through that connector is not yet verified. This is
  separate from the healthy mpai service and database-role check.

## Limits

No test suite was run. Both repositories built successfully and passed
`git diff --check`. The EDDN journal history begins with this deployment; there
is no backfilled EDDN archive. The current PowerPlay snapshot is a baseline, not
a historical PP2.0 transition series. The PP2.0 and BGS observations should
support frozen, prospective rankings and staleness comparisons before any
causal or forecast claim is made.
