# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Usogakie/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Usogakie/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar: 198 pre-token protocols ranked by implied value, priced like the live-token protocols in their own category, each with a concrete farm plan. The board covers the whole DefiLlama watchlist plus every other rankable pre-token protocol, and the dashboard is sortable, filterable, and shows a detail view for every protocol.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, scores every rankable pre-token protocol with model radar-2 — a category-comparables multiple (median market-cap/TVL of live-token peers in the same category), seven-day growth, age with no token, and chain breadth — writes `board.json`, `data.js` and `dossier.json` to the output directory, and copies `dashboard/` and `screenshots/` there. Open `out/dashboard/index.html` in a browser; it renders with no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mdyqecay&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
