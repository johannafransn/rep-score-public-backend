/**
 * Load the human↔human mutual-trust graph from the public Circles HyperIndex.
 *
 * This is the ONLY data source — no closed analytics service. We pull every
 * mutual TrustRelation between two RegisterHuman avatars (Circles registration
 * is itself invite-gated, so the node set is already somewhat Sybil-resistant),
 * cursor-paginated on the entity `id` so it scales past the 1000-row default cap.
 */

import { config } from './config.ts';

export interface TrustEdge {
	truster: string; // lowercased avatar address
	trustee: string; // lowercased avatar address
}

const PAGE = 1000;

const TRUST_PAGE_QUERY = `
	query trustEdges($limit: Int!, $afterId: String!) {
		TrustRelation(
			where: {
				isMutual: { _eq: true }
				id: { _gt: $afterId }
				truster: { avatarType: { _eq: "RegisterHuman" } }
				trustee: { avatarType: { _eq: "RegisterHuman" } }
			}
			order_by: { id: asc }
			limit: $limit
		) {
			id
			truster_id
			trustee_id
		}
	}
`;

interface TrustRow {
	id: string;
	truster_id: string;
	trustee_id: string;
}

const gql = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
	const res = await fetch(config.envioEndpoint, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.envioToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ query, variables }),
	});
	if (!res.ok) throw new Error(`Envio HTTP ${res.status}`);
	const json = (await res.json()) as { data?: T; errors?: unknown };
	if (json.errors) throw new Error(`Envio GraphQL: ${JSON.stringify(json.errors)}`);
	if (!json.data) throw new Error('Envio: empty response');
	return json.data;
};

/** Fetch every mutual human-human trust edge (deduped, self-loops dropped). */
export const loadTrustEdges = async (): Promise<TrustEdge[]> => {
	const edges: TrustEdge[] = [];
	const seen = new Set<string>();
	let afterId = '';

	for (;;) {
		const data = await gql<{ TrustRelation: TrustRow[] }>(TRUST_PAGE_QUERY, {
			limit: PAGE,
			afterId,
		});
		const rows = data.TrustRelation;
		if (rows.length === 0) break;

		for (const r of rows) {
			const truster = r.truster_id.toLowerCase();
			const trustee = r.trustee_id.toLowerCase();
			if (truster === trustee) continue;
			const key = `${truster}>${trustee}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push({ truster, trustee });
		}

		afterId = rows[rows.length - 1].id;
		if (rows.length < PAGE) break;
	}

	return edges;
};
