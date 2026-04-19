// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: remove MOCK_CYCLE and MOCK_NEXT_PAYOUT when Dev 5 adds cycle/payout data
// TODO: remove MOCK_RULES when GET /api/groups/:id/rules is ready
const MOCK_CYCLE = {
  number: 4,
  total: 10,
  endDate: "2026-05-31",
  progressPercent: 45,
  daysRemaining: 17
};

const MOCK_NEXT_PAYOUT = {
  recipientName: "Nompumelelo Mokoena",
  payoutDate: "2026-05-31",
  daysRemaining: 17
};

const MOCK_RULES = {
  dueDayOfMonth: 1,
  penaltyRules: "Any member who misses a contribution will be given a 7-day grace period. After that, a penalty of R50 is added for every additional week the contribution remains unpaid.",
  payoutOrder: [
    { memberId: 1,  name: "Thabo Nkosi",         payoutDate: "2026-02-28" },
    { memberId: 2,  name: "Nompumelelo Mokoena",  payoutDate: "2026-03-31" },
    { memberId: 3,  name: "Sipho Dlamini",        payoutDate: "2026-04-30" },
    { memberId: 4,  name: "Zanele Khumalo",       payoutDate: "2026-05-31" },
    { memberId: 5,  name: "Lerato Molefe",        payoutDate: "2026-06-30" },
    { memberId: 6,  name: "Bongani Sithole",      payoutDate: "2026-07-31" },
    { memberId: 7,  name: "Nomsa Zulu",           payoutDate: "2026-08-31" },
    { memberId: 8,  name: "Mpho Radebe",          payoutDate: "2026-09-30" },
    { memberId: 9,  name: "Thandeka Ndlovu",      payoutDate: "2026-10-31" },
    { memberId: 10, name: "Lungelo Mthembu",      payoutDate: "2026-11-30" }
  ]
};

// FIXED: read real userId from localStorage instead of hardcoded value
const CURRENT_USER_ID = parseInt(localStorage.getItem('userId')) || null;

const AVATAR_COLOURS = ["av-teal", "av-blue", "av-purple", "av-coral"];

// Store current group for payment simulation
let currentGroupForPayment = null;


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

// FIXED: use config.apiBase, send auth token
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

function getMockCycleAndPayout() {
  return {
    cycle: MOCK_CYCLE,
    nextPayout: MOCK_NEXT_PAYOUT
  };
}

function fetchRules(groupId) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_RULES), 400);
  });
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
    console.log('Payment successful:', result);
    closePaymentModal();

    // Show success banner
    const banner = document.getElementById('status-banner');
    banner.textContent = `✅ Payment successful! Reference: ${result.transactionRef}`;
    banner.className = 'status-banner success';
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 5000);

    // Refresh contributions modal if it's open
    const contributionsModal = document.getElementById('contributions-modal');
    if (contributionsModal && !contributionsModal.hidden) {
      await loadAndShowContributions();
    }

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
  const groupId = groupSelect.value;
  const amount = currentGroupForPayment?.contributionAmount;
  
  if (!userId || !groupId || !amount) {
    alert('Missing payment information. Please refresh the page.');
    return;
  }
  
  try {
    // Check if already paid
    const paymentStatus = await fetchPaymentStatus(parseInt(userId), parseInt(groupId));
    
    if (paymentStatus.hasPaidThisCycle) {
      alert('You have already paid for this cycle!');
      return;
    }
    
    // Open confirmation modal with amount
    openPaymentConfirmModal(
      parseInt(userId),
      parseInt(groupId),
      parseFloat(amount),
      parseInt(userId) // Member pays themselves (treasurer would record actual payment)
    );
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    alert('Unable to process payment. Please try again.');
  }
}

function setupPaymentSimulationButton() {
  const simulateBtn = document.getElementById('simulate-payment-btn');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', handleSimulatePayment);
  }
  
  // Payment modal buttons
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


// ─── DOM references ───────────────────────────────────────────────────────────

const groupSelect         = document.getElementById("group-select");
const refreshBtn          = document.getElementById("refresh-btn");
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
const viewPayoutsBtn      = document.getElementById("view-payouts-btn");
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
  groupNameEl.textContent = group.name;
  statusBadgeEl.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
  statusBadgeEl.className   = "badge " + group.status;
  groupDescEl.textContent = group.description;
  cycleLabelEl.textContent = "Cycle " + cycle.number + " of " + cycle.total + " · " + formatDate(group.startDate) + " – " + formatDate(cycle.endDate);
  cycleDaysEl.textContent  = cycle.daysRemaining > 0 ? cycle.daysRemaining + " days remaining" : "Cycle ended";
  cycleProgress.value = cycle.progressPercent;
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
    countdownEl.hidden = false;
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
// Shows different buttons depending on whether user is admin, treasurer, or member

