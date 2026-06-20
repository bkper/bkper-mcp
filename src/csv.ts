function stringifyCsvValue(value: unknown): string {
    if (value == null) {
        return '';
    }

    if (Object.prototype.toString.call(value) === '[object Date]') {
        const date = value as Date;
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    return String(value);
}

function formatCsvField(value: unknown): string {
    const field = stringifyCsvValue(value);

    if (field.includes('"') || field.includes(',') || field.includes('\n') || field.includes('\r')) {
        return `"${field.replace(/"/g, '""')}"`;
    }

    return field;
}

export function formatCsv(matrix: readonly (readonly unknown[])[]): string {
    return matrix.map(row => row.map(formatCsvField).join(',')).join('\r\n');
}
