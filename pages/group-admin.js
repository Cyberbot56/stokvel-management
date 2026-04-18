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

    const badge = document.getElementById('status-badge');
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
        const roleClass = member.role === 'admin' ? 'admin' : 'member';
        const roleLabel = member.role.charAt(0).toUpperCase() + member.role.slice(1);

        return `
            <tr>
                <td>
                    <div class="member-info">
                        <i class="member-initials ${colour}">${sanitise(initials)}</i>
                        <div>
                            <div class="member-name-text">${sanitise(member.name)}</div>
                            <div class="member-email-text">${sanitise(member.email)}</div>
                        </div>
                    </div>
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

// Checks whether the admin has paid their own contribution for the current cycle.
async function fetchPaymentStatus(userId, groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/payments/status/${userId}/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch payment status');
    return await response.json();
}

// Calls the simulate endpoint — same flow as the member page.
async function simulatePayment(userId, groupId, amount, treasurerId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/payments/simulate`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, groupId, amount, treasurerId })
    });
    if (!response.ok) throw new Error('Payment failed');
    return await response.json();
}

// Populates the payment card — looks up elements inside so no top-level null risk.
function renderPaymentCard(statusData) {
    const icon  = document.getElementById('payment-status-icon');
    const label = document.getElementById('payment-status-label');
    const sub   = document.getElementById('payment-status-sub');
    const ref   = document.getElementById('payment-ref');
    const btn   = document.getElementById('pay-now-btn');

    if (!icon || !label || !sub || !btn) return;

    if (statusData.hasPaidThisCycle) {
        const paidDate    = formatDate(statusData.lastPayment.paidAt);
        icon.textContent  = '✓';
        icon.className    = 'payment-status-icon paid-icon';
        label.textContent = 'Paid';
        label.className   = 'payment-status-label paid-label';
        sub.textContent   = `${formatCurrency(statusData.contributionAmount)} · ${paidDate}`;
        btn.hidden        = true;

        if (ref && statusData.lastPayment.transactionRef) {
            ref.textContent = `Ref: ${statusData.lastPayment.transactionRef}`;
            ref.hidden      = false;
        }
    } else {
        icon.textContent  = '!';
        icon.className    = 'payment-status-icon unpaid-icon';
        label.textContent = 'Unpaid';
        label.className   = 'payment-status-label unpaid-label';
        sub.textContent   = `${formatCurrency(statusData.contributionAmount)} due this cycle`;
        if (ref) ref.hidden = true;
        btn.hidden          = false;

        // Admin is effectively the treasurer of their own group
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

    amountEl.textContent = formatCurrency(amount);

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

// Fires when the admin clicks Confirm payment.
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

        const banner = document.getElementById('status-banner');
        banner.textContent = `Payment successful · Ref: ${result.transactionRef}`;
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
        showFeedback('Please enter a valid email address.', 'error');
        return;
    }

    if (!currentGroup) {
        showFeedback('No group loaded. Please refresh the page.', 'error');
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Adding...';

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups/add-member`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ email, groupId: currentGroup.groupId })
        });

        const data = await response.json();

        if (response.ok) {
            showFeedback(`${data.member.userName} (${data.member.userEmail}) was added to ${data.member.groupName} successfully.`, 'success');
            emailInput.value = '';
            await loadGroupData();
        } else {
            showFeedback(data.error || 'Failed to add member.', 'error');
        }

    } catch (err) {
        console.error('Add member error:', err);
        showFeedback('Something went wrong. Please try again.', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Add member';
    }
}

function showFeedback(message, type) {
    const feedback     = document.getElementById('add-feedback');
    feedback.textContent = message;
    feedback.className   = 'form-feedback ' + type;
    feedback.hidden      = false;
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

        // If user is not admin, redirect to regular group overview
        if (group.userRole !== 'admin') {
            window.location.href = `group-overview.html?groupId=${groupId}`;
            return;
        }

        currentGroup = group;
        renderGroupHeader(group);
        renderMembers(group.members);

        // Fetch and render the admin's own payment status for this group
        const statusData = await fetchPaymentStatus(parseInt(userId), parseInt(groupId));
        renderPaymentCard(statusData);

    } catch (err) {
        console.error('Load error:', err);
        banner.textContent = 'Error loading group data. Please try again.';
        banner.className   = 'status-banner closed';
        banner.hidden      = false;
    }
}


// ─── Contribution history ─────────────────────────────────────────────────────

// The admin can view their own contribution history for the group.
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
        console.error('Error loading contributions:', error);
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
                </tr>
            </thead>
            <tbody>
    `;

    contributions.forEach(contrib => {
        totalPaid += parseFloat(contrib.amount);
        const paidDate = contrib.paidAt  ? new Date(contrib.paidAt).toLocaleDateString()  : '—';
        const dueDate  = contrib.dueDate ? new Date(contrib.dueDate).toLocaleDateString() : '—';

        let statusColor = '#2b7e3a', statusBg = '#2b7e3a20';
        if (contrib.status === 'pending')                                      { statusColor = '#ff9800'; statusBg = '#ff980020'; }
        else if (contrib.status === 'missed' || contrib.status === 'overdue') { statusColor = '#f44336'; statusBg = '#f4433620'; }

        html += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px;">${paidDate}</td>
                <td style="padding:8px;">${formatCurrency(parseFloat(contrib.amount))}</td>
                <td style="padding:8px;"><span style="background:${statusBg}; color:${statusColor}; padding:4px 12px; border-radius:20px;">${contrib.status}</span></td>
                <td style="padding:8px;">${dueDate}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot>
                <tr style="border-top:2px solid #ddd; font-weight:bold;">
                    <td style="padding:12px 8px;">Total</td>
                    <td style="padding:12px 8px;">${formatCurrency(totalPaid)}</td>
                    <td colspan="2"></td>
                </tr>
            </tfoot>
        </table>
    `;

    content.innerHTML = html;
    modal.hidden = false;
}


// ─── Event listeners ──────────────────────────────────────────────────────────

function setupEventListeners() {
    document.getElementById('btn-add-member').addEventListener('click', addMember);

    document.getElementById('member-email').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addMember();
    });

    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = '../pages/dashboard.html';
    });

    const viewContribBtn = document.getElementById('view-contributions-btn');
    if (viewContribBtn) viewContribBtn.addEventListener('click', loadAndShowContributions);

    // Payment modal buttons — guarded in case HTML is not yet updated
    const payNowBtn       = document.getElementById('pay-now-btn');
    const closePayBtn     = document.getElementById('close-payment-modal');
    const cancelPayBtn    = document.getElementById('cancel-payment-btn');
    const confirmPayBtn   = document.getElementById('confirm-payment-btn');
    const payConfirmModal = document.getElementById('payment-confirm-modal');

    if (payNowBtn) {
        payNowBtn.addEventListener('click', () => {
            openPaymentConfirmModal(
                parseInt(payNowBtn.dataset.userid),
                parseInt(payNowBtn.dataset.groupid),
                parseFloat(payNowBtn.dataset.amount),
                parseInt(payNowBtn.dataset.treasurerid)
            );
        });
    }

    if (closePayBtn)  closePayBtn.addEventListener('click', closePaymentModal);
    if (cancelPayBtn) cancelPayBtn.addEventListener('click', closePaymentModal);

    if (confirmPayBtn) confirmPayBtn.addEventListener('click', handleConfirmPayment);

    if (payConfirmModal) {
        payConfirmModal.addEventListener('click', (e) => {
            if (e.target === payConfirmModal) closePaymentModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePaymentModal();
    });
}


// ─── Entry point ──────────────────────────────────────────────────────────────
// onAuthReady is called by auth_service.js once auth0Client is fully initialised

function onAuthReady() {
    setAvatar();
    setupEventListeners();
    loadGroupData();
}