// =======================================================
// missed-contributions.js - Combined Treasurer Functionality
// Handles: Payment Recording & Missed Contributions Flagging
// =======================================================

var currentGroupId = new URLSearchParams(window.location.search).get('groupId');
var pendingFlagId = null;
var allContributions = [];
var treasurerId = localStorage.getItem("userId");
var currentGroup = null;
var currentFilter = 'all';

// ── Helper Functions ───────────────────────────────────
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(amount);
}

// ── Get Auth Token ─────────────────────────────────────
async function getAuthToken() {
  try {
    return await auth0Client.getTokenSilently();
  } catch (error) {
    console.error("Token error:", error);
    return null;
  }
}

// ── Payment Simulation Functions ───────────────────────
async function fetchPaymentStatus(userId, groupId) {
  const token = await getAuthToken();
  const response = await fetch(`${config.apiBase}/api/payments/status/${userId}/${groupId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch payment status');
  return await response.json();
}

async function simulatePayment(userId, groupId, amount, treasurerId) {
  const token = await getAuthToken();
  const response = await fetch(`${config.apiBase}/api/payments/simulate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId, groupId, amount, treasurerId })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Payment failed');
  }
  return await response.json();
}

function openPaymentConfirmModal(userId, groupId, amount, treasurerId) {
  const modal = document.getElementById('payment-confirm-modal');
  const amountEl = document.getElementById('confirm-amount-display');
  const confirmBtn = document.getElementById('confirm-payment-btn');

  if (!modal || !amountEl || !confirmBtn) {
    console.error('Modal elements not found');
    return;
  }

  amountEl.textContent = formatCurrency(amount);

  confirmBtn.dataset.userid = userId;
  confirmBtn.dataset.groupid = groupId;
  confirmBtn.dataset.amount = amount;
  confirmBtn.dataset.treasurerid = treasurerId;

  modal.hidden = false;
}

function closePaymentModal() {
  const modal = document.getElementById('payment-confirm-modal');
  if (modal) modal.hidden = true;
}

async function handleConfirmPayment() {
  const confirmBtn = document.getElementById('confirm-payment-btn');
  if (!confirmBtn) return;

  const userId = parseInt(confirmBtn.dataset.userid);
  const groupId = parseInt(confirmBtn.dataset.groupid);
  const amount = parseFloat(confirmBtn.dataset.amount);
  const treasurerId = parseInt(confirmBtn.dataset.treasurerid);

  confirmBtn.textContent = 'Processing...';
  confirmBtn.disabled = true;

  try {
    const result = await simulatePayment(userId, groupId, amount, treasurerId);
    console.log('Payment initiated:', result);
    closePaymentModal();

    const banner = document.getElementById('status-banner');
    banner.textContent = `✅ Payment initiated! Reference: ${result.transactionRef}. Awaiting treasurer approval.`;
    banner.className = 'status-banner success';
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 5000);

    await loadPaymentTracking();
    await loadContributions();

  } catch (error) {
    console.error('Payment error:', error);
    alert('Payment failed: ' + error.message);
  } finally {
    confirmBtn.textContent = 'Confirm Payment';
    confirmBtn.disabled = false;
  }
}

async function handleSimulatePayment() {
  const userId = localStorage.getItem('userId');
  const groupId = currentGroupId;
  const amount = currentGroup?.contributionAmount;
  
  if (!userId || !groupId || !amount) {
    alert('Missing payment information. Please refresh the page.');
    return;
  }
  
  try {
    const paymentStatus = await fetchPaymentStatus(parseInt(userId), parseInt(groupId));
    
    if (paymentStatus.hasPaidThisCycle) {
      alert('You have already paid for this cycle!');
      return;
    }
    
    if (paymentStatus.hasPendingPayment) {
      alert('You already have a pending payment. Please wait for treasurer approval.');
      return;
    }
    
    openPaymentConfirmModal(
      parseInt(userId),
      parseInt(groupId),
      parseFloat(amount),
      parseInt(userId)
    );
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    alert('Unable to process payment. Please try again.');
  }
}

// ── Back Button ────────────────────────────────────────
function setupBackLink() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = 'dashboard.html';
    };
  }
}

const setAvatar = () => {
  const name = localStorage.getItem('userName') || '';
  const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
  const avatar = document.getElementById('avatar');
  if (avatar) avatar.textContent = initials || '?';
};

