// FIXED: read real userId from localStorage instead of hardcoded value
const CURRENT_USER_ID = parseInt(localStorage.getItem('userId')) || null;

const AVATAR_COLOURS = ["av-teal", "av-blue", "av-purple", "av-coral"];

// Store current group for payment simulation
let currentGroupForPayment = null;

// Use URL params instead of group select dropdown
const groupSelect = { value: new URLSearchParams(window.location.search).get('groupId') };


// ─── Helper functions ─────────────────────────────────────────────────────────

function getInitials(name) {
  return name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(amount);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function buildCycleSummary(cycleType, dueDayOfMonth) {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = dueDayOfMonth % 100;
  const suffix = (remainder >= 11 && remainder <= 13)
    ? "th"
    : suffixes[dueDayOfMonth % 10] || "th";
  return "Due every " + cycleType.toLowerCase() + " on the " + dueDayOfMonth + suffix;
}


// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchUserGroups(userId) {
  const token = await auth0Client.getTokenSilently();
  const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error("Failed to load groups");
  return await response.json();
}

// ─── Payment Simulation Functions ─────────────────────────────────────────────

async function fetchPaymentStatus(userId, groupId) {
  const token = await auth0Client.getTokenSilently();
  const response = await fetch(`${config.apiBase}/api/payments/status/${userId}/${groupId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch payment status');
  return await response.json();
}

async function simulatePayment(userId, groupId, amount, treasurerId) {
  const token = await auth0Client.getTokenSilently();
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
  const modal      = document.getElementById('payment-confirm-modal');
  const amountEl   = document.getElementById('confirm-amount-display');
  const confirmBtn = document.getElementById('confirm-payment-btn');

  if (!modal || !amountEl || !confirmBtn) {
    console.error('Modal elements not found');
    return;
  }

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
    const result = await simulatePayment(userId, groupId, amount, treasurerId);
    console.log('Payment successful:', result);
    closePaymentModal();

    const banner = document.getElementById('status-banner');
    banner.textContent = `✅ Payment successful! Reference: ${result.transactionRef}`;
    banner.className   = 'status-banner success';
    banner.hidden      = false;
    setTimeout(() => { banner.hidden = true; }, 5000);

    const contributionsModal = document.getElementById('contributions-modal');
    if (contributionsModal && !contributionsModal.hidden) {
      await loadAndShowContributions();
    }

  } catch (error) {
    console.error('Payment error:', error);
    alert('Payment failed: ' + error.message);
  } finally {
    confirmBtn.textContent = 'Confirm Payment';
    confirmBtn.disabled    = false;
  }
}

function renderPaymentCard(statusData) {
  const icon  = document.getElementById('payment-status-icon');
  const label = document.getElementById('payment-status-label');
  const sub   = document.getElementById('payment-status-sub');
  const ref   = document.getElementById('payment-ref');
  const btn   = document.getElementById('pay-now-btn');

  if (!icon || !label || !sub || !btn) return;

  if (statusData.hasPaidThisCycle) {
    const paidDate    = new Date(statusData.lastPayment.paidAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
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

function setupPaymentModal() {
  const payNowBtn   = document.getElementById('pay-now-btn');
  const closePayBtn = document.getElementById('close-payment-modal');
  const cancelBtn   = document.getElementById('cancel-payment-btn');
  const confirmBtn  = document.getElementById('confirm-payment-btn');
  const modal       = document.getElementById('payment-confirm-modal');

  if (payNowBtn)   payNowBtn.addEventListener('click', handlePayNow);
  if (closePayBtn) closePayBtn.addEventListener('click', closePaymentModal);
  if (cancelBtn)   cancelBtn.addEventListener('click', closePaymentModal);
  if (confirmBtn)  confirmBtn.addEventListener('click', handleConfirmPayment);
  if (modal)       modal.addEventListener('click', (e) => { if (e.target === modal) closePaymentModal(); });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePaymentModal(); });
}


// ─── DOM references ───────────────────────────────────────────────────────────

const statusBanner        = document.getElementById("status-banner");
const groupNameEl         = document.getElementById("group-name");
const statusBadgeEl       = document.getElementById("status-badge");
const groupDescEl         = document.getElementById("group-desc");
const cycleLabelEl        = document.getElementById("cycle-label");
const cycleDaysEl         = document.getElementById("cycle-days");
const cycleProgress       = document.getElementById("cycle-progress");
const statMembersEl       = document.getElementById("stat-members");
const statAmountEl        = document.getElementById("stat-amount");
const statCycleEl         = document.getElementById("stat-cycle");
const payoutAvatarEl      = document.getElementById("payout-avatar");
const payoutNameEl        = document.getElementById("payout-name");
const payoutDateEl        = document.getElementById("payout-date");
const countdownEl         = document.getElementById("payout-countdown");
const countdownNumEl      = document.getElementById("countdown-num");
const membersGrid         = document.getElementById("members-grid");
const rulesModal          = document.getElementById("rules-modal");
const closeModalBtn       = document.getElementById("close-modal-btn");
const modalAmount         = document.getElementById("modal-amount");
const modalCycleSummary   = document.getElementById("modal-cycle-summary");
const modalPayoutOrder    = document.getElementById("modal-payout-order");
const modalPenaltySection = document.getElementById("modal-penalty-section");
const modalPenaltyRules   = document.getElementById("modal-penalty-rules");


// ─── Render functions ─────────────────────────────────────────────────────────

function renderBanner(status) {
  if (status === "active") {
    statusBanner.hidden = true;
    return;
  }
  statusBanner.textContent = "This group is closed. All cycles have been completed.";
  statusBanner.className   = "status-banner closed";
  statusBanner.hidden      = false;
}

function renderGroupHeader(group, cycle) {
  groupNameEl.textContent   = group.name;
  statusBadgeEl.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
  statusBadgeEl.className   = "badge " + group.status;
  groupDescEl.textContent   = group.description;
  cycleLabelEl.textContent  = "Cycle " + cycle.number + " of " + cycle.total + " · " + formatDate(group.startDate) + " – " + formatDate(cycle.endDate);
  cycleDaysEl.textContent   = cycle.daysRemaining > 0 ? cycle.daysRemaining + " days remaining" : "Cycle ended";
  cycleProgress.value       = cycle.progressPercent;
}

function renderStats(group) {
  statMembersEl.textContent = group.totalMembers;
  statAmountEl.textContent  = formatCurrency(group.contributionAmount);
  statCycleEl.textContent   = group.cycleType;
}

function renderNextPayout(nextPayout) {
  payoutAvatarEl.textContent = getInitials(nextPayout.recipientName);
  payoutNameEl.textContent   = nextPayout.recipientName;
  payoutDateEl.textContent   = nextPayout.payoutDate
    ? "Scheduled " + formatDate(nextPayout.payoutDate)
    : "Cycle complete";

  if (nextPayout.daysRemaining != null) {
    countdownNumEl.textContent = nextPayout.daysRemaining;
    countdownEl.hidden         = false;
  } else {
    countdownEl.hidden = true;
  }
}

function renderMembers(members) {
  membersGrid.innerHTML = "";
  members.forEach((member, index) => {
    const li = document.createElement("li");
    li.className = "member-card";

    const avatar = document.createElement("span");
    avatar.className   = "member-avatar " + AVATAR_COLOURS[index % AVATAR_COLOURS.length];
    avatar.textContent = getInitials(member.name);
    li.appendChild(avatar);

    const name = document.createElement("p");
    name.className   = "member-name";
    name.textContent = member.name;
    li.appendChild(name);

    membersGrid.appendChild(li);
  });
}

// ─── Role-based footer buttons ────────────────────────────────────────────────

function renderFooterButtons(group) {
  const footer = document.querySelector(".action-footer");
  if (!footer) return;

  footer.innerHTML = "";

  const viewContribBtn = document.createElement("button");
  viewContribBtn.id = "view-contributions-btn";
  viewContribBtn.textContent = "View contributions";
  viewContribBtn.addEventListener("click", loadAndShowContributions);
  footer.appendChild(viewContribBtn);

  const viewPayoutsBtn = document.createElement("button");
  viewPayoutsBtn.id = "view-payouts-btn";
  viewPayoutsBtn.textContent = "View payouts";
  viewPayoutsBtn.addEventListener("click", () => {
    const gid = group?.groupId || new URLSearchParams(window.location.search).get('groupId');
    loadAndShowPayouts(gid);
  });
  footer.appendChild(viewPayoutsBtn);

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

  checkNewNotifications(group.groupId, badgeWrapper);
}

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


// ─── Rules modal ──────────────────────────────────────────────────────────────

function openRulesModal(group, rules) {
  modalAmount.textContent       = formatCurrency(group.contributionAmount);
  modalCycleSummary.textContent = buildCycleSummary(group.cycleType, rules.dueDayOfMonth);

  modalPayoutOrder.innerHTML = "";
  rules.payoutOrder.forEach((entry, index) => {
    const li = document.createElement("li");
    const isCurrentUser = entry.memberId === CURRENT_USER_ID;
    if (isCurrentUser) li.className = "current-user";

    const position = document.createElement("span");
    position.className   = "payout-position";
    position.textContent = index + 1;
    li.appendChild(position);

    const memberName = document.createElement("span");
    memberName.className   = "payout-member-name";
    memberName.textContent = entry.name;
    li.appendChild(memberName);

    if (isCurrentUser) {
      const youTag = document.createElement("span");
      youTag.className   = "you-tag";
      youTag.textContent = "You";
      li.appendChild(youTag);
    }

    const date = document.createElement("span");
    date.className   = "payout-date";
    date.textContent = formatDate(entry.payoutDate);
    li.appendChild(date);

    modalPayoutOrder.appendChild(li);
  });

  if (rules.penaltyRules) {
    modalPenaltyRules.textContent = rules.penaltyRules;
    modalPenaltySection.hidden    = false;
  } else {
    modalPenaltySection.hidden = true;
  }

  rulesModal.hidden = false;
}

function closeRulesModal() {
  rulesModal.hidden = true;
}

async function loadPersonalHealthScore(userId, groupId) {
    const card = document.getElementById('personal-health-card');
    if (!card) return;

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const token    = await auth0Client.getTokenSilently();
            const response = await fetch(`${config.apiBase}/api/groups/${groupId}/health-scores/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 503) {
                console.log(`Health model not ready, retrying in 2s (attempt ${attempt}/5)...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            if (!response.ok) throw new Error('Failed to fetch health score');
            const data = await response.json();

            const scoreEl   = document.getElementById('my-health-score');
            const labelEl   = document.getElementById('my-health-label');
            const riskEl    = document.getElementById('my-health-risk');
            const paidEl    = document.getElementById('my-paid-count');
            const missedEl  = document.getElementById('my-missed-count');
            const pendingEl = document.getElementById('my-pending-count');

            if (scoreEl)   scoreEl.textContent   = data.score + '%';
            if (paidEl)    paidEl.textContent    = data.breakdown.paid;
            if (missedEl)  missedEl.textContent  = data.breakdown.missed;
            if (pendingEl) pendingEl.textContent = data.breakdown.pending;

            if (labelEl) {
                labelEl.textContent = data.label;
                if (data.score >= 80)      labelEl.style.color = '#034e52';
                else if (data.score >= 60) labelEl.style.color = '#b45309';
                else if (data.score >= 40) labelEl.style.color = '#c2410c';
                else                       labelEl.style.color = '#991b1b';
            }
            if (riskEl) riskEl.textContent = data.risk;

            card.hidden = false;
            return;

        } catch (error) {
            console.error('Personal health score error:', error);
            if (attempt === 5 && card) card.hidden = true;
        }
    }
}

// ─── Group loading ────────────────────────────────────────────────────────────

let userGroups = [];

function getGroupById(groupId) {
  return userGroups.find(g => String(g.groupId) === String(groupId));
}

async function loadGroup(groupId) {
  try {
    const group = getGroupById(groupId);
    if (!group) throw new Error("Group not found");

    currentGroupForPayment = group;

    const { cycle, nextPayout } = getMockCycleAndPayout();

    renderBanner(group.status);
    renderGroupHeader(group, cycle);
    renderStats(group);
    renderNextPayout(nextPayout);
    renderMembers(group.members);
    renderFooterButtons(group);

    const userId = localStorage.getItem('userId');
    await checkNewAnnouncements(groupId);
    if (userId) {
      const statusData = await fetchPaymentStatus(parseInt(userId), parseInt(groupId));
      renderPaymentCard(statusData);

      await loadSavingsProjection(parseInt(userId), parseInt(groupId));
      await loadPersonalHealthScore(parseInt(userId), parseInt(groupId));
    }

  } catch (error) {
    statusBanner.textContent = "Error: " + error.message;
    statusBanner.className   = "status-banner closed";
    statusBanner.hidden      = false;
  }
}

async function loadAndOpenRules(groupId) {
  try {
    const group = getGroupById(groupId);
    if (!group) throw new Error("Group not found");
    const rules = await fetchRules(groupId);
    openRulesModal(group, rules);
  } catch (error) {
    alert("Could not load rules: " + error.message);
  }
}

async function loadUserGroups() {
  const userId = localStorage.getItem('userId');

  if (!userId) {
    statusBanner.textContent = "Session expired. Please log in again.";
    statusBanner.className   = "status-banner closed";
    statusBanner.hidden      = false;
    return;
  }

  const urlParams       = new URLSearchParams(window.location.search);
  const selectedGroupId = urlParams.get('groupId');

  try {
    userGroups = await fetchUserGroups(userId);

    if (selectedGroupId) {
      loadGroup(selectedGroupId);
    } else if (userGroups.length > 0) {
      loadGroup(String(userGroups[0].groupId));
    }

  } catch (error) {
    statusBanner.textContent = "Error loading groups: " + error.message;
    statusBanner.className   = "status-banner closed";
    statusBanner.hidden      = false;
  }
}


// ─── Event listeners ──────────────────────────────────────────────────────────

const backBtn = document.getElementById('back-btn');
if (backBtn) backBtn.addEventListener('click', () => {
  window.location.href = '../pages/dashboard.html';
});

if (closeModalBtn) closeModalBtn.addEventListener("click", closeRulesModal);

if (rulesModal) rulesModal.addEventListener("click", (event) => {
  if (event.target === rulesModal) closeRulesModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && rulesModal && !rulesModal.hidden) closeRulesModal();
});


// ─── Savings Projection ───────────────────────────────────────────────────────

let savingsChartInstance = null;

async function fetchSavingsProjection(userId, groupId) {
  const token = await auth0Client.getTokenSilently();
  const response = await fetch(`${config.apiBase}/api/groups/${groupId}/savings-projection/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch savings projection');
  return await response.json();
}

function renderSavingsProjection(data) {
  const card = document.getElementById('savings-projection-card');
  if (!card) return;

  document.getElementById('proj-total-contrib').textContent = formatCurrency(data.totalContributed);
  document.getElementById('proj-payout-cycle').textContent = data.payoutPosition;
  document.getElementById('proj-payout-amount').textContent = formatCurrency(data.potAmount);
  document.getElementById('proj-progress').textContent = data.paidSoFar + ' of ' + data.totalCycles + ' cycles';

  const noteEl = document.getElementById('proj-note');
  if (data.paidSoFar >= data.payoutPosition && data.payoutsReceived > 0) {
    noteEl.textContent = 'You have already received your payout. Keep contributing for the remaining members.';
  } else if (data.paidSoFar >= data.payoutPosition) {
    noteEl.textContent = 'You are due for your payout this cycle. Contact your treasurer.';
  } else {
    const remaining = data.payoutPosition - data.paidSoFar;
    noteEl.textContent = remaining + ' contribution' + (remaining !== 1 ? 's' : '') + ' remaining before your payout.';
  }

  const ctx = document.getElementById('savings-chart');
  if (!ctx) return;

  if (savingsChartInstance) {
    savingsChartInstance.destroy();
    savingsChartInstance = null;
  }

  const labels = data.projectionData.map(d => {
    const dt = new Date(d.cycleDate);
    return dt.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' });
  });

  const contributedData = data.projectionData.map(d => d.contributed);
  const receivedData = data.projectionData.map(d => d.received);
  const netData = data.projectionData.map(d => d.netPosition);
  const payoutIndex = data.projectionData.findIndex(d => d.isPayoutCycle);
  const contributedRadius = data.projectionData.map((d, i) => i === payoutIndex ? 6 : 3);
  const receivedRadius = data.projectionData.map((d, i) => i === payoutIndex ? 8 : 0);

  savingsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cumulative Contributions',
          data: contributedData,
          borderColor: '#0e9490',
          backgroundColor: 'rgba(14, 148, 144, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: contributedRadius,
          pointBackgroundColor: '#0e9490',
          borderWidth: 2
        },
        {
          label: 'Cumulative Received',
          data: receivedData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: false,
          tension: 0,
          pointRadius: receivedRadius,
          pointBackgroundColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [6, 3],
          stepped: 'before'
        },
        {
          label: 'Net Position',
          data: netData,
          borderColor: '#6d28d9',
          backgroundColor: 'rgba(109, 40, 217, 0.05)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointBackgroundColor: '#6d28d9',
          borderWidth: 2,
          borderDash: [4, 2]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10
          }
        },
        tooltip: {
          backgroundColor: '#034e52',
          titleFont: { size: 12, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
          bodyFont: { size: 12, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (context.parsed.y !== null) {
                label += ': ' + formatCurrency(context.parsed.y);
              }
              if (context.dataIndex === payoutIndex) {
                label += ' ★ PAYOUT';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#64748b' }
        },
        y: {
          grid: { color: 'rgba(14, 148, 144, 0.08)' },
          ticks: {
            font: { size: 10 },
            color: '#64748b',
            callback: function(value) { return 'R' + value.toLocaleString(); }
          }
        }
      }
    }
  });

  card.hidden = false;
}

