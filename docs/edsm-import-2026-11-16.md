# EDSM snapshot import receipt — 2026-11-16

## Source and safeguards

- `stations.json.gz` SHA-256: `63bd8793f6a762915c6c2f36bc68831b83d7f81bc8539f466a93cc6a1f2b0771`
- `powerPlay.json.gz` SHA-256: `75232518230c83d3c161a4939d180e9edf90003c2bf85669353c224e2c26a40f`
- Both source archives passed gzip integrity checks locally and after transfer to mpai.
- A pre-import PostgreSQL custom-format backup was written to
  `~/.local/share/personal-elite-trade-db/backups/personal_elite_trade_db-pre-edsm-20261116.dump`.
  `pg_restore -l` succeeded. SHA-256:
  `e179e873f81ad7142cf58cb9f22ef7bb4639edebbe0e94398c3617f93c72c7ea`.
- Imports are additive/upsert-only. No rows are deleted. Older archive timestamps
  cannot replace newer local records. Station archive commodity quotes are
  ignored; `station_commodities` remains sourced from EDDN.

## Import results

- PowerPlay: **100,545** `(system_id, power)` records imported. **1,755**
  missing systems were added from the archive's supplied coordinates. **2**
  records were skipped because their system name/ID conflicted with the current
  catalog.
- Stations: **746,228** rows applied from **785,896** parsed records. The
  remaining records were **36,165** without a catalog system, **73** duplicate
  station identities, **13,429** older than existing rows, and **1** malformed
  record. No unmatched system or duplicate was guessed or overwritten.
- The first station pass exposed two source `information` timestamps in 2198.
  Their pre-import distance and timestamp values were restored from the
  verified backup, and the archive was replayed using the corrected importer.
  It rejects future dates
  and uses the latest valid information, market, shipyard, or outfitting date.
  Final query: **0** station rows have `updated_at > now()`.

## Live verification

| Table | Before | After |
| --- | ---: | ---: |
| `systems` | 276,767 | 278,522 |
| `stations` | 716,637 | 753,094 |
| `commodities` | 801 | 801 |
| `station_commodities` | 9,373,845 | 9,386,730 |
| `powerplay_systems` | absent | 100,545 |

The `station_commodities` increase came from the still-running EDDN listener;
the snapshot import does not write that table. Its latest `received_at` after
deployment was `2026-11-16 12:26:36 CST`.

Database doctor passed for PostgreSQL 17.10 and the expected schema. The
dashboard returned HTTP 302 to its sign-in flow. Both `elite-db-app.service`
and `elite-db-postgres.service` are active. Only the app unit was restarted;
EDDN writes resumed immediately. Active release: `58473c3`, built from commit
`58473c3985ff68d77cbe0d255f37c1f21d2d4c6f`.

The PowerPlay table is stored in the database but is not yet added to the
read-only EDDB adapter's table allowlist.

## Code and validation

- `9ce07ec` — `feat(import): merge EDSM station and PowerPlay snapshots`
- `58473c3` — `fix(import): reject future EDSM timestamps`
- `npm test` (TypeScript typecheck), `npm run build`, and `git diff --check`
  passed. Local parser dry runs matched the archive schemas before import.
- This receipt records live import results; it does not certify full coverage
  of stations whose systems are absent from the current catalog.
