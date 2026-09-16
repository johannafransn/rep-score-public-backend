# rep-score-public-backend

An **open** reputation score ("Open Trust Rank") computed entirely from the
**public Circles trust graph** — no analytics service, no secrets, no `.env` keys
beyond a read token, and (for the runtime) **no npm dependencies**. It exposes the
same HTTP routes the wallet already calls, so it's a drop-in replacement for the
closed `analytics/rep_score` API while you evaluate it.

## The idea

Reputation = how much trust flows to you **from a set of already-trusted anchor
humans**, via a capped, personalized power iteration over the mutual human-trust
graph. This is EigenTrust / personalized PageRank, not vanilla PageRank — and the
distinction is the entire security story (see next section).

The formula, run ~50× until it settles, then mapped to a 0–100 population percentile:

```
score(a) = (1 − d) · seed(a)  +  d · Σ   min(cap, score(t)) / outdeg(t)
                                 t → a
```

- `seed` is the **teleport vector**. Anchored to a trusted set, it is what makes
  this Sybil-resistant. Set it uniform and the whole thing collapses (below).
- `d` (0.85) damps runaway loops; `cap` limits any single truster; `outdeg` splits
  a truster's weight across everyone they vouch for.

## Sybil resistance lives entirely in the anchors — read this before gating anything

With **mutual (undirected) edges**, plain PageRank with **uniform teleport**
degrades to **degree centrality**. A dense fake ring gives each of its members a
high degree, so it ranks *high*, not low. This backend supports two modes and the
difference is night and day. Measured on a synthetic 3,000-node scale-free honest
graph with three attack structures (reproduced in `test/sybil.test.ts`):

| Actor | `UNIFORM` (anchors empty) | `ANCHORED` (150 trusted humans) |
|---|---|---|
| Isolated 50-clique Sybil (no honest edges) | **72** ❌ | **0** ✅ |
| Bridged 50-clique Sybil (1 account earns 15 real trusts) | **79** ❌ | **2** ✅ |
| The bridge account itself | 97 | 89 |
| Honest newcomer (6 real mutual trusts) | 75 | 80 |
| Honest median | 48 | 52 |

**UNIFORM mode is a local-demo convenience and is NOT Sybil-resistant.** The server
prints a loud warning when it boots without anchors, and `/health` reports
`sybil_resistant: false`. Do not gate minting, rewards, or limits on a uniform
instance.

**ANCHORED mode is the intended posture.** Teleport mass originates only at the
anchor set, so a node scores above 0 only if trust reaches it along real edges from
the trusted core:

- A ring **disconnected** from the anchors scores **0** — size and internal density
  buy nothing.
- A ring **bridged** through one compromised/bought account inherits only *that one
  account's* rank, split across the ring → each Sybil ≈ 2.
- The residual is that the **bridge account itself still scores ~89** — because it
  genuinely convinced 15 real trusted humans to trust it. That is not a bug: anchoring
  converts *"mint 50 high-rep identities for free"* into *"you get one high-rep
  identity per genuine trust relationship you can actually acquire."* Making even
  that one identity cheap-to-detect needs the behavioral levers below, not topology.

### What still doesn't stop a determined attacker (and what would)

Anchoring stops a bot **community**. It does not, by itself, stop a patient attacker
who slowly earns real trust and then runs bots behind that identity. Topology can't
tell "trusted human" from "trusted human operating a farm." Closing that needs
signals that are expensive to fake over *time*, layered on top of anchoring:

- **Anchor set curation** — the governance knob. Diverse, spread-out anchors (not
  all in one community) mean no single bribed cluster dominates. *(Implemented: pass
  `ANCHORS`.)*
- **Trust aging** — only count edges older than N days, so farm-then-dump rings that
  form overnight contribute nothing until they've survived the window (and risk
  revocation meanwhile). *(Implemented: set `MIN_EDGE_AGE_DAYS`; uses the edge's
  on-chain `timestamp` from Envio.)*