async function loadSavingsProjection(userId, groupId) {
  try {
    const data = await fetchSavingsProjection(userId, groupId);
    renderSavingsProjection(data);
  } catch (error) {
    console.error('Savings projection error:', error);
    const card = document.getElementById('savings-projection-card');
    if (card) card.hidden = true;
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

    const existing = document.getElementById('payouts-modal');
    if (existing) existing.remove();

    const modal = document.createElement('aside');
    modal.id        = 'payouts-modal';
    modal.className = 'modal-overlay';

    const article  = document.createElement('article');
    article.className = 'modal';

    const header   = document.createElement('header');
    header.className = 'modal-header';
    header.innerHTML = '<h2 class="modal-title">Payout schedule</h2>';

    const closeBtn = document.createElement('button');
    closeBtn.className  = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close payouts');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => { modal.remove(); });
    header.appendChild(closeBtn);

    const content  = document.createElement('section');
    content.className = 'modal-section';

    article.appendChild(header);
    article.appendChild(content);
    modal.appendChild(article);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

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
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Member</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Date</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        payouts.forEach(p => {
            const isMe      = p.recipientId === userId;
            const name      = isMe ? 'You' : (p.recipientName || p.recipient?.name || '—');
            const date      = p.initiatedAt
                ? new Date(p.initiatedAt).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })
                : '—';
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


// ─── View contributions modal ─────────────────────────────────────────────────

async function loadAndShowContributions() {
  const groupId = new URLSearchParams(window.location.search).get('groupId');
  const userId  = localStorage.getItem('userId');

  if (!groupId) {
    alert("No group found. Please go back and select a group.");
    return;
  }

  if (!userId) {
    alert("User not found. Please log in again.");
    return;
  }

  try {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/contributions/${userId}/${groupId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
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
    modal           = document.createElement("aside");
    modal.id        = "contributions-modal";
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
      const paidDate = contrib.paidAt  ? new Date(contrib.paidAt).toLocaleDateString()  : "—";
      const dueDate  = contrib.dueDate ? new Date(contrib.dueDate).toLocaleDateString() : "—";

      let statusColor = "#2b7e3a";
      let statusBg    = "#2b7e3a20";
      let statusText  = contrib.status;

      if (contrib.status === "pending") {
        statusColor = "#ff9800";
        statusBg    = "#ff980020";
        statusText  = "Pending";
      } else if (contrib.status === "paid") {
        statusColor = "#2b7e3a";
        statusBg    = "#2b7e3a20";
        statusText  = "Paid";
      } else if (contrib.status === "missed" || contrib.status === "overdue") {
        statusColor = "#f44336";
        statusBg    = "#f4433620";
        statusText  = "Missed";
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


// ─── Initial page load ────────────────────────────────────────────────────────

const setAvatar = () => {
  const name     = localStorage.getItem('userName') || '';
  const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
  const avatar   = document.getElementById('avatar');
  if (avatar) avatar.textContent = initials || '?';
};

// escapeHtml is defined in notifications.js — kept here as fallback
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function onAuthReady() {
  setAvatar();
  setupPaymentModal();

// Notifications bell — opens unified Meetings + Announcements modal
const announcementsBell = document.getElementById('announcements-bell');
if (announcementsBell) {
  announcementsBell.addEventListener('click', () => {
    const groupId = new URLSearchParams(window.location.search).get('groupId');
    if (groupId) loadAndShowNotifications(groupId);
  });
}
  loadUserGroups();
}