function renderFooterButtons(group) {
  const footer = document.querySelector(".action-footer");
  const userRole = group.userRole; // 'admin', 'treasurer', or 'member'

  footer.innerHTML = ""; // clear existing buttons

  // Everyone gets View contributions
  const viewContribBtn = document.createElement("button");
  viewContribBtn.id = "view-contributions-btn";
  viewContribBtn.textContent = "View contributions";
  viewContribBtn.addEventListener("click", loadAndShowContributions);
  footer.appendChild(viewContribBtn);

  // Everyone gets View payouts
  const viewPayoutsBtn = document.createElement("button");
  viewPayoutsBtn.id = "view-payouts-btn";
  viewPayoutsBtn.textContent = "View payouts";
  viewPayoutsBtn.addEventListener("click", () => {
    window.location.href = "upcompayme.html?groupId=" + groupSelect.value;
  });
  footer.appendChild(viewPayoutsBtn);

  // Admin gets: go to admin dashboard
  if (userRole === "admin") {
    const adminBtn = document.createElement("button");
    adminBtn.id = "admin-btn";
    adminBtn.textContent = "Admin dashboard";
    adminBtn.addEventListener("click", () => {
      window.location.href = `group-admin.html?groupId=${group.groupId}`;
    });
    footer.appendChild(adminBtn);
  }

  // Treasurer gets: initiate payout button
  if (userRole === "treasurer" || userRole === "admin") {
    const initiateBtn = document.createElement("button");
    initiateBtn.id = "initiate-payout-btn";
    initiateBtn.textContent = "Initiate payout";
    initiateBtn.style.background = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)";
    initiateBtn.style.color = "white";
    initiateBtn.style.border = "none";
    initiateBtn.style.borderRadius = "8px";
    initiateBtn.style.padding = "10px 20px";
    initiateBtn.style.fontWeight = "700";
    initiateBtn.style.cursor = "pointer";
    initiateBtn.addEventListener("click", () => openInitiatePayoutModal(group));
    footer.appendChild(initiateBtn);
  }
}


// ─── Initiate payout modal (for treasurer/admin) ──────────────────────────────

function openInitiatePayoutModal(group) {
  // Create modal if it doesn't exist
  let modal = document.getElementById("initiate-payout-modal");

  if (!modal) {
    modal = document.createElement("aside");
    modal.id = "initiate-payout-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <article class="modal">
        <header class="modal-header">
          <h2 class="modal-title">Initiate Payout</h2>
          <button class="modal-close" id="close-payout-modal">✕</button>
        </header>
        <section class="modal-section">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Recipient</label>
              <select id="payout-recipient-select" style="width:100%; padding:9px 12px; border:1.5px solid rgba(14,148,144,0.25); border-radius:8px; font-size:14px; margin-top:4px;">
                <option value="">— Select a member —</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Cycle Number</label>
              <input type="number" id="payout-cycle-input" min="1" placeholder="e.g. 4" style="width:100%; padding:9px 12px; border:1.5px solid rgba(14,148,144,0.25); border-radius:8px; font-size:14px; margin-top:4px; box-sizing:border-box;" />
            </div>
            <div>
              <label style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Payout Amount</label>
              <p id="payout-amount-preview" style="font-size:20px; font-weight:700; color:#034e52; margin-top:4px;"></p>
            </div>
            <div>
              <label style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Notes (optional)</label>
              <input type="text" id="payout-notes-input" placeholder="Any notes..." style="width:100%; padding:9px 12px; border:1.5px solid rgba(14,148,144,0.25); border-radius:8px; font-size:14px; margin-top:4px; box-sizing:border-box;" />
            </div>
            <p id="payout-modal-feedback" style="display:none; padding:8px 12px; border-radius:8px; font-size:13px;"></p>
            <button id="confirm-payout-btn" style="padding:10px 20px; background:linear-gradient(135deg,#2dd4bf 0%,#0e9490 100%); color:white; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;">Confirm Payout</button>
          </div>
        </section>
      </article>
    `;
    document.body.appendChild(modal);

    document.getElementById("close-payout-modal").addEventListener("click", () => {
      modal.hidden = true;
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  }

  // Populate recipient dropdown with group members
  const select = document.getElementById("payout-recipient-select");
  select.innerHTML = '<option value="">— Select a member —</option>';
  group.members.forEach(member => {
    const opt = document.createElement("option");
    opt.value = member.userId;
    opt.dataset.name = member.name;
    opt.textContent = `${member.name} (${member.email})`;
    select.appendChild(opt);
  });

  // Show payout amount preview
  const totalPayout = group.contributionAmount * group.totalMembers;
  document.getElementById("payout-amount-preview").textContent = formatCurrency(totalPayout);

  // Confirm button handler
  document.getElementById("confirm-payout-btn").onclick = async () => {
    const recipientId = select.value;
    const recipientName = select.options[select.selectedIndex]?.dataset.name || "";
    const cycleNumber = document.getElementById("payout-cycle-input").value;
    const notes = document.getElementById("payout-notes-input").value.trim();
    const feedbackEl = document.getElementById("payout-modal-feedback");

    if (!recipientId) {
      showPayoutFeedback("Please select a recipient.", "error");
      return;
    }
    if (!cycleNumber || parseInt(cycleNumber) < 1) {
      showPayoutFeedback("Please enter a valid cycle number.", "error");
      return;
    }

    const btn = document.getElementById("confirm-payout-btn");
    btn.disabled = true;
    btn.textContent = "Processing...";

    try {
      const token = await auth0Client.getTokenSilently();
      const response = await fetch(`${config.apiBase}/api/payouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          groupId: group.groupId,
          recipientId: parseInt(recipientId),
          recipientName,
          amount: totalPayout,
          cycleNumber: parseInt(cycleNumber),
          notes: notes || null
        })
      });

      const data = await response.json();

      if (response.ok) {
        showPayoutFeedback(`Payout of ${formatCurrency(totalPayout)} to ${recipientName} initiated! Ref: ${data.payout.transactionRef}`, "success");
        // Reset form
        select.value = "";
        document.getElementById("payout-cycle-input").value = "";
        document.getElementById("payout-notes-input").value = "";
      } else {
        showPayoutFeedback(data.error || "Failed to initiate payout.", "error");
      }
    } catch (err) {
      console.error("Payout error:", err);
      showPayoutFeedback("Something went wrong. Please try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirm Payout";
    }
  };

  modal.hidden = false;
}

