// ─── Helpers ──────────────────────────────────────────────────────────────────
// NOTE: currentGroup is declared in Missed-contributions.js (var currentGroup)
// which loads before this file. Do NOT redeclare it here.
// Make sure currentGroup exists (declared in Missed-contributions.js)
if (typeof currentGroup === 'undefined') {
  var currentGroup = null;
}
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


// ─── ML Financial Health Scores ───────────────────────────────────────────────

async function fetchHealthScores(groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/groups/${groupId}/health-scores`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch health scores');
    return await response.json();
}

async function loadAndRenderHealthScores(groupId) {
    const card = document.getElementById('health-score-card');
    if (!card) return;

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const token    = await auth0Client.getTokenSilently();
            const response = await fetch(`${config.apiBase}/api/groups/${groupId}/health-scores`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 503) {
                console.log(`Health model not ready, retrying in 2s (attempt ${attempt}/5)...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            if (!response.ok) throw new Error('Failed to fetch health scores');
            const data = await response.json();

            document.getElementById('group-avg-score').textContent  = data.groupScore + '%';
            document.getElementById('group-avg-label').textContent  = data.groupLabel;
            document.getElementById('group-risk-label').textContent = data.groupRisk;

            const badge = document.getElementById('group-health-badge');
            badge.textContent = data.groupLabel;
            if (data.groupScore >= 80)      { badge.style.background = '#e0f7f6'; badge.style.color = '#034e52'; }
            else if (data.groupScore >= 60) { badge.style.background = '#fef3c7'; badge.style.color = '#b45309'; }
            else if (data.groupScore >= 40) { badge.style.background = '#ffedd5'; badge.style.color = '#c2410c'; }
            else                            { badge.style.background = '#fef2f2'; badge.style.color = '#991b1b'; }

            const container = document.getElementById('health-scores-container');
            if (!data.members || data.members.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#64748b;font-size:13px;padding:1rem;">No member data available.</p>';
                card.hidden = false;
                return;
            }

            let html = `
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="border-bottom:1.5px solid #e0f7f6;">
                            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Member</th>
                            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Score</th>
                            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Paid</th>
                            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Missed</th>
                            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Status</th>
                            <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Risk</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            data.members.forEach(member => {
                let scoreBg = '#e0f7f6', scoreColor = '#034e52';
                if (member.score < 80 && member.score >= 60) { scoreBg = '#fef3c7'; scoreColor = '#b45309'; }
                if (member.score < 60 && member.score >= 40) { scoreBg = '#ffedd5'; scoreColor = '#c2410c'; }
                if (member.score < 40)                       { scoreBg = '#fef2f2'; scoreColor = '#991b1b'; }

                html += `
                    <tr style="border-bottom:1px solid #f0fafa;">
                        <td style="padding:11px 12px;">
                            <p style="font-weight:600;color:#034e52;margin:0;">${sanitise(member.name)}</p>
                            <p style="font-size:12px;color:#64748b;margin:0;">${sanitise(member.email)}</p>
                        </td>
                        <td style="padding:11px 12px;text-align:center;">
                            <span style="background:${scoreBg};color:${scoreColor};padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px;">${member.score}%</span>
                        </td>
                        <td style="padding:11px 12px;text-align:center;color:#034e52;font-weight:700;">${member.breakdown.paid}</td>
                        <td style="padding:11px 12px;text-align:center;color:#991b1b;font-weight:700;">${member.breakdown.missed}</td>
                        <td style="padding:11px 12px;text-align:center;">
                            <span style="background:${scoreBg};color:${scoreColor};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${member.label}</span>
                        </td>
                        <td style="padding:11px 12px;text-align:center;font-size:12px;color:#64748b;">${member.risk}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
            card.hidden = false;
            return;

        } catch (error) {
            console.error('Health scores error:', error);
            if (attempt === 5 && card) card.hidden = true;
        }
    }
}
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

        // Load projected savings growth chart for the treasurer
        const projUserId = localStorage.getItem('userId');
        if (projUserId) {
            await loadSavingsProjection(parseInt(projUserId), parseInt(groupId));
            await loadAndRenderHealthScores(parseInt(groupId));  // was: loadPersonalHealthScores (does not exist)
        }

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
// ─── Meetings Tab ─────────────────────────────────────────────────────────────

