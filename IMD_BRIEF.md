# IMD job brief (paste into explorer.imd.fun/launch → Site)

Source: import the public GitHub repository for Squeek Garden (static site: index.html, garden.css, garden.js).

Task:
Ship Squeek Garden, a browser game for Squeekchain where plants grow from Squeektoshi's real 10-minute SqueekCore rounds.

Keep the existing game rules in garden.js (applyRound, harvest bonus, weekly seasons) and the data sources:
- GET https://api.squeekchain.com/v1/core for genesisTimestamp and roundDuration
- GET https://api.squeekchain.com/v1/events?limit=100&category=protocol, using system.settlement_completed events (workAdded per round, 0 = nap)
- GET https://api.squeekchain.com/v1/status for live wheel telemetry

Add:
1. Wallet sign-in with a signed message (EIP-4361 style, no gas).
2. A shared weekly leaderboard keyed by wallet. The server recomputes each player's score from their recorded plant/harvest actions and the public round data, so scores cannot be faked from the browser.
3. Store each player's garden server-side so it follows the wallet across devices.
4. Deploy the site and leaderboard API, and link the official livestream (x.com/squeekchain).

Do not change the plant rules or the visual design beyond what the leaderboard needs. Naps must keep scoring the same as runs.
