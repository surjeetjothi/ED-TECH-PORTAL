/** parent_fees.js — Parent Fees View */
async function loadParentFeesView() {
    const view = document.getElementById('parent-fees-view');
    if (!view)
        return;
    view.innerHTML = CB.ui.spinner('Loading child fee data...', 'lg');
    try {
        const res = await fetchAPI('/finance/fees/child');
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.detail || 'Failed to load child fee invoices.');
        }
        const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
        const totalDue = invoices
            .filter(i => String(i.status || '').toLowerCase() !== 'paid')
            .reduce((sum, i) => sum + Number(i.amount || 0), 0);
        const rows = invoices.map(i => `
            <tr>
                <td class="ps-4">${i.student_id || '-'}</td>
                <td>${i.invoice_number || '-'}</td>
                <td>${i.description || '-'}</td>
                <td>$${Number(i.amount || 0).toFixed(2)}</td>
                <td>${i.due_date || '-'}</td>
                <td><span class="badge ${String(i.status || '').toLowerCase() === 'paid' ? 'bg-success' : 'bg-warning text-dark'}">${i.status || 'Pending'}</span></td>
            </tr>
        `).join('');
        view.innerHTML = `
            <h3 class="fw-bold mb-4 text-dark">Child Fees</h3>
            <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-body p-4 d-flex justify-content-between align-items-center">
                    <div>
                        <div class="small text-muted">Outstanding</div>
                        <h4 class="fw-bold mb-0">$${totalDue.toFixed(2)}</h4>
                    </div>
                    <div class="text-muted small">Linked Students: ${(payload.child_ids || []).length}</div>
                </div>
            </div>
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th class="ps-4">Student</th>
                                <th>Invoice</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Due Date</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td class="ps-4 text-muted" colspan="6">No fee invoices found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    catch (e) {
        view.innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
    }
}


// --- Window bindings for inline HTML onclick handlers ---
window.loadParentFeesView = loadParentFeesView;