- **Cut / path diversity** — bound a node's score by the number of *independent*
  anchor-rooted paths reaching it, not raw inflow. A bridged ring has a min-cut of 1
  and should be penalized for it. *(Planned.)*
- **Slashing / negative propagation** — if accounts you vouch for turn malicious,
  your score drops, so bridging a farm has downside. *(Planned.)*
- **Behavioral / economic signal** — kept deliberately *out* of this core (it's the
  cheap-to-fake part). If wanted, publish it as a separate, clearly-soft number gated
  by a minimum Trust Rank; never blend it in.

## Run it

Needs Node ≥ 22.6 (runs the TypeScript directly, no build step):

```bash
cd rep-score-public-backend
cp .env.example .env   # add your Envio read token
npm start              # → http://localhost:8787  (anchored by default, see src/anchors.ts)
npm test               # Sybil regression tests, no token needed
```

It ships **anchored by default** (a committed starter set of verified human avatars
in `src/anchors.ts`), so it's Sybil-resistant out of the box. Override the anchors
with `ANCHORS=0xabc…,0xdef…`, or force the vulnerable uniform demo mode with
`ANCHORS=none`.

On boot it loads the whole graph from public Envio and computes scores, then
refreshes every 10 min. Measured on the live graph: **11,976 humans / 144,521
mutual edges in ~14 s**. Per-request latency is just a map lookup — the 14 s is a
background batch, not on the request path.

## Point the wallet at it

The client builds every rep-score URL from `config.groupAnalyticsServiceUrl`
(`wallet/src/lib/constants/circlesV2Config.ts`). For a local test:

```ts
groupAnalyticsServiceUrl: 'http://localhost:8787',
```

That's the only change — these routes match what the client expects:

| Route | Returns |
|---|---|
| `GET /health` | `{ status, humans, edges, computed_at, anchors, sybil_resistant }` |
| `GET /groups/:group/scores` | `{ items: [{ address, reputation_score_live }] }` |
| `GET /groups/:group/avatars/:address` | `RepScoreResponse`-shaped (score + `components.endorsers`) |
| `GET /groups/:group/avatars/:address/history` | `{ items: [] }` (no history yet) |

The `:group` segment is accepted but ignored — Trust Rank is **universal** (one
score per avatar, not per group). CORS is open (`*`) since it's read-only public data.

> **Note:** the detail route fills `behaviour_score`, `liveness_factor`, `age_days`,
> etc. with **placeholder constants** so the wallet's existing detail view doesn't
> break. This backend measures graph position only — those fields are *not* real
> signals here. Don't read meaning into them.

## Config (`src/config.ts`, all optional except the token)

`ENVIO_API_TOKEN` (required, in `.env`), plus `PORT`, `REFRESH_MS`, `DAMPING`,
`ITERATIONS`, `PER_SOURCE_CAP`, `MIN_EDGE_AGE_DAYS` (trust aging; 0 = off), and
`ANCHORS` (comma-separated avatar addresses — **the security-critical one**).

## Honest limitations (read before shipping)

- **Not a proof of personhood or intent.** A high score means "well-positioned in
  the web of trust," not "a real human who won't extract value." Use it as a **soft
  signal** (sorting, badges, gentle limits) first; only consider a hard gate after
  the aging/slashing levers exist and the numbers are shown to behave.
- **Uniform mode is degree centrality** and is Sybil-vulnerable — see the table.
  Ship only with a curated anchor set.
- **Per-source cap barely binds** at current scale (mean rank ≈ 1/12,000 ≪ the 2%
  cap), so it is not doing much of the work today; anchoring is.
- **Scores are a percentile ranking (0–100)** and reshuffle each recompute —
  relative, not absolute. A stable log/absolute scale is a ~3-line change.
- **Collusion/bribery of real humans is not solved** by any open or closed system;
  the levers above raise the cost, not to ∞.
