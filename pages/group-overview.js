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
const viewRulesBtn        = document.getElementById("view-rules-btn");
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


// ─── Main load functions ──────────────────────────────────────────────────────

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

    const { cycle, nextPayout } = getMockCycleAndPayout();

    renderBanner(group.status);
    renderGroupHeader(group, cycle);
    renderStats(group);
    renderNextPayout(nextPayout);
    renderMembers(group.members);

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

// FIXED: reads groupId from URL params instead of localStorage
// FIXED: uses real userId from localStorage instead of hardcoded CURRENT_USER_ID = 1
async function loadUserGroups() {
  const userId = localStorage.getItem('userId');

  if (!userId) {
    statusBanner.textContent = "Session expired. Please log in again.";
    statusBanner.className   = "status-banner closed";
    statusBanner.hidden      = false;
    return;
  }

  // FIXED: read groupId from URL query param e.g. ?groupId=5
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

viewRulesBtn.addEventListener("click", () => {
  loadAndOpenRules(groupSelect.value);
});

closeModalBtn.addEventListener("click", closeRulesModal);

rulesModal.addEventListener("click", (event) => {
  if (event.target === rulesModal) closeRulesModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !rulesModal.hidden) closeRulesModal();
});


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
    loadUserGroups();
}