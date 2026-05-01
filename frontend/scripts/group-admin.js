// State
let currentGroup = null;

// Helpers
const sanitise = (str) => {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
};

function getInitials(name) {
    return (name || '').trim().split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function setAvatar() {
    const name     = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar   = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
}


// ─── Render group header ──────────────────────────────────────────────────────

function renderGroupHeader(group) {
    document.getElementById('group-name').textContent = sanitise(group.name);
    document.getElementById('group-desc').textContent = sanitise(group.description) || 'No description provided.';

    const badge       = document.getElementById('status-badge');
    badge.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
    badge.className   = 'badge ' + group.status;

    document.getElementById('stat-members').textContent = group.totalMembers;
    document.getElementById('stat-amount').textContent  = formatCurrency(group.contributionAmount);
    document.getElementById('stat-cycle').textContent   = group.cycleType;
    document.getElementById('stat-start').textContent   = formatDate(group.startDate);
}


// ─── Render members table ─────────────────────────────────────────────────────

function renderMembers(members) {
    const container = document.getElementById('members-container');
    const countEl   = document.getElementById('member-count');

    countEl.textContent = members.length + ' total';

    if (members.length === 0) {
        container.innerHTML = '<p class="empty-members">No members yet.</p>';
        return;
    }

    const AVATAR_COLOURS = ['av-teal', 'av-blue', 'av-purple', 'av-coral'];

    const rows = members.map((member, index) => {
        const colour    = AVATAR_COLOURS[index % AVATAR_COLOURS.length];
        const initials  = getInitials(member.name);
        const joined    = formatDate(member.joinedAt);
        const roleClass = member.role === 'admin' ? 'admin' : member.role === 'treasurer' ? 'treasurer' : 'member';
        const roleLabel = member.role.charAt(0).toUpperCase() + member.role.slice(1);

        return `
            <tr>
                <td>
                    <section class="member-info">
                        <i class="member-initials ${colour}">${sanitise(initials)}</i>
                        <section>
                            <p class="member-name-text">${sanitise(member.name)}</p>
                            <p class="member-email-text">${sanitise(member.email)}</p>
                        </section>
                    </section>
                </td>
                <td><b class="role-badge ${roleClass}">${roleLabel}</b></td>
                <td class="joined-date">${joined}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="members-table">
            <thead>
                <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Joined</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}


// ─── Payment status ───────────────────────────────────────────────────────────

async function fetchPaymentStatus(userId, groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/payments/status/${userId}/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch payment status');
    return await response.json();
}

async function simulatePayment(userId, groupId, amount, treasurerId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/payments/simulate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, groupId, amount, treasurerId })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment failed');
    }
    return await response.json();
}

function renderPaymentCard(statusData) {
    const icon  = document.getElementById('payment-status-icon');
    const label = document.getElementById('payment-status-label');
    const sub   = document.getElementById('payment-status-sub');
    const ref   = document.getElementById('payment-ref');
    const btn   = document.getElementById('pay-now-btn');

    if (!icon || !label || !sub || !btn) return;

    if (statusData.hasPaidThisCycle) {
        const paidDate    = formatDate(statusData.lastPayment.paidAt);
        icon.textContent  = '\u2713';
        icon.className    = 'payment-status-icon paid-icon';
        label.textContent = 'Paid';
        label.className   = 'payment-status-label paid-label';
        sub.textContent   = formatCurrency(statusData.contributionAmount) + ' \u00b7 ' + paidDate;
        btn.hidden        = true;
        if (ref && statusData.lastPayment.transactionRef) {
            ref.textContent = 'Ref: ' + statusData.lastPayment.transactionRef;
            ref.hidden      = false;
        }
    } else if (statusData.hasPendingPayment) {
        icon.textContent  = '\u23f3';
        icon.className    = 'payment-status-icon pending-icon';
        label.textContent = 'Pending';
        label.className   = 'payment-status-label pending-label';
        sub.textContent   = formatCurrency(statusData.contributionAmount) + ' \u00b7 Awaiting confirmation';
        btn.hidden        = true;
        if (ref && statusData.pendingPayment.transactionRef) {
            ref.textContent = 'Ref: ' + statusData.pendingPayment.transactionRef;
            ref.hidden      = false;
        }
    } else {
        icon.textContent        = '!';
        icon.className          = 'payment-status-icon unpaid-icon';
        label.textContent       = 'Unpaid';
        label.className         = 'payment-status-label unpaid-label';
        sub.textContent         = formatCurrency(statusData.contributionAmount) + ' due this cycle';
        if (ref) ref.hidden     = true;
        btn.hidden              = false;
        btn.dataset.amount      = statusData.contributionAmount;
        btn.dataset.groupid     = statusData.groupId;
        btn.dataset.userid      = statusData.userId;
        btn.dataset.treasurerid = statusData.userId;
    }
}

function openPaymentConfirmModal(userId, groupId, amount, treasurerId) {
    const modal      = document.getElementById('payment-confirm-modal');
    const amountEl   = document.getElementById('confirm-amount-display');
    const confirmBtn = document.getElementById('confirm-payment-btn');
    if (!modal || !amountEl || !confirmBtn) return;

    amountEl.textContent           = formatCurrency(amount);
    confirmBtn.dataset.userid      = userId;
    confirmBtn.dataset.groupid     = groupId;
    confirmBtn.dataset.amount      = amount;
    confirmBtn.dataset.treasurerid = treasurerId;
    modal.hidden = false;
}

function closePaymentModal() {
    const modal = document.getElementById('payment-confirm-modal');
    if (modal) modal.hidden = true;
}

async function handlePayNow() {
    const btn     = document.getElementById('pay-now-btn');
    const userId  = parseInt(btn.dataset.userid);
    const groupId = parseInt(btn.dataset.groupid);
    const amount  = parseFloat(btn.dataset.amount);

    try {
        const status = await fetchPaymentStatus(userId, groupId);
        if (status.hasPaidThisCycle || status.hasPendingPayment) {
            renderPaymentCard(status);
            return;
        }
        openPaymentConfirmModal(userId, groupId, amount, userId);
    } catch (error) {
        alert('Unable to process payment. Please try again.');
    }
}

async function handleConfirmPayment() {
    const confirmBtn = document.getElementById('confirm-payment-btn');
    if (!confirmBtn) return;

    const userId      = parseInt(confirmBtn.dataset.userid);
    const groupId     = parseInt(confirmBtn.dataset.groupid);
    const amount      = parseFloat(confirmBtn.dataset.amount);
    const treasurerId = parseInt(confirmBtn.dataset.treasurerid);

    confirmBtn.textContent = 'Processing...';
    confirmBtn.disabled    = true;

    try {
        const result  = await simulatePayment(userId, groupId, amount, treasurerId);
        closePaymentModal();

        const updated = await fetchPaymentStatus(userId, groupId);
        renderPaymentCard(updated);

        const banner       = document.getElementById('status-banner');
        banner.textContent = 'Payment submitted · Ref: ' + result.transactionRef;
        banner.className   = 'status-banner success';
        banner.hidden      = false;
        setTimeout(() => { banner.hidden = true; }, 5000);

    } catch (error) {
        alert('Payment failed: ' + error.message);
    } finally {
        confirmBtn.textContent = 'Confirm payment';
        confirmBtn.disabled    = false;
    }
}


// ─── Add member ───────────────────────────────────────────────────────────────

async function addMember() {
    const emailInput = document.getElementById('member-email');
    const btn        = document.getElementById('btn-add-member');
    const email      = emailInput.value.trim();

    emailInput.classList.remove('input-error');

    if (!email || !email.includes('@')) {
        emailInput.classList.add('input-error');
        showFeedback('add-feedback', 'Please enter a valid email address.', 'error');
        return;
    }

    if (!currentGroup) {
        showFeedback('add-feedback', 'No group loaded. Please refresh the page.', 'error');
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Adding...';

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups/add-member`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ email, groupId: currentGroup.groupId })
        });

        const data = await response.json();

        if (response.ok) {
            showFeedback('add-feedback', `${data.member.userName} (${data.member.userEmail}) was added to ${data.member.groupName} successfully.`, 'success');
            emailInput.value = '';
            await loadGroupData();
        } else {
            showFeedback('add-feedback', data.error || 'Failed to add member.', 'error');
        }

    } catch (err) {
        showFeedback('add-feedback', 'Something went wrong. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Add member';
    }
}


