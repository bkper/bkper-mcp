import { describe, expect, it } from 'bun:test';
import { formatCsv } from '../../src/csv.js';

describe('CSV formatter', () => {
    it('quotes fields with commas, quotes, and newlines', () => {
        const csv = formatCsv([
            ['Name', 'Note'],
            ['Cash', 'comma, quote " and\nnewline'],
        ]);

        expect(csv).toBe('Name,Note\r\nCash,"comma, quote "" and\nnewline"');
    });
});
