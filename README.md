# Squeek Garden

A garden that grows on Squeektoshi's real wheel rounds.

You have six plots. Plant a seed, and from the next 10-minute SqueekCore round onward it reacts to how much work the hamster actually did in each round:

| Seed | Grows on | Ripe when | Fails when | Points |
|---|---|---|---|---|
| Moonmoss | nap rounds (0 work) | 4 naps | 2 zoomies rounds in a row | 30 |
| Trotbean | jog rounds (1–499 work) | 3 jogs | 3 naps in a row | 35 |
| Zoomflower | zoomies rounds (500+ work) | first zoomies round | no zoomies within 9 rounds | 70 |
| Mile Oak | every unit of work | 3,000 total work | never | 100 |
| Comet Pepper (level 2) | a nap round followed by zoomies | that exact sequence | 12 rounds pass | 95 |
| Dreamcap (level 3) | naps in a row | 3 consecutive naps | 15 rounds pass | 85 |
| Twinvine (level 4) | back-to-back jogs | two jogs within 100 work of each other | 12 rounds pass | 90 |
| Golden Wheelbloom (level 5) | every mood | 2 naps, 2 jogs and 2 zoomies | never | 160 |

Ripe plants must be picked within 12 rounds (2 hours) or they rot. A plant picked with two or more other species next to it scores +20%, so the layout of your bed matters. Scores run in weekly seasons that reset Monday 00:00 UTC.

Around the plants:

- **Pips economy.** Seeds cost pips; harvests pay pips equal to their points. Spend them on rarer seeds, glass cloches and up to three extra plots (6 → 9).
- **Levels.** Every harvested point is XP. Levels unlock the pattern seeds above.
- **Tools.** The watering can gives one step of help to a growing plant and refills after 6 rounds. A glass cloche saves a plant from the next thing that would wilt it.
- **Daily quest** for bonus pips, a **herbarium** of every species you have picked, and eight **achievements**.
- **Live scene.** The wheel at the top spins at Squeektoshi's real RPM; the sky turns to night while he naps, and your own plants grow along the skyline.

The game is about reading the hamster: plant Moonmoss when he looks sleepy, Zoomflower when he is on a tear. Naps are worth as much as runs; nothing in the game rewards making him run.

## How it uses Squeekchain

All game outcomes come from Squeekchain's public API, which mirrors SqueekCore on Sepolia:

- `GET /v1/core`: `configuration.genesisTimestamp` and `roundDuration` (600 s) to number the rounds.
- `GET /v1/events?category=protocol`: `system.settlement_completed` events. Each one closes a round with its `workAdded` (0 for a nap). The garden replays every settled round since your last visit, so plants keep growing while the tab is closed.
- `GET /v1/status`: live wheel telemetry (`coreStatus`, `rpmMilli`, `cumulativeWorkUnits`) for the current-round readout.

The API allows cross-origin requests, so the game itself runs entirely in the browser.

A settlement that closes one round gives that round's exact work. A settlement that closes several rounds only reports their total, so the game never guesses how it was divided: a total of 0 counts as naps, and otherwise growing plants wait out those rounds. Ripe plants still age. If history is missing or the API is down, the garden stops at the last round it has and catches up later, without assuming any work.

If Squeekchain redeploys and counts rounds from the start again, a garden keeps its plants and progress, moves its round marks to the new count and waits for new rounds. Scores lock every Monday at 00:00 UTC, and the play screen counts down to it. The garden itself never ends.

**Demo mode** simulates 8-second rounds so you can see a whole growth cycle in a minute.

## Run it

The game alone runs from any static file server, without the wallet and leaderboard:

```bash
python -m http.server 8765 --directory public
```

Then open http://localhost:8765.

## Files

- `index.html`: page structure
- `garden.css`: styles, light and dark
- `public/engine.js`: plant rules, seasons and player actions (pure, shared by the page, the server and the tests)
- `public/settlement.js`: validates settlement events, builds the round ledger and pages through history
- `public/save.js`: save validation, v2 to v3 migration, backups, export and import
- `public/wallet.js`: wallet sign-in in the browser
- `public/garden.js`: live and demo sources, game actions and rendering
- `public/guide/`: how to play
- `public/leaderboard/`: Live and Practice boards
- `server/`: the Cloudflare Worker with sign-in, gardens and scores
- `migrations/`: the database schema

## Saves

Without a wallet, your garden lives in this browser. Schema v3 is stored beside the old v2 save, which is copied once to a backup and never changed. Export or import a save from "Your record" on the play screen, for example to move to a new address.

## Wallet and leaderboard

Connecting a wallet means signing a text message (Sign-In with Ethereum), which costs no gas. You then play a separate garden kept by the server, in Cloudflare D1. The browser only sends what you did. The server checks each action against the same rules in `public/engine.js`, plays real settled rounds itself and works out the score, so editing the browser or a request cannot raise it. Browser saves are never imported into it.

The Live board only takes those scores. Demo rounds are simulated, so Demo scores go on a separate Practice board that does not count.

## Deploy

```bash
npx wrangler d1 migrations apply squeek-garden --remote
npx wrangler deploy
```

## Tests

```bash
npm test
```

Run `npm install` first. `tests/fixtures/` holds real API events and the assumptions made about them.

## Next

- Seed trading between players.
- A "plant on chain" option that records each sowing as a Sepolia transaction.

squeekchain-project: 965fa463-cd12-4507-a0e8-39352d4ad49f