// ── View Contributions Button ─────────────────────────────────
function setupViewContributionsButton() {
  const viewContribBtn = document.getElementById('view-contributions-btn');
  if (viewContribBtn) {
    viewContribBtn.addEventListener('click', loadAndShowContributions);
  }
}

function setupPaymentSimulationButton() {
  const simulateBtn = document.getElementById('simulate-payment-btn');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', handleSimulatePayment);
  }
  
  const closePayBtn = document.getElementById('close-payment-modal');
  const cancelPayBtn = document.getElementById('cancel-payment-btn');
  const confirmPayBtn = document.getElementById('confirm-payment-btn');
  const payConfirmModal = document.getElementById('payment-confirm-modal');

  if (closePayBtn) closePayBtn.addEventListener('click', closePaymentModal);
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

async function loadAndShowContributions() {
  const userId = localStorage.getItem('userId');
  
  if (!currentGroupId) {
    alert("No group selected");
    return;
  }
  
  if (!userId) {
    alert("User not found. Please log in again.");
    return;
  }
  
  try {
    const token = await getAuthToken();
    const response = await fetch(`${config.apiBase}/api/contributions/${userId}/${currentGroupId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) throw new Error("Failed to load contributions");
    
    const data = await response.json();
    displayContributionsModal(data.contributions);
    
  } catch (error) {
    console.error("Error loading contributions:", error);
    alert("Could not load contributions: " + error.message);
  }
}

function displayContributionsModal(contributions) {
  let modal = document.getElementById("contributions-modal");
  
  if (!modal) {
    modal = document.createElement("aside");
    modal.id = "contributions-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <article class="modal">
        <header class="modal-header">
          <h2 class="modal-title">My Contribution History</h2>
          <button class="modal-close" aria-label="Close contributions">✕</button>
        </header>
        <div id="contributions-content" class="modal-section"></div>
      </article>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector(".modal-close").addEventListener("click", () => {
      modal.hidden = true;
    });
    
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  }
  
  const content = document.getElementById("contributions-content");
  
  if (!contributions || contributions.length === 0) {
    content.innerHTML = '<p style="text-align:center; padding: 2rem;">No contributions found yet.</p>';
  } else {
    let totalPaid = 0;
    let html = `
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #ddd;">
            <th style="padding:8px; text-align:left;">Date</th>
            <th style="padding:8px; text-align:left;">Amount</th>
            <th style="padding:8px; text-align:left;">Status</th>
            <th style="padding:8px; text-align:left;">Due Date</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    contributions.forEach(contrib => {
      totalPaid += parseFloat(contrib.amount);
      const paidDate = contrib.paidAt ? new Date(contrib.paidAt).toLocaleDateString() : "—";
      const dueDate = contrib.dueDate ? new Date(contrib.dueDate).toLocaleDateString() : "—";
      
      let statusColor = "#2b7e3a";
      let statusBg = "#2b7e3a20";
      let statusText = contrib.status;
      
      if (contrib.status === "pending") {
        statusColor = "#ff9800";
        statusBg = "#ff980020";
        statusText = "Pending";
      } else if (contrib.status === "paid") {
        statusColor = "#2b7e3a";
        statusBg = "#2b7e3a20";
        statusText = "Paid";
      } else if (contrib.status === "missed") {
        statusColor = "#f44336";
        statusBg = "#f4433620";
        statusText = "Missed";
      } else if (contrib.status === "Not Paid") {
        statusColor = "#64748b";
        statusBg = "#e2e8f0";
        statusText = "Not Paid";
      }
      
      html += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${paidDate}</td>
          <td style="padding:8px;">${formatCurrency(parseFloat(contrib.amount))}</td>
          <td style="padding:8px;"><span style="background:${statusBg}; color:${statusColor}; padding:4px 12px; border-radius:20px;">${statusText}</span></td>
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
  }
  
  modal.hidden = false;
}

// ── Load Members ───────────────────────────────────────
async function loadMembers() {
  const userId = localStorage.getItem('userId');
  if (!userId || !currentGroupId) return;

  try {
    const token = await getAuthToken();

    const res = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const groups = await res.json();
    const group = groups.find(g => String(g.groupId) === String(currentGroupId));
    
    currentGroup = group;

    if (!group) return;

    const select = document.getElementById("member-select");
    select.innerHTML = '<option value="">Choose a member...</option>';

    group.members.forEach(member => {
      const option = document.createElement("option");
      option.value = member.userId;
      option.textContent = member.name;
      select.appendChild(option);
    });

  } catch (err) {
    console.error("Members error:", err);
  }
}

// ── Payment Tracking Table (Flag button shows for ALL EXCEPT paid) ─────────────
async function loadPaymentTracking() {
    const tbody = document.getElementById("member-list-body");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;

    try {
        const token = await getAuthToken();

        const res = await fetch(`${config.apiBase}/api/group-members-with-status/${currentGroupId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const result = await res.json();

        if (!result.members || result.members.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4">No members found</td></tr>`;
            return;
        }

        tbody.innerHTML = "";

        result.members.forEach(member => {
            const row = document.createElement("tr");
            
            let statusText = member.contributionStatus;
            let statusColor = "";
            
            if (member.contributionStatus === "Not Paid") {
                statusColor = "#64748b";
            } else if (member.contributionStatus === "pending") {
                statusColor = "#ff9800";
            } else if (member.contributionStatus === "paid") {
                statusColor = "#2b7e3a";
            } else if (member.contributionStatus === "missed") {
                statusColor = "#f44336";
            }
            
            const dueDateFormatted = member.dueDate ? new Date(member.dueDate).toLocaleDateString() : "—";
            
            // Show flag button for ALL EXCEPT paid status
            let actionContent = '—';
            if (member.contributionId && member.contributionStatus !== 'paid') {
                actionContent = `<button class="btn-flag" data-contribution-id="${member.contributionId}" data-member-name="${escapeHtml(member.name)}">Flag</button>`;
            }
            
            row.innerHTML = `
                <td style="padding: 11px 12px;">${escapeHtml(member.name)}</td>
                <td style="padding: 11px 12px;">${dueDateFormatted}</td>
                <td style="padding: 11px 12px;"><span style="color:${statusColor}; font-weight:600;">${statusText}</span></td>
                <td style="padding: 11px 12px;">
                    ${actionContent}
                </td>
            `;

            tbody.appendChild(row);
        });
        
        // Add event listeners to flag buttons
        document.querySelectorAll('#member-list-body .btn-flag').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const contributionId = parseInt(btn.dataset.contributionId);
                const memberName = btn.dataset.memberName;
                openFlagModal(contributionId, memberName);
            });
        });
        
        const memberCountEl = document.getElementById('member-count');
        if (memberCountEl) {
            memberCountEl.textContent = `${result.members.length} total`;
        }

    } catch (err) {
        console.error("Tracking error:", err);
        tbody.innerHTML = `<tr><td colspan="4">Error loading data: ${err.message}</td></tr>`;
    }
}