async function loadAndShowMeetings(groupId) {
    const container = document.getElementById('meetings-list-container');
    if (!container) return;

    container.innerHTML = '<p style="color:#64748b;font-size:13px;">Loading meetings...</p>';

    try {
        const meetings = await fetchMeetings(groupId);

        if (!meetings || meetings.length === 0) {
            container.innerHTML = '<p style="color:#64748b;font-size:13px;font-style:italic;">No meetings scheduled yet.</p>';
            return;
        }

        container.innerHTML = meetings.map(m => {
            const dateStr = new Date(m.Date).toLocaleDateString('en-ZA', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            return `
                <article class="meeting-card" id="meeting-card-${m.meetingsId}">
                    <section class="meeting-card-header">
                        <section>
                            <p class="meeting-card-title">${sanitise(m.title)}</p>
                            <p class="meeting-card-meta">📅 ${dateStr} at ${sanitise(m.Time)}</p>
                            ${m.agenda ? `<p class="meeting-card-agenda">${sanitise(m.agenda)}</p>` : ''}
                        </section>
                        <button class="btn-upload-minutes" onclick="openMinutesStep(${m.meetingsId}, 'write')">
                            Upload minutes
                        </button>
                    </section>

                    <!-- Step 1: Write -->
                    <section class="minutes-panel" id="minutes-write-${m.meetingsId}" hidden>
                        <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Step 1 — Write minutes</p>
                        <textarea
                            id="minutes-content-${m.meetingsId}"
                            rows="6"
                            placeholder="Paste or type the meeting minutes here..."
                            style="width:100%;box-sizing:border-box;padding:10px;border:1.5px solid rgba(14,148,144,0.25);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;"
                        ></textarea>
                        <section style="display:flex;gap:8px;margin-top:8px;">
                            <button class="btn-record" onclick="openMinutesStep(${m.meetingsId}, 'preview')">Preview →</button>
                            <button class="btn-cancel" onclick="closeMinutesPanel(${m.meetingsId})">Cancel</button>
                        </section>
                        <output class="form-feedback" id="minutes-write-feedback-${m.meetingsId}" hidden></output>
                    </section>

                    <!-- Step 2: Preview -->
                    <section class="minutes-panel" id="minutes-preview-${m.meetingsId}" hidden>
                        <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Step 2 — Preview</p>
                        <article style="background:#f0fafa;border-radius:8px;padding:14px 16px;border:1px solid #e0f7f6;margin-bottom:12px;">
                            <p style="font-size:13px;font-weight:700;color:#034e52;margin:0 0 6px;">${sanitise(m.title)} — Minutes</p>
                            <p style="font-size:12px;color:#64748b;margin:0 0 10px;">📅 ${dateStr}</p>
                            <p id="minutes-preview-content-${m.meetingsId}" style="font-size:13px;color:#0f172a;margin:0;white-space:pre-wrap;line-height:1.6;"></p>
                        </article>
                        <section style="display:flex;gap:8px;margin-top:8px;">
                            <button class="btn-record" onclick="submitMinutes(${m.meetingsId})">Update</button>
                            <button class="btn-cancel" onclick="openMinutesStep(${m.meetingsId}, 'write')">← Edit</button>
                            <button class="btn-cancel" onclick="closeMinutesPanel(${m.meetingsId})">Cancel</button>
                        </section>
                        <output class="form-feedback" id="minutes-preview-feedback-${m.meetingsId}" hidden></output>
                    </section>

                    <!-- Existing minutes -->
                    <section id="existing-minutes-${m.meetingsId}" style="margin-top:1rem;"></section>
                </article>
            `;
        }).join('');

        // Load existing minutes for each meeting
        meetings.forEach(m => loadExistingMinutes(m.meetingsId));

    } catch (err) {
        console.error('Error loading meetings:', err);
        container.innerHTML = '<p style="color:#991b1b;font-size:13px;">Error loading meetings. Please try again.</p>';
    }
}

function openMinutesStep(meetingId, step) {
    const writePanel   = document.getElementById(`minutes-write-${meetingId}`);
    const previewPanel = document.getElementById(`minutes-preview-${meetingId}`);

    if (step === 'write') {
        if (writePanel)   writePanel.hidden   = false;
        if (previewPanel) previewPanel.hidden = true;
        return;
    }

    if (step === 'preview') {
        const content = document.getElementById(`minutes-content-${meetingId}`).value.trim();
        const feedbackEl = document.getElementById(`minutes-write-feedback-${meetingId}`);

        if (!content) {
            feedbackEl.textContent = 'Please enter the minutes before previewing.';
            feedbackEl.className   = 'form-feedback error';
            feedbackEl.hidden      = false;
            return;
        }

        feedbackEl.hidden = true;
        document.getElementById(`minutes-preview-content-${meetingId}`).textContent = content;
        if (writePanel)   writePanel.hidden   = true;
        if (previewPanel) previewPanel.hidden = false;
    }
}

function closeMinutesPanel(meetingId) {
    const writePanel   = document.getElementById(`minutes-write-${meetingId}`);
    const previewPanel = document.getElementById(`minutes-preview-${meetingId}`);
    if (writePanel)   writePanel.hidden   = true;
    if (previewPanel) previewPanel.hidden = true;
    document.getElementById(`minutes-content-${meetingId}`).value = '';
}

async function submitMinutes(meetingId) {
    const content    = document.getElementById(`minutes-content-${meetingId}`).value.trim();
    const feedbackEl = document.getElementById(`minutes-preview-feedback-${meetingId}`);
    const editingId  = document.getElementById(`minutes-content-${meetingId}`).dataset.editingId;

    if (!content) {
        feedbackEl.textContent = 'Minutes content is empty.';
        feedbackEl.className   = 'form-feedback error';
        feedbackEl.hidden      = false;
        return;
    }

    try {
        const token = await auth0Client.getTokenSilently();

        let response;
        if (editingId) {
            // Update existing minutes
            response = await fetch(`${config.apiBase}/api/meetings/${meetingId}/minutes/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content })
            });
        } else {
            // Create new minutes
            response = await fetch(`${config.apiBase}/api/meetings/${meetingId}/minutes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content })
            });
        }

        const data = await response.json();

        if (response.ok) {
            feedbackEl.textContent = editingId ? 'Minutes updated successfully!' : 'Minutes saved successfully!';
            feedbackEl.className   = 'form-feedback success';
            feedbackEl.hidden      = false;

            // Clear editing state
            delete document.getElementById(`minutes-content-${meetingId}`).dataset.editingId;

            await loadExistingMinutes(meetingId);

            setTimeout(() => {
                closeMinutesPanel(meetingId);
                feedbackEl.hidden = true;
            }, 1500);
        } else {
            feedbackEl.textContent = data.error || 'Failed to save minutes.';
            feedbackEl.className   = 'form-feedback error';
            feedbackEl.hidden      = false;
        }
    } catch (err) {
        console.error('Submit minutes error:', err);
        feedbackEl.textContent = 'Network error. Please try again.';
        feedbackEl.className   = 'form-feedback error';
        feedbackEl.hidden      = false;
    }
}

