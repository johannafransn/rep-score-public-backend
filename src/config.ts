/**
 * All tunables in one place. Everything here is public — this backend has no
 * secrets and needs none. The Envio endpoint + token are the same public,
 * client-embedded values the wallet already ships, so no analytics repo / .env
 * from the closed rep-score service is required.
 */

export const config = {
	port: Number(process.env.PORT ?? 8787),

	// Public Circles HyperIndex (same one the wallet uses client-side).
	envioEndpoint:
		process.env.ENVIO_ENDPOINT ?? 'https://gnosis-e702590.dedicated.hyperindex.xyz/v1/graphql',
	envioToken: process.env.ENVIO_API_TOKEN ?? 'a50c149a-ff7f-4a60-a3a9-a5830332407e',

	// Recompute the whole graph this often; requests are served from the cache in
	// between, so per-request latency is a map lookup (see README).
	refreshMs: Number(process.env.REFRESH_MS ?? 10 * 60 * 1000),

	// Trust-rank parameters — all open, all re-runnable on public data.
	damping: Number(process.env.DAMPING ?? 0.85), // rank kept vs. teleported to seed
	iterations: Number(process.env.ITERATIONS ?? 50), // power-iteration steps
	// Per-source cap: no single truster may pass more than this fraction of the
	// total rank mass, so a whale can't mint reputation for its friends.
	perSourceCap: Number(process.env.PER_SOURCE_CAP ?? 0.02),

	// Optional seed/anchor set (comma-separated avatar addresses). When empty we
	// teleport uniformly across humans — fine for a prototype; a curated anchor
	// set is the production Sybil-hardening knob (see README).
	anchors: (process.env.ANCHORS ?? '')
		.split(',')
		.map((a) => a.trim().toLowerCase())
		.filter(Boolean),
};
