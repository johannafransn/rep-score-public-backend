/**
 * Drop-in, open rep-score server. Exposes the same routes the wallet already
 * calls on `config.groupAnalyticsServiceUrl`, so pointing the client here needs
 * only a one-line URL change (see README). The `group` path segment is accepted
 * but ignored — Trust Rank is universal (per-avatar, not per-group).
 *
 *   GET /health
 *   GET /groups/:group/scores            -> { items: [{ address, reputation_score_live }] }
 *   GET /groups/:group/avatars/:address  -> RepScoreResponse-shaped (score + endorsers)
 *   GET /groups/:group/avatars/:address/history -> { items: [] }  (no history yet)
 */

import { createServer } from 'node:http';
import { config } from './config.ts';
import { loadTrustEdges } from './envio.ts';
import { computeTrustRank, type TrustRankResult } from './trustRank.ts';

let cache: TrustRankResult | null = null;
let refreshing = false;

const refresh = async (): Promise<void> => {
	if (refreshing) return;
	refreshing = true;
	const started = Date.now();
	try {
		const edges = await loadTrustEdges();
		cache = computeTrustRank(edges);
		console.log(
			`[rep] refreshed: ${cache.nodeCount} humans, ${cache.edgeCount} mutual edges in ${((Date.now() - started) / 1000).toFixed(1)}s`,
		);
	} catch (e) {
		console.error('[rep] refresh failed:', e instanceof Error ? e.message : e);
	} finally {
		refreshing = false;
	}
};

const scoreOf = (addr: string): number => cache?.scores.get(addr.toLowerCase()) ?? 0;

/** RepScoreResponse-shaped object so the wallet's detail view doesn't break. */
const detail = (group: string, address: string) => {
	const s = scoreOf(address);
	const endorsers = cache?.endorsers.get(address.toLowerCase()) ?? [];
	return {
		group_id: group,
		group_address: group,
		address,
		source: 'open-trust-rank',
		is_member: true,
		non_member_scoring: null,
		raw_score: s,
		reputation_score: s,
		reputation_score_live: s,
		reputation_score_live_clip: s,
		behaviour_score: 0,
		boost_score: 0,
		snapshot: {
			balance: 0,
			outstanding: 0,
			liveness_factor: 1,
			transient_liveness_factor: 1,
			effective_score: s,
			as_of: cache?.computedAt ?? new Date().toISOString(),
		},
		components: {
			R_bar: 0, Q_bar: 0, I_bar: 0, s_b: 0, s_eff: s, s_eff_used: s, s_eff_prev: s,
			base: s, gate: 1, L_tilde: 0, B_static: 0, b_static_sources: {}, B_network: 0,
			B_delta: 0, B_total: 0, s_user: s, s_user_raw: s, age_days: 0, alpha_used: config.damping,
			aggregation: 'trust-rank', mode: 'open', delta_placement: 'none', delta_mode: 'none',
			iters: config.iterations, converged: true, anchor_only: config.anchors.length > 0,
			clipped: false, b_mem: 0, b_mem_prev: 0, daily_change: 0, dt_days: 0, endorsers,
		},
		computed_at: cache?.computedAt ?? new Date().toISOString(),
	};
};

const json = (res: import('node:http').ServerResponse, code: number, body: unknown): void => {
	const payload = JSON.stringify(body);
	res.writeHead(code, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*', // read-only public data — safe for a local prototype
		'Access-Control-Allow-Headers': '*',
		'Cache-Control': 'no-store',
	});
	res.end(payload);
};

const server = createServer((req, res) => {
	if (req.method === 'OPTIONS') return json(res, 204, {});
	const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);
	const parts = url.pathname.split('/').filter(Boolean);

	// /health
	if (parts[0] === 'health') {
		return json(res, cache ? 200 : 503, { status: cache ? 'ok' : 'warming', ...meta() });
	}
	// /groups/:group/...
	if (parts[0] === 'groups' && parts[1]) {
		const group = parts[1];
		// /groups/:group/scores — return the FULL set. The client's "fetch all rep
		// scores" wants every avatar; honouring its limit (10000) would silently drop
		// the humans beyond it, which then render as 0 in lists like Connections.
		if (parts[2] === 'scores' && parts.length === 3) {
			const all = [...(cache?.scores ?? [])].map(([address, reputation_score_live]) => ({
				address,
				reputation_score_live,
			}));
			const offset = Number(url.searchParams.get('offset') ?? 0);
			return json(res, 200, { items: offset > 0 ? all.slice(offset) : all });
		}
		// /groups/:group/avatars/:address[/history]
		if (parts[2] === 'avatars' && parts[3]) {
			const address = parts[3];
			if (parts[4] === 'history') return json(res, 200, { items: [] });
			return json(res, 200, detail(group, address));
		}
	}
	return json(res, 404, { error: 'not found' });
});

const meta = () => ({
	humans: cache?.nodeCount ?? 0,
	edges: cache?.edgeCount ?? 0,
	computed_at: cache?.computedAt ?? null,
	anchors: config.anchors.length,
	// Explicit so callers can refuse to gate on a non-Sybil-resistant instance.
	sybil_resistant: config.anchors.length > 0,
});

server.listen(config.port, () => {
	console.log(`[rep] open-trust-rank listening on http://localhost:${config.port}`);
	if (config.anchors.length === 0) {
		console.warn(
			'[rep] ⚠️  NO ANCHORS SET — running in UNIFORM teleport mode. This is NOT\n' +
				'[rep] ⚠️  Sybil-resistant: dense fake rings rank above the honest median. Fine\n' +
				'[rep] ⚠️  for a local demo; set ANCHORS=<trusted addrs,…> before gating anything.',
		);
	} else {
		console.log(`[rep] anchored to ${config.anchors.length} trusted humans (Sybil-resistant mode)`);
	}
	console.log(
		config.minEdgeAgeDays > 0
			? `[rep] trust aging on: ignoring edges younger than ${config.minEdgeAgeDays}d`
			: '[rep] trust aging off (MIN_EDGE_AGE_DAYS=0) — every edge counts',
	);
	console.log(`[rep] computing initial graph…`);
	void refresh();
	setInterval(() => void refresh(), config.refreshMs);
});
