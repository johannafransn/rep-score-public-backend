/**
 * Open Trust Rank — a capped, personalized power iteration over the mutual
 * human-trust graph. Reputation = how much trust flows to you *from a set of
 * already-trusted anchor humans*.
 *
 * The Sybil resistance lives ENTIRELY in the teleport vector:
 *
 *  - ANCHORED (anchors set): teleport mass originates only at the anchor set, so
 *    a node scores > 0 only if trust reaches it along real edges from the core.
 *    A Sybil ring disconnected from the anchors scores 0; a ring bridged through
 *    one compromised account inherits only that one account's rank, split across
 *    the ring (measured: 50-ring member 79 → 2). This is the intended mode.
 *
 *  - UNIFORM (anchors empty): teleport goes to every node equally. This is a
 *    convenience for local demos ONLY and is NOT Sybil-resistant — with mutual
 *    (undirected) edges it degrades to degree centrality, so a dense fake ring
 *    ranks ABOVE the honest median (measured: isolated 50-ring at percentile 72).
 *    The server warns loudly when it boots in this mode. Do not gate anything on it.
 *
 * Other hardening (necessary but not sufficient on their own):
 *  - human↔human mutual edges only (filtered upstream in envio.ts)
 *  - rank weighted by the truster's own rank (recursive) + split by out-degree
 *  - per-source cap: no single truster passes more than `perSourceCap` of total mass
 *  - concave final mapping (percentile) so 1000 weak vouches ≪ a few strong ones
 */

import { config } from './config.ts';
import type { TrustEdge } from './envio.ts';

export interface TrustRankOptions {
	/** Anchor avatar addresses (lowercased). Empty ⇒ uniform teleport (not Sybil-resistant). */
	anchors?: string[];
	damping?: number;
	iterations?: number;
	perSourceCap?: number;
}

export interface TrustRankResult {
	/** address (lowercased) → integer score 0..100 (population percentile of raw rank) */
	scores: Map<string, number>;
	/** address → top trusters by contributed rank (for the "who endorses you" view) */
	endorsers: Map<string, { address: string; weight: number }[]>;
	nodeCount: number;
	edgeCount: number;
	computedAt: string;
}

export const computeTrustRank = (
	edges: TrustEdge[],
	opts: TrustRankOptions = {},
): TrustRankResult => {
	// Resolve tunables: explicit opts override config, so tests (and callers that
	// want a guaranteed anchor set) don't depend on ambient env.
	const d = opts.damping ?? config.damping;
	const iterations = opts.iterations ?? config.iterations;
	const perSourceCap = opts.perSourceCap ?? config.perSourceCap;
	const anchors = opts.anchors ?? config.anchors;
	// Node set + adjacency.
	const nodes = new Set<string>();
	for (const e of edges) {
		nodes.add(e.truster);
		nodes.add(e.trustee);
	}
	const incoming = new Map<string, string[]>(); // trustee → trusters
	const outdeg = new Map<string, number>();
	for (const n of nodes) incoming.set(n, []);
	for (const e of edges) {
		incoming.get(e.trustee)!.push(e.truster);
		outdeg.set(e.truster, (outdeg.get(e.truster) ?? 0) + 1);
	}

	const N = nodes.size;
	// Seed / teleport vector.
	const anchorSet = new Set(anchors.filter((a) => nodes.has(a)));
	const seed = new Map<string, number>();
	if (anchorSet.size > 0) {
		for (const n of nodes) seed.set(n, anchorSet.has(n) ? 1 / anchorSet.size : 0);
	} else {
		for (const n of nodes) seed.set(n, 1 / N); // uniform fallback
	}

	// Power iteration: rank_{k+1}(a) = (1-d)*seed(a) + d * Σ_{t→a} min(cap, rank_k(t))/outdeg(t)
	let rank = new Map<string, number>();
	for (const n of nodes) rank.set(n, 1 / N);

	for (let it = 0; it < iterations; it++) {
		const next = new Map<string, number>();
		let danglingMass = 0;
		for (const n of nodes) {
			if ((outdeg.get(n) ?? 0) === 0) danglingMass += Math.min(perSourceCap, rank.get(n)!);
		}
		for (const a of nodes) {
			let acc = 0;
			for (const t of incoming.get(a)!) {
				const contrib = Math.min(perSourceCap, rank.get(t)!) / outdeg.get(t)!;
				acc += contrib;
			}
			// redistribute dangling (no-outedge) mass via the seed so rank is conserved
			const val = (1 - d) * seed.get(a)! + d * (acc + danglingMass * seed.get(a)!);
			next.set(a, val);
		}
		// normalize to sum 1 (keeps values stable across iterations)
		let sum = 0;
		for (const v of next.values()) sum += v;
		if (sum > 0) for (const [k, v] of next) next.set(k, v / sum);
		rank = next;
	}

	// Map raw rank → 0..100 population percentile (intuitive + concave).
	const sorted = [...rank.entries()].sort((a, b) => a[1] - b[1]);
	const scores = new Map<string, number>();
	sorted.forEach(([addr], i) => {
		scores.set(addr, Math.round((i / Math.max(1, sorted.length - 1)) * 100));
	});

	// Top endorsers per node: trusters ranked by the rank they contribute.
	const endorsers = new Map<string, { address: string; weight: number }[]>();
	for (const a of nodes) {
		const contribs = incoming
			.get(a)!
			.map((t) => ({ address: t, weight: Math.min(perSourceCap, rank.get(t)!) / outdeg.get(t)! }))
			.sort((x, y) => y.weight - x.weight)
			.slice(0, 5);
		endorsers.set(a, contribs);
	}

	return {
		scores,
		endorsers,
		nodeCount: N,
		edgeCount: edges.length,
		computedAt: new Date().toISOString(),
	};
};
