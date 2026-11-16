# PP2.0 and BGS predictive-data foundation — 2026-11-16

## Current evidence

The mpai database contains 100,545 EDSM PowerPlay system/power rows across 12 powers. The deployed import reports four source `powerState` values: Unoccupied (55,660), Exploited (34,510), Fortified (7,087), and Stronghold (3,288). These are retained as source values; this project does not infer merit scores, territorial thresholds, or market effects from them.

The EDSM row `date` ranges from 2026-10-15 to 2026-11-15 in this import. It is kept as source-update time, not treated as the time this database captured the file. New imports record a separate local observation time and append a history row only when an existing system/power record changes. Current rows also track when a record was last encountered in an imported file. That timestamp means local import observation, not a game-state transition.

The PowerPlay dump also supplies a separate `state` value. In 26,395 of 26,396 systems with multiple PowerPlay rows, that value is the same across every power row. A live EDSM factions response for Sekhenses identifies `War` on its controlling faction and another local faction, while the PowerPlay dump repeats `War` across several powers. We therefore retain this value as a system-state observation and do not interpret it as a PowerPlay territorial state or as a state belonging to every listed power. EDSM's factions endpoint exposes per-minor-faction state, active/pending/recovering states, influence, and optional histories; that is a distinct data model.

The market projection contains 9,405,249 station/commodity rows across 44,870 stations with market data. Of those stations, 5,504 had a market observation in the previous 24 hours. In the PowerPlay systems with market stations, only 11,181 stations had a market observation in the previous seven days. This establishes a substantial freshness gap, not a relationship between PowerPlay and commodity outcomes.

## Data model and evidence rules

- `powerplay_systems` remains the latest-state query surface. `powerplay_state_history` records EDSM imports when a system/power tuple changes. Missing rows are never deleted or silently treated as confirmed territory loss; `last_seen_at` and source-update time expose staleness separately.
- `bgs_system_observations` and `bgs_faction_observations` retain normalized faction snapshots from EDDN Journal `Location`, `FSDJump`, and `CarrierJump` events. They keep source event time, receive time, schema reference, and a content fingerprint. Uploader identity and unrelated journal fields are discarded. Coverage begins when the new listener is deployed; the public EDDN relay does not provide an archive.
- `station_faction_observations` retains EDSM station controlling-faction observations with source information time and local capture time. The station projection keeps its latest owner and owner-information time. This supports time-aware joins without pretending current ownership proves historical ownership.
- `market_snapshots` and `market_observations` retain each normalized EDDN market event separately from the latest-state projection. Event-time and receive-time are both retained; redelivery of the same normalized message is deduplicated, while a later report of identical values remains a new observation.
- Commander-facing price semantics are explicit: `buy` is what the commander pays; `sell` is what the commander receives; profit is `sell - buy`. EDDN `buyPrice` maps to the station's offer price (`station_sell_price`), and EDDN `sellPrice` maps to what the station pays (`station_buy_price`). A versioned one-time migration swaps the already-stored projection values after a database backup. New history columns use the unambiguous names `commander_buy_price` and `commander_sell_price`.

## Predictive-model starting point

The first useful output should be an investigation ranking, not a precise stock or price forecast. Keep three visible components:

1. **Opportunity evidence:** observed faction state and whether the station's controlling faction matches that system/faction observation.
2. **Market staleness:** age of the latest market observation relative to the BGS observation.
3. **Evidence quality:** source, event and capture times, owner-observation age, and whether a prior observation supports an actual state transition.

A first-seen Boom is only a newly observed Boom. A transition can be reported only after a prior non-Boom observation; its time is bounded by the observations, not assumed to be the event timestamp. Missing EDDN reports mean unknown, not “no market change.” Validate frozen rankings against later observed markets, report observation coverage, and compare against a staleness-only baseline. Do not infer a PowerPlay-to-market causal effect without prospective evidence.

## Live connector surface

The EDDB read-only adapter now allows SELECT access to the latest PowerPlay projection, PowerPlay history, BGS system/faction observations, station-faction observations, and market history, in addition to its original four tables. The dedicated `eddb_readonly` login and bounded query policy remain in force. No write or administration permissions are added.

## Sources

- [EDSM nightly dumps](https://www.edsm.net/en/nightly-dumps) publish separate populated-system, station, and PowerPlay datasets.
- [EDSM System API](https://www.edsm.net/en_GB/api-system-v1) documents the per-system factions endpoint and its optional faction-history response.
- [EDDN live Journal schema](https://eddn.edcd.io/schemas/journal/1) includes system faction observations in Location, FSDJump, and CarrierJump messages.
- [EDDN live Commodity schema](https://eddn.edcd.io/schemas/commodity/3) defines the incoming market event fields used for commander-facing price mapping.