// ─── Assign treasurer ─────────────────────────────────────────────────────────

async function assignTreasurer() {
    const emailInput = document.getElementById('treasurer-email');
    const btn        = document.getElementById('btn-assign-treasurer');
    const email      = emailInput.value.trim();

    emailInput.classList.remove('input-error');

    if (!email || !email.includes('@')) {
        emailInput.classList.add('input-error');
        showFeedback('assign-feedback', 'Please enter a valid email address.', 'error');
        return;
    }

    if (!currentGroup) {
        showFeedback('assign-feedback', 'No group loaded. Please refresh the page.', 'error');
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Assigning...';

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups/assign-treasurer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ email, groupId: currentGroup.groupId })
        });

        const data = await response.json();

        if (response.ok) {
            showFeedback('assign-feedback', `${data.member.userName} (${data.member.userEmail}) was assigned as treasurer for ${data.member.groupName} successfully.`, 'success');
            emailInput.value = '';
            await loadGroupData();
        } else {
            showFeedback('assign-feedback', data.error || 'Failed to assign treasurer.', 'error');
        }

    } catch (err) {
        showFeedback('assign-feedback', 'Something went wrong. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Assign Treasurer';
    }
}

function showFeedback(id, message, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className   = 'form-feedback ' + type;
    el.hidden      = false;
}


