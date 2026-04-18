// =======================================================
// missed-contributions.js - Combined Treasurer Functionality
// Handles: Payment Recording & Missed Contributions Flagging
// =======================================================
// =======================================================
// FIXED missed-contributions.js
// =======================================================

var currentGroupId = new URLSearchParams(window.location.search).get('groupId');
var pendingFlagId = null;
var allContributions = [];
var treasurerId = localStorage.getItem("userId");

// ── Get Auth Token ─────────────────────────────────────
async function getAuthToken() {
  try {
    return await auth0Client.getTokenSilently();
  } catch (error) {
    console.error("Token error:", error);
    return null;
  }
}

// ── Back Button ────────────────────────────────────────
function setupBackLink() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = `group-treasurer.html?groupId=${currentGroupId}`;
    };
  }
}
const setAvatar = () => {
    const name = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
};


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

// ── Payment Tracking Table (FIXED) ─────────────────────
async function loadPaymentTracking() {
  const tbody = document.getElementById("member-list-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;

  try {
    const token = await getAuthToken();

    const res = await fetch(`${config.apiBase}/api/get-all-contributions/group/${currentGroupId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();
    const data = result.contributions || result; // FIX

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4">No data</td></tr>`;
      return;
    }

    tbody.innerHTML = "";

    data.forEach(c => {
      const row = document.createElement("tr");

      
    row.innerHTML = `
      <td>${c.users?.name || "Unknown"}</td>
      <td>${c.paidAt ? new Date(c.paidAt).toLocaleDateString() : "—"}</td>
      <td>${c.status}</td>
      <td><button class="btn-flag" onclick="openFlagModal(${c.contributionId}, '${c.users?.name}')">Flag</button></td>
    `;

      tbody.appendChild(row);
    });

  } catch (err) {
    console.error("Tracking error:", err);
    tbody.innerHTML = `<tr><td colspan="4">Error loading data</td></tr>`;
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
// ── Record Payment ─────────────────────────────────────
async function recordPayment(e) {
  e.preventDefault();

  const userId = document.getElementById('member-select').value;
  const amount = document.getElementById('payment-amount').value;
  const paidAt = document.getElementById('payment-date').value;
  const feedbackEl = document.getElementById('payment-feedback');

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

    if (!res.ok) throw new Error();

    showFeedback("Contribution recorded successfully", "success");

    e.target.reset();

    await loadPaymentTracking();
    await loadContributions();

  } catch {
    showFeedback("Failed to record contribution", "error");
  }
}

// ── Load Contributions (Missed Section) ────────────────
async function loadContributions() {
  try {
    const token = await getAuthToken();

    const res = await fetch(`${config.apiBase}/api/get-all-contributions/group/${currentGroupId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();
    const data = result.contributions || result; 
    allContributions = data;

    renderContributionsTable(data);

  } catch (err) {
    console.error(err);
  }
}

function renderContributionsTable(data) {
  const tbody = document.getElementById('contributionsBody');
  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(c => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${c.users?.name || "Unknown"}</td>
      <td>${c.dueDate ? new Date(c.dueDate).toLocaleDateString() : "—"}</td>
      <td>R ${c.amount}</td>
      <td>${c.status}</td>
      <td>${c.note || "—"}</td>
      <td>${c.status === "pending" ? `<button class="btn-flag" onclick="openFlagModal(${c.contributionId}, '${c.users?.name}')">Flag</button>` : "—"}</td>
    `;

    tbody.appendChild(row);
  });
}

// ── Flag Modal ─────────────────────────────────────────
function openFlagModal(id, name) {
  pendingFlagId = id;
  document.getElementById("modalMemberName").textContent = name;
  document.getElementById("flagModal").showModal();
}

function closeFlagModal() {
  document.getElementById("flagModal").close();
}

// ── Confirm Flag ───────────────────────────────────────
async function confirmFlag() {
  const note = document.getElementById("flagNote").value;

  try {
    const token = await getAuthToken();

    await fetch(`${config.apiBase}/api/missed-contributions/${pendingFlagId}/flag`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ note })
    });

    closeFlagModal();
    await loadContributions();
    await loadPaymentTracking();

  } catch {
    alert("Failed");
  }
}

// ── INIT ───────────────────────────────────────────────
async function init() {
  if (!currentGroupId) {
    alert("Missing groupId");
    return;
  }

  setupBackLink();

  document.getElementById("record-payment-form")
    ?.addEventListener("submit", recordPayment);

  document.querySelector("#flagModal .btn-cancel")
    ?.addEventListener("click", closeFlagModal);

  document.querySelector("#flagModal .btn-confirm")
    ?.addEventListener("click", confirmFlag);

  await loadMembers();
  await loadPaymentTracking();
  await loadContributions();
}
document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
});
init();
function onAuthReady() {
    setAvatar();
    loadGroupData();
}