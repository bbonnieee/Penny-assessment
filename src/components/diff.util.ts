import { LineItem } from '../models/cr.models';

export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffRow {
	sku: string;
	kind: DiffKind;
	baseline?: LineItem;
	proposed?: LineItem;
}

function itemChanged(a: LineItem, b: LineItem): boolean {
	return a.quantity !== b.quantity || a.unitPrice !== b.unitPrice || a.description !== b.description;
}

export function computeDiff(baseline: LineItem[], proposed: LineItem[]): DiffRow[] {
	const rows: DiffRow[] = [];
	const proposedBySku = new Map(proposed.map((p) => [p.sku, p]));
	const baselineBySku = new Map(baseline.map((b) => [b.sku, b]));

	for (const b of baseline) {
		const p = proposedBySku.get(b.sku);
		if (!p) {
			rows.push({ sku: b.sku, kind: 'removed', baseline: b });
			continue;
		}
		const changed = itemChanged(b, p);
		rows.push({ sku: b.sku, kind: changed ? 'changed' : 'unchanged', baseline: b, proposed: p });
	}

	for (const p of proposed) {
		if (!baselineBySku.has(p.sku)) {
			rows.push({ sku: p.sku, kind: 'added', proposed: p });
		}
	}
	return rows;
}
