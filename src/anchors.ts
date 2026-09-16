/**
 * Default anchor set — the trusted "roots" the reputation flows out from.
 *
 * Sybil resistance lives entirely here (see README): teleport mass originates
 * only at these accounts, so an avatar scores > 0 only if real trust reaches it
 * from this set. A bot ring disconnected from these anchors scores 0.
 *
 * These are all **verified, well-established human avatars** on the public Circles
 * graph (their addresses are already public on-chain — being an anchor is not
 * secret). Override the whole list at runtime with the `ANCHORS` env var
 * (comma-separated); when `ANCHORS` is unset this list is used.
 *
 * ── Selection notes ──────────────────────────────────────────────────────────
 * This is a STARTING set (28 avatars) seeded mostly from Johanna's web of trust,
 * with a few known humans from outside it for early diversity. It is still
 * cluster-heavy. Before this gates anything real, broaden it much further across
 * *independent* communities so no single cluster (or one bribed anchor) dominates
 * — see README "anchor set curation". Addresses are checksummed for readability;
 * they are lowercased where they're used.
 */

export const DEFAULT_ANCHORS: string[] = [
	// Confirmed: mutual connections of johanna, shown in the wallet (verified badge).
	'0x009626dAdEd5E90aECee30AD3EBf2b3E510FE256', // Thor
	'0xb604cCd343cDf254E100f206d903D6975eA2950B', // Sunny | HQ
	'0x59cF08D8f86Dd8a19b71F2dcD8ed71f9c2a8a9da', // IhoRxJJ1
	'0xc7d3dF890952a327Af94D5Ba6fdC1Bf145188a1b', // Max (@web3skeptic)
	'0x291F42648D26D7595CcC0b5DBB2Fb74B286Ad82E', // CryptoLab
	'0xa2efFAB90fFe4bBDf080f68E4358c91bDf28A643', // Hugo Montenegro (@hugo0)

	// "People you may know" (not yet connected to johanna) — matched by verified
	// profile name + high mutual-trust count. High confidence; worth an eyeball
	// confirm since first-name matches (martin/paul/caro) can collide.
	'0x42cEDde51198D1773590311E2A340DC06B24cB37', // martin
	'0xf48554937f18885c7f15c432c596b5843648231D', // paul
	'0x323c33A438D177eFc57C22d861E1861e2C2AB68e', // loris
	'0x1248d4388a179E61dEaB16B66a0a25A011c01dcD', // caro
	'0x311792463F34c857342b3F79cBd019EE6df4A256', // nesk
	'0xD14ce9CFC6384590C6b77436dCA212a6Bcb2575F', // Galen

	// More real human avatars (all verified badge, RegisterHuman, checked on-chain).
	'0x14aaB8D72B68c79cbb7873D003585a7C3EF98633', // Yevgeniy
	'0xF7bD3d83df90B4682725ADf668791D4D1499207f', // ace
	'0x33D96e153F80516a062281e7f8356756B97Ae377', // chandresh
	'0xfDEA8140093878BfcA93aAA35d3D3087F4Ab136d', // chim
	'0xDdAA2e8b53A8A62A9E142565d830dB997D528487', // dan
	'0x8b908ca811B6ca2BCecaAfb6769508A981E279BB', // jdetychey
	'0x57928Fb15ffB7303b65EDC326dc4dc38150008e1', // ernst
	'0x61AC0f4875f6BE819e5368cD87F3b1510bf07B39', // Adrienne
	'0x65905BE98ec1c9E43F40CdC37a35F54ad17335d9', // Emma H
	'0xE8Fc7a2d0573e5164597B05F14Fa9A7Fca7b215C', // qub1t
	'0xbdd6d136921Af2a8696BFd96bE44bE2EcfD4B423', // Andreina
	'0x64f1118a097Ba827A04548725543860E17810102', // yoan

	// Known real humans NOT in johanna's personal trust — added for cluster
	// diversity (an anchor must be a real human, it need not be personally trusted).
	'0x39A6E9FAE75E58cf37Aa99C36824afDA251be72a', // Mathieu LRL
	'0xBe9FC8866B433B5759BaF968d6EBb007E15dBF5B', // leowgr
	'0x597400C5982AD5890E799Ff43F081C59695a57bd', // Ann
	'0x69B577044a84b0c7fAa7B85335bdc7BAfFb97548', // alisher
];
