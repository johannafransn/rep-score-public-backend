/**
 * All tunables in one place. This backend reads only public Circles data via a
 * closed analytics service is required. The Envio token is supplied via env
 * (`ENVIO_API_TOKEN`) rather than committed — copy `.env.example` to `.env`.
 */

// Load .env from the working directory if present (Node doesn't do this itself).
// No-op on hosts that inject env vars directly (Fly / Render / DigitalOcean / etc.).
try {
	process.loadEnvFile();
} catch {
	/* no .env file — rely on ambient environment */
}

const requireEnv = (name: string): string => {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is required — copy .env.example to .env and fill it in`);
	return v;
};

export const config = {
	port: Number(process.env.PORT ?? 8787),

	// Public Circles HyperIndex (same one the wallet uses client-side).
	envioEndpoint:
		process.env.ENVIO_ENDPOINT ?? 'https://gnosis-e702590.dedicated.hyperindex.xyz/v1/graphql',
	envioToken: requireEnv('ENVIO_API_TOKEN'),

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
