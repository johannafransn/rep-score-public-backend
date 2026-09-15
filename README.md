# rep-score-public-backend

An **open, Sybil-resistant** reputation score ("Open Trust Rank") computed entirely
from the **public Circles trust graph** — no analytics service, no secrets, no
`.env` keys, and (for the runtime) **no npm dependencies**. It exposes the same
HTTP routes the wallet already calls, so it's a drop-in replacement for the closed
`analytics/rep_score` API while you evaluate it.

## The idea (why it can be open and still hard to game)

Reputation = how much trust from **already-trusted humans** flows to you, via a
capped, seeded power iteration over the mutual human-trust graph. A bot farm can
mint 10,000 accounts, but it can't make real, anchor-connected humans trust them —
so Sybil clusters get ≈0 rank no matter how much they trust each other. Crucially,
**knowing the formula doesn't make cheating cheaper** (unlike an economic score you
can wash-trade to a threshold), which is exactly why it's safe to open-source.

Hardening, all public and in `src/trustRank.ts`:
- human↔human **mutual** edges only (Circles registration is already invite-gated)
- each vouch weighted by the **truster's own rank** (recursive) and split by out-degree
- **per-source cap** — no whale can mint reputation for its friends
- damping + seed teleport (**anchors**, or uniform when none set)
- concave final mapping (population percentile) — a few strong vouches ≫ many weak ones

## Run it

Needs Node ≥ 22.6 (runs the TypeScript directly, no build step):

```bash
cd rep-score-public-backend
npm start           # → http://localhost:8787
```

On boot it loads the whole graph from public Envio and computes scores, then
refreshes every 10 min. Measured on the live graph: **11,976 humans / 144,521
mutual edges in ~14 s**. Per-request latency is just a map lookup (instant) — the
14 s is a background batch, not on the request path.

## Point the wallet at it

The client builds every rep-score URL from `config.groupAnalyticsServiceUrl`
(`wallet/src/lib/constants/circlesV2Config.ts`). For a local test, change it to:

```ts
groupAnalyticsServiceUrl: 'http://localhost:8787',
```

That's the only change — these routes match what the client expects:

| Route | Returns |
|---|---|
| `GET /health` | `{ status, humans, edges, computed_at }` |
| `GET /groups/:group/scores` | `{ items: [{ address, reputation_score_live }] }` |
| `GET /groups/:group/avatars/:address` | `RepScoreResponse`-shaped (score + `components.endorsers`) |
| `GET /groups/:group/avatars/:address/history` | `{ items: [] }` (no history yet) |

The `:group` segment is accepted but ignored — Trust Rank is **universal** (one
score per avatar, not per group). CORS is open (`*`) since it's read-only public data.

## Config (`src/config.ts`, all optional)

`PORT`, `REFRESH_MS`, `DAMPING`, `ITERATIONS`, `PER_SOURCE_CAP`, and `ANCHORS`
(comma-separated avatar addresses). Defaults are baked in.

## Honest limitations (read before shipping)

- **Scores are a percentile ranking (0–100), evenly spread**, and reshuffle each
  recompute. Great for "top X% of the web of trust", but it's *relative*, not
  absolute. Swapping to a stable log/absolute scale is a ~3-line change in
  `trustRank.ts`.
- **No economic branch by design.** Earning/spending is the cheap-to-fake,
  hard-to-open part; this prototype is the pure Sybil-resistant trust core. If you
  want economic signal, publish it as a *separate, clearly-soft* number gated by a
  minimum Trust Rank — don't blend it in.
- **Anchors default to uniform.** Uniform seed + the caps already resist Sybil
  *farms*, but a curated anchor set is the real production hardening against large
  rings absorbing rank. This is the main governance knob.
- **Collusion/bribery of real humans is not solved** by any open or closed system;
  caps + mutual-only + (future) trust-aging and slashing raise the cost, not to ∞.
- Trust **aging/decay** and **negative propagation (slashing)** are described in the
  design but not yet implemented here.