async function loadExistingMinutes(meetingId) {
    const container = document.getElementById(`existing-minutes-${meetingId}`);
    if (!container) return;

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/meetings/${meetingId}/minutes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.minutes || data.minutes.length === 0) {
            container.innerHTML = '';
            // Show upload button if no minutes yet
            const uploadBtn = document.querySelector(`#meeting-card-${meetingId} .btn-upload-minutes`);
            if (uploadBtn) uploadBtn.hidden = false;
            return;
        }

        // Hide upload button once minutes exist
        const uploadBtn = document.querySelector(`#meeting-card-${meetingId} .btn-upload-minutes`);
        if (uploadBtn) uploadBtn.hidden = true;

        container.innerHTML = `
            <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Uploaded minutes</p>
            ${data.minutes.map(m => `
                <article style="background:#f0fafa;border-radius:8px;padding:12px 14px;margin-bottom:8px;border:1px solid #e0f7f6;">
                    <section style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
                        <p style="font-size:11px;color:#64748b;margin:0;">
                            Uploaded by <strong>${sanitise(m.users.name)}</strong> on 
                            ${new Date(m.uploadedAt).toLocaleDateString('en-ZA', {day:'numeric', month:'short', year:'numeric'})}
                        </p>
                        <section style="display:flex;gap:12px;">
                            <button 
                                onclick="editMinutes(${meetingId}, ${m.minutesId}, \`${m.content.replace(/`/g, '\\`')}\`)"
                                style="font-size:11px;font-weight:700;color:#0e9490;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;">
                                Edit
                            </button>
                            <button 
                                onclick="downloadMinutesPDF(${m.minutesId}, \`${m.content.replace(/`/g, '\\`')}\`, \`${sanitise(m.users.name)}\`, \`${new Date(m.uploadedAt).toLocaleDateString('en-ZA')}\`)"
                                style="font-size:11px;font-weight:700;color:#7c3aed;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;">
                                Download PDF
                            </button>
                        </section>
                    </section>
                    <p style="font-size:13px;color:#0f172a;margin:0;white-space:pre-wrap;line-height:1.6;">${sanitise(m.content)}</p>
                </article>
            `).join('')}
        `;
    } catch (err) {
        console.error('Error loading existing minutes:', err);
    }
}