function showFeedback(message, type) {
  const el = document.getElementById('payment-feedback');
  if (!el) return;

  el.textContent = message;
  el.className = `form-feedback ${type}`;
  el.hidden = false;

  setTimeout(() => {
    el.hidden = true;
  }, 3000);
}

// ── Record Payment ─────────────────────────────────────────────────────
async function recordPayment(e) {
  e.preventDefault();

  const userId = document.getElementById('member-select').value;
  const amount = document.getElementById('payment-amount').value;
  const paidAt = document.getElementById('payment-date').value;

  if (!userId || !amount || !paidAt) {
    showFeedback("Please fill in all fields", "error");
    return;
  }

  try {
    const token = await getAuthToken();

    const res = await fetch(`${config.apiBase}/api/contributions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: parseInt(userId),
        groupId: parseInt(currentGroupId),
        amount: parseFloat(amount),
        treasurerId: parseInt(treasurerId),
        paidAt
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed");
    }

    showFeedback("Contribution recorded successfully", "success");

    e.target.reset();

    await loadPaymentTracking();
    await loadContributions();
    await updateTotalCollected();

  } catch (error) {
    showFeedback(error.message || "Failed to record contribution", "error");
  }
}

// ── Load Contributions (Missed Section) ────────────────
async function loadContributions() {
    try {
        const token = await getAuthToken();

        const res = await fetch(`${config.apiBase}/api/group-members-with-status/${currentGroupId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const result = await res.json();
        
        if (!result.members || result.members.length === 0) {
            document.getElementById('emptyState').hidden = false;
            document.getElementById('tableContainer').hidden = true;
            return;
        }

        document.getElementById('emptyState').hidden = true;
        document.getElementById('tableContainer').hidden = false;
        
        allContributions = result.members;
        renderContributionsTable(allContributions, currentFilter);
        
        const missedCount = allContributions.filter(m => m.contributionStatus === 'missed').length;
        const missedCountEl = document.getElementById('missedCount');
        if (missedCountEl) {
            missedCountEl.textContent = `${missedCount} missed`;
        }

    } catch (err) {
        console.error(err);
        document.getElementById('errorBanner').textContent = 'Failed to load contributions';
        document.getElementById('errorBanner').hidden = false;
    }
}

function renderContributionsTable(members, filter = 'all') {
    const tbody = document.getElementById('contributionsBody');
    if (!tbody) return;

    let filteredMembers = members;
    if (filter !== 'all') {
        filteredMembers = members.filter(m => m.contributionStatus === filter);
    }

    if (filteredMembers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No contributions found for this filter</td></tr>`;
        return;
    }

    tbody.innerHTML = "";

    filteredMembers.forEach(member => {
        const row = document.createElement("tr");
        
        let statusText = member.contributionStatus;
        let statusClass = "";
        
        if (member.contributionStatus === "Not Paid") {
            statusClass = "pending";
        } else if (member.contributionStatus === "pending") {
            statusClass = "pending";
        } else if (member.contributionStatus === "paid") {
            statusClass = "paid";
        } else if (member.contributionStatus === "missed") {
            statusClass = "missed";
        }
        
        const dueDateFormatted = member.dueDate ? new Date(member.dueDate).toLocaleDateString() : "—";
        
        // Show flag button for ALL EXCEPT paid status
        let actionContent = '<span class="no-action">—</span>';
        if (member.contributionId && member.contributionStatus !== 'paid') {
            actionContent = `<button class="btn-flag" data-contribution-id="${member.contributionId}" data-member-name="${escapeHtml(member.name)}">Flag</button>`;
        }
        
        row.innerHTML = `
            <td style="padding: 11px 12px;">${escapeHtml(member.name)}</td>
            <td style="padding: 11px 12px;">${dueDateFormatted}</td>
            <td style="padding: 11px 12px;">${formatCurrency(member.amount)}</td>
            <td style="padding: 11px 12px;"><span class="status-pill ${statusClass}">${statusText}</span></td>
            <td style="padding: 11px 12px;">${escapeHtml(member.note || "—")}</td>
            <td style="padding: 11px 12px;">
                ${actionContent}
            </td>
        `;

        tbody.appendChild(row);
    });
    
    // Add event listeners to flag buttons
    document.querySelectorAll('#contributionsBody .btn-flag').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const contributionId = parseInt(btn.dataset.contributionId);
            const memberName = btn.dataset.memberName;
            openFlagModal(contributionId, memberName);
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Load Group Data ───────────────────────────────────────────────────────
async function loadGroupData() {
  if (!currentGroupId) return;

  try {
    const token = await getAuthToken();
    const userId = localStorage.getItem('userId');

    const res = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const groups = await res.json();
    const group = groups.find(g => String(g.groupId) === String(currentGroupId));
    
    currentGroup = group;

    if (!group) {
      console.error("Group not found");
      return;
    }

    document.getElementById('group-name').textContent = group.name;
    document.getElementById('group-desc').textContent = group.description || '—';
    
    const statusBadge = document.getElementById('status-badge');
    statusBadge.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
    statusBadge.className = `badge ${group.status}`;

    document.getElementById('stat-amount').textContent = `R ${group.contributionAmount}`;
    
    const cycleEl = document.getElementById('stat-cycle');
    if (cycleEl) {
      cycleEl.textContent = group.cycleType || '—';
    }

    await updateTotalCollected();

  } catch (error) {
    console.error("Error loading group data:", error);
  }
}

// ─── Calculate Total Collected ─────────────────────────────────
async function updateTotalCollected() {
  try {
    const token = await getAuthToken();

    const res = await fetch(`${config.apiBase}/api/get-all-contributions/group/${currentGroupId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();
    const contributions = result.contributions || result;

    const totalCollected = contributions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

    document.getElementById('stat-total-collected').textContent = `R ${totalCollected.toFixed(2)}`;

  } catch (error) {
    console.error("Error calculating total collected:", error);
    document.getElementById('stat-total-collected').textContent = 'R 0.00';
  }
}

// ── Flag Modal Functions ─────────────────────────────────────────
function openFlagModal(contributionId, memberName) {
    pendingFlagId = contributionId;
    const modal = document.getElementById('flagModal');
    const memberNameSpan = document.getElementById('modalMemberName');
    const noteInput = document.getElementById('flagNote');
    
    if (memberNameSpan) memberNameSpan.textContent = memberName;
    if (noteInput) noteInput.value = '';
    
    if (modal) modal.showModal();
}

function closeFlagModal() {
    const modal = document.getElementById('flagModal');
    if (modal) modal.close();
    pendingFlagId = null;
}

async function confirmFlag() {
    if (!pendingFlagId) {
        console.error('No contribution ID to flag');
        return;
    }
    
    const note = document.getElementById('flagNote').value.trim();
    const confirmBtn = document.getElementById('confirmFlagBtn');
    
    if (confirmBtn) {
        confirmBtn.textContent = 'Processing...';
        confirmBtn.disabled = true;
    }
    
    try {
        const token = await getAuthToken();
        
        const response = await fetch(`${config.apiBase}/api/missed-contributions/${pendingFlagId}/flag`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ note: note || `Flagged as missed on ${new Date().toLocaleDateString()}` })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to flag contribution');
        }
        
        const updatedContribution = await response.json();
        
        updateContributionInData(updatedContribution);
        
        closeFlagModal();
        
        const banner = document.getElementById('status-banner');
        banner.textContent = `✓ Contribution flagged as missed successfully`;
        banner.className = 'status-banner success';
        banner.hidden = false;
        setTimeout(() => { banner.hidden = true; }, 3000);
        
        await loadPaymentTracking();
        await loadContributions();
        
    } catch (error) {
        console.error('Error flagging contribution:', error);
        const banner = document.getElementById('status-banner');
        banner.textContent = `✗ Failed to flag contribution: ${error.message}`;
        banner.className = 'status-banner error';
        banner.hidden = false;
        setTimeout(() => { banner.hidden = true; }, 4000);
    } finally {
        if (confirmBtn) {
            confirmBtn.textContent = 'Flag as missed';
            confirmBtn.disabled = false;
        }
    }
}

function updateContributionInData(updatedContribution) {
    if (!allContributions) return;
    
    const index = allContributions.findIndex(c => c.contributionId === updatedContribution.contributionsId);
    if (index !== -1) {
        allContributions[index] = {
            ...allContributions[index],
            contributionStatus: updatedContribution.status,
            note: updatedContribution.note
        };
    }
}

// Setup filter buttons
function setupFilterButtons() {
    const filterAll = document.getElementById('filter-all');
    const filterPending = document.getElementById('filter-pending');
    const filterPaid = document.getElementById('filter-paid');
    const filterMissed = document.getElementById('filter-missed');
    
    if (filterAll) {
        filterAll.addEventListener('click', () => {
            currentFilter = 'all';
            updateActiveFilter('all');
            renderContributionsTable(allContributions, 'all');
        });
    }
    
    if (filterPending) {
        filterPending.addEventListener('click', () => {
            currentFilter = 'pending';
            updateActiveFilter('pending');
            renderContributionsTable(allContributions, 'pending');
        });
    }
    
    if (filterPaid) {
        filterPaid.addEventListener('click', () => {
            currentFilter = 'paid';
            updateActiveFilter('paid');
            renderContributionsTable(allContributions, 'paid');
        });
    }
    
    if (filterMissed) {
        filterMissed.addEventListener('click', () => {
            currentFilter = 'missed';
            updateActiveFilter('missed');
            renderContributionsTable(allContributions, 'missed');
        });
    }
}

function updateActiveFilter(activeStatus) {
    const filters = ['all', 'pending', 'paid', 'missed'];
    filters.forEach(status => {
        const btn = document.getElementById(`filter-${status}`);
        if (btn) {
            if (status === activeStatus) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

// Setup flag modal buttons
function setupFlagModalButtons() {
    const cancelBtn = document.getElementById('cancelFlagBtn');
    const confirmBtn = document.getElementById('confirmFlagBtn');
    const modal = document.getElementById('flagModal');
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeFlagModal);
    }
    
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmFlag);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeFlagModal();
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFlagModal();
    });
}

// ── INIT ───────────────────────────────────────────────
async function init() {
  if (!currentGroupId) {
    alert("Missing groupId");
    return;
  }

  setupBackLink();
  setupViewContributionsButton();
  setupPaymentSimulationButton();
  setupFilterButtons();
  setupFlagModalButtons();

  document.getElementById("record-payment-form")
    ?.addEventListener("submit", recordPayment);

  await loadGroupData();        
  await loadMembers();
  await loadPaymentTracking();
  await loadContributions();
}

init();

function onAuthReady() {
  setAvatar();
  loadGroupData();  
}