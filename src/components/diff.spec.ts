import { computeDiff } from './diff.util';
import { LineItem } from '../models/cr.models';

const base: LineItem[] = [
	{ sku: 'SKU-A', description: 'Widget A', quantity: 10, unitPrice: 500 },
	{ sku: 'SKU-B', description: 'Widget B', quantity: 30, unitPrice: 100 },
];

describe('computeDiff', () => {
	it('detects a removed sku', () => {
		expect(computeDiff(base, [base[0]]).find((r) => r.sku === 'SKU-B')?.kind).toBe('removed');
	});

	it('detects an added sku', () => {
		const rows = computeDiff(base, [...base, { sku: 'SKU-C', description: 'C', quantity: 1, unitPrice: 5 }]);
		expect(rows.find((r) => r.sku === 'SKU-C')?.kind).toBe('added');
	});

	it('detects a quantity-only change as changed', () => {
		// SKU-A quantity 10 -> 11 (same unit price) is a real change.
		const rows = computeDiff(base, [{ ...base[0], quantity: 11 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('detects a price-only change as changed', () => {
		const rows = computeDiff(base, [{ ...base[0], unitPrice: 450 }, base[1]]);
		expect(rows.find((r) => r.sku === 'SKU-A')?.kind).toBe('changed');
	});

	it('detects a description-only change as changed (e.g. a supplier swap)', () => {
		const rows = computeDiff(base, [base[0], { ...base[1], description: 'Widget B (new supplier)' }]);
		expect(rows.find((r) => r.sku === 'SKU-B')?.kind).toBe('changed');
	});

	it('reports identical lines as unchanged, with both sides attached', () => {
		const sameValuesNewObjects = base.map((item) => ({ ...item }));
		const rows = computeDiff(base, sameValuesNewObjects);
		expect(rows.map((r) => r.kind)).toEqual(['unchanged', 'unchanged']);
		expect(rows[0].baseline).toEqual(base[0]);
		expect(rows[0].proposed).toEqual(base[0]);
	});

	it('returns no rows when both sides are empty', () => {
		expect(computeDiff([], [])).toEqual([]);
	});

	it('lists baseline SKUs in their order, then added SKUs, each with only the side it has', () => {
		const added = { sku: 'SKU-C', description: 'C', quantity: 1, unitPrice: 5 };
		const rows = computeDiff(base, [added, { ...base[1], quantity: 31 }]);

		expect(rows.map((r) => [r.sku, r.kind])).toEqual([
			['SKU-A', 'removed'],
			['SKU-B', 'changed'],
			['SKU-C', 'added'],
		]);
		expect(rows[0].proposed).toBeUndefined();
		expect(rows[2].baseline).toBeUndefined();
	});
});