function showPayoutFeedback(message, type) {
  const el = document.getElementById("payout-modal-feedback");
  el.textContent = message;
  el.style.display = "block";
  el.style.background = type === "success" ? "#dcfce7" : "#fee2e2";
  el.style.color = type === "success" ? "#166534" : "#991b1b";
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


// ─── Group loading ────────────────────────────────────────────────────────────

let userGroups = [];

function getGroupById(groupId) {
  return userGroups.find(g => String(g.groupId) === String(groupId));
}

async function loadGroup(groupId) {
  refreshBtn.textContent = "Loading...";
  refreshBtn.disabled    = true;

  try {
    const group = getGroupById(groupId);
    if (!group) throw new Error("Group not found");
    
    // Store current group for payment simulation
    currentGroupForPayment = group;

    const { cycle, nextPayout } = getMockCycleAndPayout();

    renderBanner(group.status);
    renderGroupHeader(group, cycle);
    renderStats(group);
    renderNextPayout(nextPayout);
    renderMembers(group.members);
    renderFooterButtons(group); // ← renders correct buttons based on role

  } catch (error) {
    statusBanner.textContent = "Error: " + error.message;
    statusBanner.className   = "status-banner closed";
    statusBanner.hidden      = false;

  } finally {
    refreshBtn.textContent = "Refresh";
    refreshBtn.disabled    = false;
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

  const urlParams = new URLSearchParams(window.location.search);
  const selectedGroupId = urlParams.get('groupId');

  try {
    userGroups = await fetchUserGroups(userId);

    userGroups.forEach(group => {
      const option       = document.createElement("option");
      option.value       = group.groupId;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });

    if (selectedGroupId) {
      groupSelect.value = selectedGroupId;
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

groupSelect.addEventListener("change", () => {
  loadGroup(groupSelect.value);
});

refreshBtn.addEventListener("click", () => {
  groupSelect.innerHTML = "";
  userGroups = [];
  loadUserGroups();
});

closeModalBtn.addEventListener("click", closeRulesModal);

rulesModal.addEventListener("click", (event) => {
  if (event.target === rulesModal) closeRulesModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !rulesModal.hidden) closeRulesModal();
});


// ─── View contributions modal ─────────────────────────────────────────────────
// This is for the view contributions button.

async function loadAndShowContributions() {
  const groupId = groupSelect.value;
  const userId = localStorage.getItem('userId');
  
  if (!groupId) {
    alert("Please select a group first");
    return;
  }
  
  if (!userId) {
    alert("User not found. Please log in again.");
    return;
  }
  
  try {
    const token = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/contributions/${userId}/${groupId}`, {
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
  // Created a modal to display the contribution history.
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
      } else if (contrib.status === "missed" || contrib.status === "overdue") {
        statusColor = "#f44336";
        statusBg = "#f4433620";
        statusText = "Missed";
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
// onAuthReady is called by auth_service.js once auth0Client is fully initialised

const setAvatar = () => {
    const name = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
};

function onAuthReady() {
    setAvatar();
    setupPaymentSimulationButton(); // Add payment button setup
    loadUserGroups();
}