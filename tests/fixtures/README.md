# Fixtures

`settlements.json` holds real `system.settlement_completed` events from
`GET https://api.squeekchain.com/v1/events?category=protocol`, captured on 2026-11-04.
It keeps every multi-round settlement plus the single rounds around them.

History at capture: 1,259 rounds, 1,210 settlements, 7 of them multi-round, 2 of those with work:

| Rounds | Rounds in batch | Active rounds | Work |
|---|---|---|---|
| 45-50 | 6 | 6 | 3,229 |
| 191-206 | 16 | 7 | 2,932 |

## API assumptions

- `workAdded` is the total for the whole settlement, and the public API has no per-round work for a batch.
- A batch with `workAdded` of 0 means every round in it was a nap.
- `/v1/core` reports `maxRoundsPerBatch` of 16, but this history also holds a 24-round settlement, so the code does not rely on that limit.
- Events are served with `confirmationStatus: "safe"`, so the first record of a round stands. A later record that disagrees is counted as a conflict.