function editMinutes(meetingId, minutesId, content) {
    const textarea = document.getElementById(`minutes-content-${meetingId}`);
    textarea.value = content;
    textarea.dataset.editingId = minutesId;
    openMinutesStep(meetingId, 'write');
    // Scroll to the panel
    document.getElementById(`minutes-write-${meetingId}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
}

//This is for making announcemets
async function handleMakeAnnouncement(e) {
    e.preventDefault();

    const titleInput    = document.getElementById('announcement-title');
    const contentInput  = document.getElementById('announcement-content');
    const submitBtn     = document.getElementById('make-announcement-btn');

    // Validate
    if (!titleInput.value.trim()) {
        showFeedback('announcement-feedback', 'Please enter an announcement title.', 'error');
        return;
    }
    if (!contentInput.value.trim()) {
        showFeedback('announcement-feedback', 'Please enter announcement content.', 'error');
        return;
    }
    if (!currentGroup || !currentGroup.groupId) {
        showFeedback('announcement-feedback', 'Group information not loaded. Please refresh.', 'error');
        return;
    }

    // Check title length (max 100)
    if (titleInput.value.trim().length > 100) {
        showFeedback('announcement-feedback', 'Announcement title cannot exceed 100 characters.', 'error');
        return;
    }
    // Check content length (max 2000)
    if (contentInput.value.trim().length > 2000) {
        showFeedback('announcement-feedback', 'Announcement content cannot exceed 2000 characters.', 'error');
        return;
    }

    // Prepare data
    const announcementData = {
        groupId: currentGroup.groupId,
        title: titleInput.value.trim(),
        content: contentInput.value.trim()
    };

    // Disable button & show loading state
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
        const token = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/announcements`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(announcementData)
        });

        const data = await response.json();

        if (response.ok || response.status === 201) {
            showFeedback('announcement-feedback', 
                `Announcement "${titleInput.value}" posted successfully!`, 
                'success'
            );
            // Clear the form
            titleInput.value = '';
            contentInput.value = '';
        } else {
            showFeedback('announcement-feedback', data.error || 'Failed to post announcement.', 'error');
        }
    } catch (err) {
        console.error('Make announcement error:', err);
        showFeedback('announcement-feedback', 'Failed to post announcement. Check console for details.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    }
}

// ─── Notifications bell — opens unified Meetings + Announcements modal ────────

function setupNotificationsBell() {
  const bell = document.getElementById('announcements-bell');
  if (bell) {
    bell.addEventListener('click', () => {
      if (currentGroup) loadAndShowNotifications(currentGroup.groupId);
    });
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

    const announcementForm = document.getElementById('make-announcement');
    if (announcementForm) {
        announcementForm.addEventListener('submit', handleMakeAnnouncement);
    }
}

function renderFooterButtons(group) {
  const footer = document.querySelector(".action-footer");
  if (!footer) return;

  footer.innerHTML = ""; // Clear everything to prevent duplicates

  //View Contributions Button
  const viewContribBtn = document.createElement("button");
  viewContribBtn.id = "view-contributions-btn";
  viewContribBtn.textContent = "View contributions";
  viewContribBtn.addEventListener("click", loadAndShowContributions);
  footer.appendChild(viewContribBtn);

  //View Payouts Button
  const viewPayoutsBtn = document.createElement("button");
  viewPayoutsBtn.id = "view-payouts-btn";
  viewPayoutsBtn.textContent = "View payouts";
  viewPayoutsBtn.addEventListener("click", () => {
    // Falls back to URL param if groupSelect isn't available (common on Admin/Treasurer pages)
    const gid = group?.groupId || new URLSearchParams(window.location.search).get('groupId');
    loadAndShowPayouts(gid);
  });
  footer.appendChild(viewPayoutsBtn);

  //Notifications Button with Badge Container
  const badgeWrapper = document.createElement("div");
  badgeWrapper.className = "badge-container"; 

  const viewNotificationsBtn = document.createElement("button");
  viewNotificationsBtn.id = "view-notifications-btn";
  viewNotificationsBtn.textContent = "Notifications";
  
  viewNotificationsBtn.addEventListener("click", () => {
    badgeWrapper.classList.remove("has-notification");
    loadAndShowNotifications(group.groupId);
  });

  badgeWrapper.appendChild(viewNotificationsBtn);
  footer.appendChild(badgeWrapper);

  // Check if we should show the red dot immediately
  checkNewNotifications(group.groupId, badgeWrapper);
}

// Helper to check for the red dot
async function checkNewNotifications(groupId, wrapper) {
  try {
    const meetings = await fetchMeetings(groupId);
    if (meetings && meetings.length > 0) {
      wrapper.classList.add("has-notification");
    }
  } catch (e) {
    console.error("Badge check failed", e);
  }
}
// ─── Entry point ──────────────────────────────────────────────────────────────
function onAuthReady() {
    setupEventListeners();
    loadGroupData();
}
// ─── Download minutes as PDF ──────────────────────────────────────────────────
function downloadMinutesPDF(minutesId, content, uploadedBy, uploadedAt) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const groupName  = currentGroup?.name || 'Group';
    const pageWidth  = doc.internal.pageSize.getWidth();
    const margin     = 20;
    const maxWidth   = pageWidth - margin * 2;

    // Header bar
    doc.setFillColor(14, 148, 144);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('STOKVEL — Meeting Minutes', margin, 18);

    // Group name & metadata
    doc.setFillColor(240, 250, 250);
    doc.rect(0, 28, pageWidth, 22, 'F');

    doc.setTextColor(3, 78, 82);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(groupName, margin, 38);

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Uploaded by: ${uploadedBy}   |   Date: ${uploadedAt}`, margin, 46);

    // Divider
    doc.setDrawColor(224, 247, 246);
    doc.setLineWidth(0.5);
    doc.line(margin, 54, pageWidth - margin, 54);

    // Minutes content
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    const lines = doc.splitTextToSize(content, maxWidth);
    let y = 64;

    lines.forEach(line => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        doc.text(line, margin, y);
        y += 7;
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated on ${new Date().toLocaleDateString('en-ZA')} — Stokvel Management System`, margin, 287);

    doc.save(`minutes-${groupName.replace(/\s+/g, '-')}-${uploadedAt}.pdf`);
}