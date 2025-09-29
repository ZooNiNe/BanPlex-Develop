export async function _apiRequest(method, url, payload = null) {
    const headers = { 'Accept': 'application/json' };
    let body;
    if (payload instanceof FormData) {
        body = payload;
    } else if (payload != null) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
    }
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) throw new Error(`API ${method} ${url} -> ${res.status}`);
    try { return await res.json(); } catch (_) { return null; }
}

export function _mapDeleteEndpoint(entity, id) {
    if (entity === 'termin' || entity === 'income') return `/api/incomes/${id}`;
    if (entity === 'pinjaman' || entity === 'loan') return `/api/loans/${id}`;
    if (entity === 'expense') return `/api/expenses/${id}`;
    if (entity === 'bill') return `/api/bills/${id}`;
    if (entity === 'attendance') return `/api/attendance/${id}`;
    if (entity === 'stock_transaction') return `/api/stock/transactions/${id}`;
    if (entity.startsWith('master:')) {
        const t = entity.split(':')[1];
        return `/api/master/${t}/${id}`;
    }
    return null;
}