// ─── Load group data ──────────────────────────────────────────────────────────

async function loadGroupData() {
    const userId    = localStorage.getItem('userId');
    const urlParams = new URLSearchParams(window.location.search);
    const groupId   = urlParams.get('groupId');
    const banner    = document.getElementById('status-banner');

    if (!userId || !groupId) {
        banner.textContent = 'Missing session data. Please log in again.';
        banner.className   = 'status-banner closed';
        banner.hidden      = false;
        return;
    }

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const groups = await response.json();
        const group  = groups.find(g => String(g.groupId) === String(groupId));

        if (!group) {
            banner.textContent = 'Group not found or you are not a member.';
            banner.className   = 'status-banner closed';
            banner.hidden      = false;
            return;
        }

        if (group.userRole !== 'admin') {
            window.location.href = `group-overview.html?groupId=${groupId}`;
            return;
        }

        currentGroup = group;
        renderGroupHeader(group);
        renderMembers(group.members);

        const statusData = await fetchPaymentStatus(parseInt(userId), parseInt(groupId));
        renderPaymentCard(statusData);

    } catch (err) {
        console.error('Load error:', err);
        banner.textContent = 'Error loading group data. Please try again.';
        banner.className   = 'status-banner closed';
        banner.hidden      = false;
    }
}


// ─── View payouts modal ───────────────────────────────────────────────────────

async function fetchPayouts(groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/payouts/group/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch payouts');
    return await response.json();
}

