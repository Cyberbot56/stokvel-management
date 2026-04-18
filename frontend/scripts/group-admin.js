// ─── State ────────────────────────────────────────────────────────────────────
let currentGroup = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
        style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

const setAvatar = () => {
    const name = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
};

function showFeedback(elementId, message, type) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = 'form-feedback ' + type;
    el.hidden = false;
}

// ─── Render group header ───────────────────────────────────────────────────────
function renderGroupHeader(group) {
    document.getElementById('group-name').textContent = sanitise(group.name);
    document.getElementById('group-desc').textContent = sanitise(group.description) || 'No description provided.';

    const badge = document.getElementById('status-badge');
    badge.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
    badge.className = 'badge ' + group.status;

    document.getElementById('stat-members').textContent = group.totalMembers;
    document.getElementById('stat-amount').textContent = formatCurrency(group.contributionAmount);
    document.getElementById('stat-cycle').textContent = group.cycleType;
    document.getElementById('stat-start').textContent = formatDate(group.startDate);
}

// ─── Render members table ──────────────────────────────────────────────────────
function renderMembers(members) {
    const container = document.getElementById('members-container');
    const countEl = document.getElementById('member-count');
    countEl.textContent = members.length + ' total';

    if (members.length === 0) {
        container.innerHTML = '<p class="empty-members">No members yet.</p>';
        return;
    }

    const AVATAR_COLOURS = ['av-teal', 'av-blue', 'av-purple', 'av-coral'];
    const rows = members.map((member, index) => {
        const colour = AVATAR_COLOURS[index % AVATAR_COLOURS.length];
        return `
            <tr>
                <td>
                    <div class="member-info">
                        <div class="member-initials ${colour}">${sanitise(getInitials(member.name))}</div>
                        <div>
                            <div class="member-name-text">${sanitise(member.name)}</div>
                            <div class="member-email-text">${sanitise(member.email)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="role-badge ${member.role}">${member.role.charAt(0).toUpperCase() + member.role.slice(1)}</span></td>
                <td class="joined-date">${formatDate(member.joinedAt)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="members-table">
            <thead><tr><th>Member</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ─── Populate recipient dropdown ───────────────────────────────────────────────
function populateRecipientDropdown(members) {
    const select = document.getElementById('payout-recipient');
    select.innerHTML = '<option value="">— Select a member —</option>';
    members.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.userId;
        opt.dataset.name = member.name;
        opt.textContent = `${member.name} (${member.email})`;
        select.appendChild(opt);
    });
}

// ─── Update payout amount preview ─────────────────────────────────────────────
function updatePayoutPreview() {
    if (!currentGroup) return;
    const totalPayout = currentGroup.contributionAmount * currentGroup.totalMembers;
    document.getElementById('payout-amount-display').textContent = formatCurrency(totalPayout);
}

// ─── Render payout history ─────────────────────────────────────────────────────
function renderPayouts(payouts) {
    const container = document.getElementById('payouts-container');
    const countEl = document.getElementById('payout-count');
    countEl.textContent = payouts.length + ' total';

    if (payouts.length === 0) {
        container.innerHTML = '<p class="empty-payouts">No payouts have been initiated yet.</p>';
        return;
    }

    const rows = payouts.map(p => {
        const actionBtns = p.status === 'pending'
            ? `<button class="btn-complete" onclick="updatePayoutStatus(${p.payoutId}, 'completed')">Mark complete</button>
               <button class="btn-cancel-payout" onclick="updatePayoutStatus(${p.payoutId}, 'cancelled')">Cancel</button>`
            : '—';

        return `
            <tr>
                <td><strong style="color:#034e52;">${sanitise(p.recipientName)}</strong></td>
                <td style="font-weight:700;color:#034e52;">${formatCurrency(p.amount)}</td>
                <td>Cycle ${p.cycleNumber}</td>
                <td><span class="status-pill ${p.status}">${p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span></td>
                <td>${formatDateTime(p.initiatedAt)}</td>
                <td class="ref-text">${sanitise(p.transactionRef || '—')}</td>
                <td>${actionBtns}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="payouts-table">
            <thead>
                <tr>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Cycle</th>
                    <th>Status</th>
                    <th>Initiated</th>
                    <th>Reference</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ─── Load payout history ───────────────────────────────────────────────────────
async function loadPayouts() {
    if (!currentGroup) return;
    try {
        const token = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/payouts/group/${currentGroup.groupId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const payouts = await response.json();
        renderPayouts(payouts);
    } catch (err) {
        console.error('Error loading payouts:', err);
        document.getElementById('payouts-container').innerHTML =
            '<p class="empty-payouts">Error loading payout history.</p>';
    }
}

// ─── Initiate payout ───────────────────────────────────────────────────────────
async function initiatePayout() {
    const select = document.getElementById('payout-recipient');
    const cycleInput = document.getElementById('payout-cycle');
    const notes = document.getElementById('payout-notes').value.trim();
    const btn = document.getElementById('btn-initiate-payout');

    const recipientId = select.value;
    const recipientName = select.options[select.selectedIndex]?.dataset.name || '';
    const cycleNumber = cycleInput.value;

    // Validate
    if (!recipientId) {
        showFeedback('payout-feedback', 'Please select a recipient.', 'error');
        return;
    }
    if (!cycleNumber || parseInt(cycleNumber) < 1) {
        showFeedback('payout-feedback', 'Please enter a valid cycle number.', 'error');
        return;
    }

    const amount = currentGroup.contributionAmount * currentGroup.totalMembers;

    // Show confirm modal
    document.getElementById('confirm-modal-body').textContent =
        `You are about to initiate a payout of ${formatCurrency(amount)} to ${recipientName} for Cycle ${cycleNumber}. This action will be recorded and cannot be undone.`;
    document.getElementById('confirm-modal').hidden = false;

    // Handle confirm
    document.getElementById('modal-confirm-btn').onclick = async () => {
        document.getElementById('confirm-modal').hidden = true;
        btn.disabled = true;
        btn.textContent = 'Initiating...';
        document.getElementById('payout-feedback').hidden = true;

        try {
            const token = await auth0Client.getTokenSilently();
            const response = await fetch(`${config.apiBase}/api/payouts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    groupId: currentGroup.groupId,
                    recipientId: parseInt(recipientId),
                    recipientName,
                    amount,
                    cycleNumber: parseInt(cycleNumber),
                    notes: notes || null
                })
            });

            const data = await response.json();

            if (response.ok) {
                showFeedback('payout-feedback',
                    `Payout of ${formatCurrency(amount)} to ${recipientName} initiated successfully. Ref: ${data.payout.transactionRef}`,
                    'success'
                );
                // Reset form
                select.value = '';
                cycleInput.value = '';
                document.getElementById('payout-notes').value = '';
                // Reload payout history
                await loadPayouts();
            } else {
                showFeedback('payout-feedback', data.error || 'Failed to initiate payout.', 'error');
            }
        } catch (err) {
            console.error('Payout error:', err);
            showFeedback('payout-feedback', 'Something went wrong. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Initiate Payout';
        }
    };
}

// ─── Update payout status ──────────────────────────────────────────────────────
async function updatePayoutStatus(payoutId, status) {
    try {
        const token = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/payouts/${payoutId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            await loadPayouts();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to update payout status.');
        }
    } catch (err) {
        console.error('Error updating payout:', err);
        alert('Something went wrong. Please try again.');
    }
}

// ─── Add member ────────────────────────────────────────────────────────────────
async function addMember() {
    const emailInput = document.getElementById('member-email');
    const btn = document.getElementById('btn-add-member');
    const email = emailInput.value.trim();

    emailInput.classList.remove('input-error');
    document.getElementById('add-feedback').hidden = true;

    if (!email || !email.includes('@')) {
        emailInput.classList.add('input-error');
        showFeedback('add-feedback', 'Please enter a valid email address.', 'error');
        return;
    }

    if (!currentGroup) {
        showFeedback('add-feedback', 'No group loaded. Please refresh the page.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
        const token = await auth0Client.getTokenSilently();
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
            showFeedback('add-feedback',
                `${data.member.userName} was added to ${data.member.groupName} successfully.`,
                'success'
            );
            emailInput.value = '';
            await loadGroupData();
        } else {
            showFeedback('add-feedback', data.error || 'Failed to add member.', 'error');
        }
    } catch (err) {
        console.error('Add member error:', err);
        showFeedback('add-feedback', 'Something went wrong. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add member';
    }
}

// ─── Load group data ───────────────────────────────────────────────────────────
async function loadGroupData() {
    const userId = localStorage.getItem('userId');
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('groupId');
    const banner = document.getElementById('status-banner');

    if (!userId || !groupId) {
        banner.textContent = 'Missing session data. Please log in again.';
        banner.className = 'status-banner closed';
        banner.hidden = false;
        return;
    }

    try {
        const token = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const groups = await response.json();
        const group = groups.find(g => String(g.groupId) === String(groupId));

        if (!group) {
            banner.textContent = 'Group not found or you are not a member.';
            banner.className = 'status-banner closed';
            banner.hidden = false;
            return;
        }

        if (group.userRole !== 'admin') {
            window.location.href = `group-overview.html?groupId=${groupId}`;
            return;
        }

        currentGroup = group;
        renderGroupHeader(group);
        renderMembers(group.members);
        populateRecipientDropdown(group.members);
        updatePayoutPreview();
        await loadPayouts();

    } catch (err) {
        console.error('Load error:', err);
        const banner = document.getElementById('status-banner');
        banner.textContent = 'Error loading group data. Please try again.';
        banner.className = 'status-banner closed';
        banner.hidden = false;
    }
}

// ─── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('btn-add-member').addEventListener('click', addMember);
document.getElementById('member-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addMember();
});
document.getElementById('btn-initiate-payout').addEventListener('click', initiatePayout);
document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    document.getElementById('confirm-modal').hidden = true;
});
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '../pages/dashboard.html';
});

// ─── Entry point ───────────────────────────────────────────────────────────────
function onAuthReady() {
    setAvatar();
    loadGroupData();
}
