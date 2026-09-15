(function (root) {
    'use strict';
    const records = new Map();
    const now = () => performance.timeOrigin + performance.now();
    function mark(id, stage, trace = {}) {
        const row = records.get(id) || { id, ...trace };
        Object.assign(row, trace);
        row[stage] = now();
        records.set(id, row);
        if (records.size > 500) records.delete(records.keys().next().value);
        return { ...row };
    }
    function summary(field = 'dom') {
        const values = [...records.values()].filter(r => Number.isFinite(r[field]) && Number.isFinite(r.input))
            .map(r => r[field] - r.input).sort((a, b) => a - b);
        if (!values.length) return { count: 0 };
        const n = values.length;
        return { count: n, average: values.reduce((a, b) => a + b, 0) / n,
            median: (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2,
            min: values[0], max: values[n - 1] };
    }
    root.BattleMetrics = { now, mark, summary, records: () => [...records.values()], clear: () => records.clear() };
})(typeof window === 'undefined' ? globalThis : window);