async function loadAndShowPayouts(groupId) {
    const userId = parseInt(localStorage.getItem('userId'));
    if (!groupId) { alert('No group selected. Please refresh the page.'); return; }

    let modal = document.getElementById('payouts-modal');
    if (!modal) {
        modal           = document.createElement('aside');
        modal.id        = 'payouts-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <article class="modal">
                <header class="modal-header">
                    <h2 class="modal-title">Payout schedule</h2>
                    <button class="modal-close" aria-label="Close payouts">&#x2715;</button>
                </header>
                <section id="payouts-content" class="modal-section"></section>
            </article>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.modal-close').addEventListener('click', () => { modal.hidden = true; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    }

    const content = document.getElementById('payouts-content');
    content.innerHTML = '<p style="text-align:center;padding:1.5rem;color:#64748b;">Loading...</p>';
    modal.hidden = false;

    try {
        const payouts = await fetchPayouts(groupId);

        if (!payouts || payouts.length === 0) {
            content.innerHTML = '<p style="text-align:center;padding:2rem;color:#64748b;font-style:italic;">No payouts recorded for this group yet.</p>';
            return;
        }

        let html = `
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:1.5px solid #e0f7f6;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Member</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Date</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Amount</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        payouts.forEach(p => {
            const isMe      = p.recipientId === userId;
            const name      = isMe ? 'You' : (p.recipientName || p.recipient?.name || '\u2014');
            const date      = p.initiatedAt ? new Date(p.initiatedAt).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' }) : '\u2014';
            const amount    = new Intl.NumberFormat('en-ZA', { style:'currency', currency:'ZAR', minimumFractionDigits:2 }).format(p.amount);
            const statusTxt = p.status.charAt(0).toUpperCase() + p.status.slice(1);
            const rowBg     = isMe ? 'background:#e0f7f6;' : 'background:white;';

            let statusBg = '#e0f7f6', statusColor = '#034e52';
            if (p.status === 'pending')   { statusBg = '#fef3c7'; statusColor = '#b45309'; }
            if (p.status === 'cancelled') { statusBg = '#fef2f2'; statusColor = '#991b1b'; }

            html += `
                <tr style="${rowBg}border-bottom:1px solid #f0fafa;">
                    <td style="padding:11px 12px;font-weight:${isMe ? '700' : '400'};color:#0f172a;">${name}</td>
                    <td style="padding:11px 12px;color:#0f172a;">${date}</td>
                    <td style="padding:11px 12px;color:#0f172a;">${amount}</td>
                    <td style="padding:11px 12px;">
                        <span style="background:${statusBg};color:${statusColor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${statusTxt}</span>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;

    } catch (error) {
        content.innerHTML = `<p style="text-align:center;padding:2rem;color:#991b1b;">Could not load payouts: ${error.message}</p>`;
    }
}


// ─── Compliance report ────────────────────────────────────────────────────────

async function fetchComplianceReport(groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/groups/${groupId}/compliance-report`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch compliance report');
    return await response.json();
}

async function loadAndShowComplianceReport() {
    const groupId = currentGroup?.groupId;
    if (!groupId) { alert('No group selected. Please refresh the page.'); return; }

    let modal = document.getElementById('compliance-modal');
    if (!modal) {
        modal           = document.createElement('aside');
        modal.id        = 'compliance-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <article class="modal">
                <header class="modal-header">
                    <h2 class="modal-title">Contribution Compliance Report</h2>
                    <button class="modal-close" aria-label="Close report">&#x2715;</button>
                </header>
                <section id="compliance-content" class="modal-section"></section>
            </article>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.modal-close').addEventListener('click', () => { modal.hidden = true; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    }

    const content = document.getElementById('compliance-content');
    content.innerHTML = '<p style="text-align:center;padding:1.5rem;color:#64748b;">Loading...</p>';
    modal.hidden = false;

    try {
        const data = await fetchComplianceReport(groupId);

        const rateColor = data.groupComplianceRate >= 80 ? '#034e52' : data.groupComplianceRate >= 50 ? '#b45309' : '#991b1b';
        const rateBg    = data.groupComplianceRate >= 80 ? '#e0f7f6'  : data.groupComplianceRate >= 50 ? '#fef3c7'  : '#fef2f2';

        let html = `
            <section style="display:flex;gap:12px;margin-bottom:1.25rem;flex-wrap:wrap;">
                <section style="flex:1;min-width:120px;background:${rateBg};border-radius:10px;padding:14px 18px;text-align:center;">
                    <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 4px;">Group compliance</p>
                    <p style="font-size:26px;font-weight:700;color:${rateColor};margin:0;">${data.groupComplianceRate}%</p>
                </section>
                <section style="flex:1;min-width:120px;background:#f0fafa;border-radius:10px;padding:14px 18px;text-align:center;">
                    <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 4px;">Paid members</p>
                    <p style="font-size:26px;font-weight:700;color:#034e52;margin:0;">${data.totalPaid} / ${data.totalMembers}</p>
                </section>
                <section style="flex:1;min-width:120px;background:#f0fafa;border-radius:10px;padding:14px 18px;text-align:center;">
                    <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 4px;">Defaulting</p>
                    <p style="font-size:26px;font-weight:700;color:#991b1b;margin:0;">${data.members.filter(m => m.status === 'defaulting').length}</p>
                </section>
            </section>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:1.5px solid #e0f7f6;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Member</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Paid</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Missed</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Pending</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Rate</th>
                        <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.members.forEach(member => {
            let statusBg = '#e0f7f6', statusColor = '#034e52', statusLabel = 'Compliant';
            if (member.status === 'at-risk')    { statusBg = '#fef3c7'; statusColor = '#b45309'; statusLabel = 'At risk'; }
            if (member.status === 'defaulting') { statusBg = '#fef2f2'; statusColor = '#991b1b'; statusLabel = 'Defaulting'; }

            html += `
                <tr style="border-bottom:1px solid #f0fafa;">
                    <td style="padding:11px 12px;">
                        <p style="font-weight:600;color:#034e52;margin:0;">${sanitise(member.name)}</p>
                        <p style="font-size:12px;color:#64748b;margin:0;">${sanitise(member.email)}</p>
                    </td>
                    <td style="padding:11px 12px;text-align:center;color:#034e52;font-weight:700;">${member.paid}</td>
                    <td style="padding:11px 12px;text-align:center;color:#991b1b;font-weight:700;">${member.missed}</td>
                    <td style="padding:11px 12px;text-align:center;color:#b45309;font-weight:700;">${member.pending}</td>
                    <td style="padding:11px 12px;text-align:center;font-weight:700;">${member.complianceRate}%</td>
                    <td style="padding:11px 12px;text-align:center;">
                        <span style="background:${statusBg};color:${statusColor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${statusLabel}</span>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;

    } catch (error) {
        content.innerHTML = `<p style="text-align:center;padding:2rem;color:#991b1b;">Could not load report: ${error.message}</p>`;
    }
}


// ─── Contribution history ─────────────────────────────────────────────────────

async function loadAndShowContributions() {
    const groupId = currentGroup?.groupId;
    const userId  = localStorage.getItem('userId');

    if (!groupId) { alert('No group selected. Please refresh the page.'); return; }
    if (!userId)  { alert('User not found. Please log in again.'); return; }

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/contributions/${userId}/${groupId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load contributions');

        const data = await response.json();
        displayContributionsModal(data.contributions);

    } catch (error) {
        alert('Could not load contributions: ' + error.message);
    }
}

function displayContributionsModal(contributions) {
    let modal = document.getElementById('contributions-modal');

    if (!modal) {
        modal           = document.createElement('aside');
        modal.id        = 'contributions-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <article class="modal">
                <header class="modal-header">
                    <h2 class="modal-title">My Contribution History</h2>
                    <button class="modal-close" aria-label="Close contributions">✕</button>
                </header>
                <section id="contributions-content" class="modal-section"></section>
            </article>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.modal-close').addEventListener('click', () => { modal.hidden = true; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
    }

    const content = document.getElementById('contributions-content');

    if (!contributions || contributions.length === 0) {
        content.innerHTML = '<p style="text-align:center; padding: 2rem;">No contributions found yet.</p>';
        modal.hidden = false;
        return;
    }

    let totalPaid = 0;
    let html = `
        <table style="width:100%; border-collapse:collapse;">
            <thead>
                <tr style="border-bottom:2px solid #ddd;">
                    <th style="padding:8px; text-align:left;">Date Paid</th>
                    <th style="padding:8px; text-align:left;">Amount</th>
                    <th style="padding:8px; text-align:left;">Status</th>
                    <th style="padding:8px; text-align:left;">Due Date</th>
                    <th style="padding:8px; text-align:left;">Reference</th>
                </tr>
            </thead>
            <tbody>
    `;

    contributions.forEach(contrib => {
        totalPaid += parseFloat(contrib.amount);
        const paidDate = contrib.paidAt  ? new Date(contrib.paidAt).toLocaleDateString()  : '—';
        const dueDate  = contrib.dueDate ? new Date(contrib.dueDate).toLocaleDateString() : '—';
        const ref      = contrib.note || '—';

        let statusColor = '#2b7e3a', statusBg = '#2b7e3a20', statusText = contrib.status;
        if (contrib.status === 'pending')                                      { statusColor = '#ff9800'; statusBg = '#ff980020'; statusText = 'Pending'; }
        else if (contrib.status === 'missed' || contrib.status === 'overdue') { statusColor = '#f44336'; statusBg = '#f4433620'; statusText = 'Missed'; }
        else if (contrib.status === 'paid')                                    { statusText = 'Paid'; }

        html += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px;">${paidDate}</td>
                <td style="padding:8px;">${formatCurrency(parseFloat(contrib.amount))}</td>
                <td style="padding:8px;"><span style="background:${statusBg}; color:${statusColor}; padding:4px 12px; border-radius:20px;">${statusText}</span></td>
                <td style="padding:8px;">${dueDate}</td>
                <td style="padding:8px; font-size:11px; font-family:monospace;">${ref}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot>
                <tr style="border-top:2px solid #ddd; font-weight:bold;">
                    <td style="padding:12px 8px;">Total</td>
                    <td style="padding:12px 8px;">${formatCurrency(totalPaid)}</td>
                    <td colspan="3"></td>
                </tr>
            </tfoot>
        </table>
    `;

    content.innerHTML = html;
    modal.hidden = false;
}


// ─── REPORT EXPORTS — Sprint 3 Story 6 ───────────────────────────────────────
// CSV is built in the browser — no extra API calls needed.
// PDF uses jsPDF from the CDN loaded in group-admin.html.


// Converts a 2D array into a CSV file and triggers a download.
// Each cell is quoted to handle commas inside values safely.
function downloadCSV(rows, filename) {
    const csv  = rows.map(row => row.map(cell => '"' + (cell ?? '') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Creates a PDF from headers and rows using jsPDF.
// window.jspdf.jsPDF is set by the CDN script in the HTML.
function downloadPDF(title, headers, rows, filename) {
    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF();
    const groupName = currentGroup ? currentGroup.name : 'Stokvel Group';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(groupName, 14, 18);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(title, 14, 26);

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('Exported: ' + new Date().toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric'
    }), 14, 33);
    doc.setTextColor(0);

    doc.autoTable({
        startY: 38,
        head: [headers],
        body: rows,
        styles: { fontSize: 10, cellPadding: 4 },
        headStyles: { fillColor: [14, 148, 144], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 250, 250] }
    });

    doc.save(filename);
}

// Report 1: Contribution compliance CSV
async function exportComplianceCSV() {
    if (!currentGroup) { alert('No group loaded.'); return; }
    try {
        const data = await fetchComplianceReport(currentGroup.groupId);
        const rows = [
            ['GROUP COMPLIANCE REPORT'],
            ['Group', currentGroup.name],
            ['Compliance Rate', data.groupComplianceRate + '%'],
            ['Paid Members', data.totalPaid + ' / ' + data.totalMembers],
            [],
            ['Member Name', 'Email', 'Paid', 'Missed', 'Pending', 'Rate', 'Status']
        ];
        data.members.forEach(m => {
            rows.push([m.name, m.email, m.paid, m.missed, m.pending, m.complianceRate + '%', m.status]);
        });
        downloadCSV(rows, currentGroup.name + '_contribution_compliance.csv');
    } catch (error) {
        alert('Could not export: ' + error.message);
    }
}

// Report 1: Contribution compliance PDF
async function exportCompliancePDF() {
    if (!currentGroup) { alert('No group loaded.'); return; }
    try {
        const data    = await fetchComplianceReport(currentGroup.groupId);
        const headers = ['Member', 'Email', 'Paid', 'Missed', 'Pending', 'Rate', 'Status'];
        const rows    = data.members.map(m => [m.name, m.email, m.paid, m.missed, m.pending, m.complianceRate + '%', m.status]);
        downloadPDF('Contribution Compliance Report', headers, rows, currentGroup.name + '_contribution_compliance.pdf');
    } catch (error) {
        alert('Could not export: ' + error.message);
    }
}

// Report 2: Payout history CSV
async function exportPayoutsCSV() {
    if (!currentGroup) { alert('No group loaded.'); return; }
    try {
        const payouts = await fetchPayouts(currentGroup.groupId);
        const rows    = [['Recipient Name', 'Date Initiated', 'Amount (ZAR)', 'Status', 'Transaction Ref']];
        if (!payouts || payouts.length === 0) {
            rows.push(['No payout data available', '', '', '', '']);
        } else {
            payouts.forEach(p => {
                rows.push([
                    p.recipientName || p.recipient?.name || '—',
                    p.initiatedAt ? new Date(p.initiatedAt).toLocaleDateString('en-ZA') : '—',
                    p.amount      ? parseFloat(p.amount).toFixed(2) : '—',
                    p.status      || '—',
                    p.transactionRef || '—'
                ]);
            });
        }
        downloadCSV(rows, currentGroup.name + '_payout_history.csv');
    } catch (error) {
        alert('Could not export: ' + error.message);
    }
}

// Report 2: Payout history PDF
async function exportPayoutsPDF() {
    if (!currentGroup) { alert('No group loaded.'); return; }
    try {
        const payouts = await fetchPayouts(currentGroup.groupId);
        const headers = ['Recipient', 'Date', 'Amount', 'Status', 'Reference'];
        const rows    = [];
        if (!payouts || payouts.length === 0) {
            rows.push(['No payout data available', '', '', '', '']);
        } else {
            payouts.forEach(p => {
                rows.push([
                    p.recipientName || p.recipient?.name || '—',
                    p.initiatedAt ? new Date(p.initiatedAt).toLocaleDateString('en-ZA') : '—',
                    p.amount      ? 'R ' + parseFloat(p.amount).toFixed(2) : '—',
                    p.status      || '—',
                    p.transactionRef || '—'
                ]);
            });
        }
        downloadPDF('Payout History Report', headers, rows, currentGroup.name + '_payout_history.pdf');
    } catch (error) {
        alert('Could not export: ' + error.message);
    }
}

// Report 3: Group summary CSV — uses currentGroup, no API call needed
function exportSummaryCSV() {
    if (!currentGroup) { alert('No group loaded.'); return; }
    const g    = currentGroup;
    const rows = [
        ['GROUP SUMMARY REPORT'],
        ['Group Name',    g.name],
        ['Description',   g.description || '—'],
        ['Status',        g.status],
        ['Contribution',  g.contributionAmount],
        ['Cycle Type',    g.cycleType],
        ['Start Date',    g.startDate ? new Date(g.startDate).toLocaleDateString('en-ZA') : '—'],
        ['Total Members', g.totalMembers],
        [],
        ['MEMBER LIST'],
        ['Name', 'Email', 'Role', 'Joined']
    ];
    g.members.forEach(m => {
        rows.push([m.name, m.email, m.role, m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('en-ZA') : '—']);
    });
    downloadCSV(rows, g.name + '_group_summary.csv');
}

// Report 3: Group summary PDF — uses currentGroup, no API call needed
function exportSummaryPDF() {
    if (!currentGroup) { alert('No group loaded.'); return; }
    const g       = currentGroup;
    const headers = ['Name', 'Email', 'Role', 'Joined'];
    const rows    = g.members.map(m => [
        m.name, m.email, m.role,
        m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('en-ZA') : '—'
    ]);
    downloadPDF('Group Summary Report', headers, rows, g.name + '_group_summary.pdf');
}


// ─── Event listeners ──────────────────────────────────────────────────────────

function setupEventListeners() {
    const addMemberBtn       = document.getElementById('btn-add-member');
    const memberEmail        = document.getElementById('member-email');
    const backBtn            = document.getElementById('back-btn');
    const assignTreasurerBtn = document.getElementById('btn-assign-treasurer');
    const treasurerEmail     = document.getElementById('treasurer-email');
    const viewContribBtn     = document.getElementById('view-contributions-btn');
    const payNowBtn          = document.getElementById('pay-now-btn');
    const closePayBtn        = document.getElementById('close-payment-modal');
    const cancelPayBtn       = document.getElementById('cancel-payment-btn');
    const confirmPayBtn      = document.getElementById('confirm-payment-btn');
    const payModal           = document.getElementById('payment-confirm-modal');

    if (addMemberBtn) addMemberBtn.addEventListener('click', addMember);
    if (memberEmail)  memberEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMember(); });

    if (backBtn) backBtn.addEventListener('click', () => {
        window.location.href = '../pages/dashboard.html';
    });

    if (assignTreasurerBtn) assignTreasurerBtn.addEventListener('click', assignTreasurer);
    if (treasurerEmail)     treasurerEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') assignTreasurer(); });

    if (viewContribBtn) viewContribBtn.addEventListener('click', loadAndShowContributions);

    const viewPayoutsBtn = document.getElementById('view-payouts-btn');
    if (viewPayoutsBtn) viewPayoutsBtn.addEventListener('click', () => {
        const groupId = new URLSearchParams(window.location.search).get('groupId');
        loadAndShowPayouts(groupId);
    });

    if (payNowBtn)    payNowBtn.addEventListener('click', handlePayNow);
    if (closePayBtn)  closePayBtn.addEventListener('click', closePaymentModal);
    if (cancelPayBtn) cancelPayBtn.addEventListener('click', closePaymentModal);
    if (confirmPayBtn) confirmPayBtn.addEventListener('click', handleConfirmPayment);
    if (payModal)     payModal.addEventListener('click', (e) => { if (e.target === payModal) closePaymentModal(); });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePaymentModal(); });

    // ── Export buttons — Sprint 3 Story 6 ──
    const exportMap = {
        'btn-compliance-report':  loadAndShowComplianceReport,
        'btn-payouts-report':     () => loadAndShowPayouts(currentGroup?.groupId),
        'export-compliance-csv':  exportComplianceCSV,
        'export-compliance-pdf':  exportCompliancePDF,
        'export-payouts-csv':     exportPayoutsCSV,
        'export-payouts-pdf':     exportPayoutsPDF,
        'export-summary-csv':     exportSummaryCSV,
        'export-summary-pdf':     exportSummaryPDF,
    };

    Object.entries(exportMap).forEach(([id, handler]) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', handler);
    });
}


// ─── Entry point ──────────────────────────────────────────────────────────────

function onAuthReady() {
    setAvatar();
    setupEventListeners();
    loadGroupData();
}