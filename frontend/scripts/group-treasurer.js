
// ─── Helpers ──────────────────────────────────────────────────────────────────
const sanitise = (str) => {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
};

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function showFeedback(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = 'form-feedback ' + type;
    el.hidden = false;
    if (type === 'success') setTimeout(() => { el.hidden = true; }, 6000);
}

// ─── Populate recipient dropdown ──────────────────────────────────────────────
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

// ─── Render payout history ────────────────────────────────────────────────────
function renderPayouts(payouts) {
    const container = document.getElementById('payouts-container');
    const countEl   = document.getElementById('payout-count');
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
                <td><strong>${sanitise(p.recipientName)}</strong></td>
                <td>${formatCurrency(p.amount)}</td>
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
                    <th scope="col">Recipient</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Cycle</th>
                    <th scope="col">Status</th>
                    <th scope="col">Initiated</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ─── Load payout history ──────────────────────────────────────────────────────
async function loadPayouts() {
    if (!currentGroup) return;
    try {
        const token    = await auth0Client.getTokenSilently();
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

// ─── Initiate payout ──────────────────────────────────────────────────────────
async function initiatePayout() {
    const select     = document.getElementById('payout-recipient');
    const cycleInput = document.getElementById('payout-cycle');
    const notes      = document.getElementById('payout-notes').value.trim();
    const btn        = document.getElementById('btn-initiate-payout');

    const recipientId   = select.value;
    const recipientName = select.options[select.selectedIndex]?.dataset.name || '';
    const cycleNumber   = cycleInput.value;

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
        btn.disabled    = true;
        btn.textContent = 'Initiating...';
        document.getElementById('payout-feedback').hidden = true;

        try {
            const token    = await auth0Client.getTokenSilently();
            const response = await fetch(`${config.apiBase}/api/payouts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    groupId:     currentGroup.groupId,
                    recipientId: parseInt(recipientId),
                    recipientName,
                    amount,
                    cycleNumber: parseInt(cycleNumber),
                    notes:       notes || null
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
            btn.disabled    = false;
            btn.textContent = 'Initiate Payout';
        }
    };
}

// ─── Update payout status ─────────────────────────────────────────────────────
async function updatePayoutStatus(payoutId, status) {
    try {
        const token    = await auth0Client.getTokenSilently();
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

// // ─── Load group data ──────────────────────────────────────────────────────────
// async function loadGroupData() {
//     const userId    = localStorage.getItem('userId');
//     const urlParams = new URLSearchParams(window.location.search);
//     const groupId   = urlParams.get('groupId');
//     const banner    = document.getElementById('status-banner');

//     if (!userId || !groupId) {
//         banner.textContent = 'Missing session data. Please log in again.';
//         banner.className   = 'status-banner closed';
//         banner.hidden      = false;
//         return;
//     }

//     try {
//         const token    = await auth0Client.getTokenSilently();
//         const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
//             headers: { 'Authorization': `Bearer ${token}` }
//         });

//         if (!response.ok) throw new Error(`Server error: ${response.status}`);

//         const groups = await response.json();
//         const group  = groups.find(g => String(g.groupId) === String(groupId));

//         if (!group) {
//             banner.textContent = 'Group not found or you are not a member.';
//             banner.className   = 'status-banner closed';
//             banner.hidden      = false;
//             return;
//         }

//         // Only treasurers can access this page
//         if (group.userRole !== 'treasurer') {
//             window.location.href = `group-overview.html?groupId=${groupId}`;
//             return;
//         }

//         currentGroup = group;
//         populateRecipientDropdown(group.members);
//         updatePayoutPreview();
//         await loadPayouts();

//     } catch (err) {
//         console.error('Load error:', err);
//         banner.textContent = 'Error loading group data. Please try again.';
//         banner.className   = 'status-banner closed';
//         banner.hidden      = false;
//     }
// }

async function loadGroupData() {
    const userId    = localStorage.getItem('userId');
    const urlParams = new URLSearchParams(window.location.search);
    const groupId   = urlParams.get('groupId');

    console.log('userId:', userId);
    console.log('groupId:', groupId);

    const banner = document.getElementById('status-banner');

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
        console.log('all groups returned:', groups);

        const group  = groups.find(g => String(g.groupId) === String(groupId));
        console.log('matched group:', group);
        console.log('userRole:', group?.userRole);
        console.log('members:', group?.members);

        if (!group) {
            banner.textContent = 'Group not found or you are not a member.';
            banner.className   = 'status-banner closed';
            banner.hidden      = false;
            return;
        }

        if (group.userRole !== 'treasurer') {
            console.log('Not a treasurer, redirecting...');
            window.location.href = `group-overview.html?groupId=${groupId}`;
            return;
        }

        currentGroup = group;
        console.log('currentGroup set:', currentGroup);
        console.log('members to populate:', group.members);

        renderFooterButtons(group);

        populateRecipientDropdown(group.members);
        updatePayoutPreview();
        await loadPayouts();

    } catch (err) {
        console.error('Load error:', err);
        banner.textContent = 'Error loading group data. Please try again.';
        banner.className   = 'status-banner closed';
        banner.hidden      = false;
    }
}

//This is a function to handle scheduling a meeting.
//It validates the input fields, prepare the data then send them to the post api on server.js
//It makes the inputs empty after a successful submission and shows feedback to the user. If there is an error, it shows an error message.
async function handleScheduleMeeting(e) {
    e.preventDefault();

    const titleInput   = document.getElementById('meeting-title');
    const agendaInput  = document.getElementById('meeting-agenda');
    const dateInput    = document.getElementById('meeting-date');
    const timeInput    = document.getElementById('meeting-time');
    const submitBtn    = document.getElementById('sch-meeting');

    // Validate
    if (!titleInput.value.trim()) {
        showFeedback('meeting-feedback', 'Please enter a meeting title.', 'error');
        return;
    }
    if (!dateInput.value) {
        showFeedback('meeting-feedback', 'Please select a meeting date.', 'error');
        return;
    }
    if (!timeInput.value) {
        showFeedback('meeting-feedback', 'Please select a meeting time.', 'error');
        return;
    }
    if (!currentGroup || !currentGroup.groupId) {
        showFeedback('meeting-feedback', 'Group information not loaded. Please refresh.', 'error');
        return;
    }
    //This is to check if the selected date and time is in the past.
    //It combines the date and time inputs into a single Date object and compares it to the current date and time.
    if (new Date(`${dateInput.value}T${timeInput.value}`) < new Date()) {
        showFeedback('meeting-feedback', 'Meeting date and time must be in the future.', 'error');
        return;
    }

    //This is to check the length of the tittle if it is more than 100 characters, it will show an error message.
    if (titleInput.value.trim().length > 100) {
        showFeedback('meeting-feedback', 'Meeting title cannot exceed 100 characters.', 'error');
        return;
    }
    //This checks the lenght of the agenda if it is more than 500 characters, it will show an error message.
    if (agendaInput.value.trim().length > 500) {
        showFeedback('meeting-feedback', 'Meeting agenda cannot exceed 500 characters.', 'error');
        return;
    }
    // Prepare data
    const meetingData = {
        groupId: currentGroup.groupId,
        title: titleInput.value.trim(),
        agenda: agendaInput.value.trim() || null,   // allow empty agenda
        date: dateInput.value,                      // "2026-04-27"
        time: timeInput.value                       // "14:30"
    };

    // Disable button & show loading state
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Scheduling...';

    try {
        const token = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/meetings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(meetingData)
        });

        const data = await response.json();

        if (response.ok) {
            showFeedback('meeting-feedback', 
                `Meeting "${titleInput.value}" scheduled successfully for ${dateInput.value} at ${timeInput.value}.`, 
                'success'
            );
            // Optional: clear the form
            titleInput.value = '';
            agendaInput.value = '';
            dateInput.value = '';
            timeInput.value = '';
        } else {
            showFeedback('meeting-feedback', data.error || 'Failed to schedule meeting.', 'error');
        }
    } catch (err) {
        console.error('Schedule meeting error:', err);
        showFeedback('meeting-feedback', 'Network error. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
    const backBtn           = document.getElementById('back-btn');
    const initiatePayoutBtn = document.getElementById('btn-initiate-payout');
    const modalCancelBtn    = document.getElementById('modal-cancel-btn');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '../pages/dashboard.html';
        });
    }

    if (initiatePayoutBtn) initiatePayoutBtn.addEventListener('click', initiatePayout);

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', () => {
            document.getElementById('confirm-modal').hidden = true;
        });
    }
    
    const scheduleForm = document.getElementById('schedule-meeting');
    if (scheduleForm) {
        scheduleForm.addEventListener('submit', handleScheduleMeeting);
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
function onAuthReady() {
    setupEventListeners();
    loadGroupData();
}
