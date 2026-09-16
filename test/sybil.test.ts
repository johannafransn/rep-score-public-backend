/**
 * Sybil regression tests for computeTrustRank.
 *
 * These encode the external review's finding as executable assertions:
 *   1. UNIFORM teleport (no anchors) is NOT Sybil-resistant — a dense fake ring
 *      ranks ABOVE the honest median. We assert the failure on purpose so nobody
 *      "fixes" the demo mode into looking safe.
 *   2. ANCHORED teleport IS Sybil-resistant — an isolated ring scores 0 and a
 *      bridged ring's members are pushed far below the honest median.
 *
 * Run: node --test  (needs Node ≥ 22.6; no build step, no Envio token)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrustRank } from '../src/trustRank.ts';
import type { TrustEdge } from '../src/envio.ts';

// --- deterministic synthetic graph: scale-free honest core + attack structures ---
function buildGraph() {
	let s = 12345;
	const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];

	const edges: TrustEdge[] = [];
	const mutual = (a: string, b: string) => {
		if (a === b) return;
		edges.push({ truster: a, trustee: b });
		edges.push({ truster: b, trustee: a });
	};

	// Honest graph: Barabási–Albert preferential attachment (right-skewed degree).
	const H = 3000;
	const m = 3;
	const hon = Array.from({ length: H }, (_, i) => `h${i}`);
	const deg: Record<string, number> = {};
	const bag: string[] = [];
	for (let i = 0; i < m; i++)
		for (let j = i + 1; j < m; j++) {
			mutual(hon[i], hon[j]);
			deg[hon[i]] = (deg[hon[i]] || 0) + 1;
			deg[hon[j]] = (deg[hon[j]] || 0) + 1;
			bag.push(hon[i], hon[j]);
		}
	for (let i = m; i < H; i++) {
		const targets = new Set<string>();
		while (targets.size < m) targets.add(pick(bag));
		for (const t of targets) {
			mutual(hon[i], t);
			bag.push(hon[i], t);
			deg[hon[i]] = (deg[hon[i]] || 0) + 1;
			deg[t] = (deg[t] || 0) + 1;
		}
	}

	// Attack 1: 50 accounts all trusting each other, no edge to the honest graph.
	const iso = Array.from({ length: 50 }, (_, i) => `iso${i}`);
	for (let i = 0; i < 50; i++) for (let j = i + 1; j < 50; j++) mutual(iso[i], iso[j]);

	// Attack 2: same ring, but br0 buys/earns 15 real mutual trusts to honest hubs.
	const br = Array.from({ length: 50 }, (_, i) => `br${i}`);
	for (let i = 0; i < 50; i++) for (let j = i + 1; j < 50; j++) mutual(br[i], br[j]);
	const hubs = hon
		.slice()
		.sort((a, b) => (deg[b] || 0) - (deg[a] || 0))
		.slice(0, 15);
	for (const h of hubs) mutual('br0', h);

	return { edges, hon };
}

function honestMedian(scores: Map<string, number>, hon: string[]): number {
	const arr = hon.map((h) => scores.get(h) ?? 0).sort((a, b) => a - b);
	return arr[arr.length >> 1];
}

test('UNIFORM teleport is NOT Sybil-resistant (documents the failure mode)', () => {
	const { edges, hon } = buildGraph();
	const { scores } = computeTrustRank(edges, { anchors: [] });
	const median = honestMedian(scores, hon);
	// The isolated ring reaching ~1/N (the mean) lands it above the median.
	assert.ok(
		scores.get('iso7')! > median,
		`expected isolated ring (${scores.get('iso7')}) to beat honest median (${median}) in uniform mode`,
	);
});

test('ANCHORED teleport IS Sybil-resistant', () => {
	const { edges, hon } = buildGraph();
	// 150 known-good humans spread across the graph — none of them the bridge's hubs.
	const anchors = Array.from({ length: 150 }, (_, i) => `h${i * 20}`);
	const { scores } = computeTrustRank(edges, { anchors });
	const median = honestMedian(scores, hon);

	// A ring with zero honest edges gets zero anchor mass.
	assert.equal(scores.get('iso7'), 0, 'isolated ring must score 0 when anchored');

	// A ring bridged by one account inherits only that account's diluted rank.
	assert.ok(
		scores.get('br7')! < median / 2,
		`bridged ring member (${scores.get('br7')}) must be far below honest median (${median})`,
	);

	// An honest newcomer with a handful of real trusts must NOT be collateral damage.
	// (br0 keeps a high score — but that is one account that earned 15 real trusts,
	//  not 50 free identities. That residual is by design, not a bug.)
	assert.ok(median >= 45, `honest median (${median}) should stay healthy under anchoring`);
});
