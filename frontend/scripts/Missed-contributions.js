// =======================================================
// missed-contributions.js - Combined Treasurer Functionality
// Handles: Payment Recording & Missed Contributions Flagging
// =======================================================

var currentGroupId = new URLSearchParams(window.location.search).get('groupId');
var pendingFlagId = null;
var allContributions = [];
var treasurerId = localStorage.getItem("userId");

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

// ── View Contributions Button (Treasurer's Own Contributions) ─────────────────
function setupViewContributionsButton() {
  const viewContribBtn = document.getElementById('view-contributions-btn');
  if (viewContribBtn) {
    viewContribBtn.addEventListener('click', loadAndShowContributions);
  }
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
  // Create a modal to display the contribution history
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
      
      html += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${paidDate}</td>
          <td style="padding:8px;">${formatCurrency(parseFloat(contrib.amount))}</td>
          <td style="padding:8px;"><span style="background:#2b7e3a20; color:#2b7e3a; padding:4px 12px; border-radius:20px;">${contrib.status}</span></td>
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

// ── Payment Tracking Table ─────────────────────────────
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
    const data = result.contributions || result;

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
    await updateTotalCollected();

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
    document.getElementById('tableContainer').hidden = false;

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

// ─── Load Group Data (Header & Stats) ───────────────────────────────────────
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

    if (!group) {
      console.error("Group not found");
      return;
    }

    // Update group header
    document.getElementById('group-name').textContent = group.name;
    document.getElementById('group-desc').textContent = group.description || '—';
    
    const statusBadge = document.getElementById('status-badge');
    statusBadge.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
    statusBadge.className = `badge ${group.status}`;

    // Update stats
    document.getElementById('stat-amount').textContent = `R ${group.contributionAmount}`;
    
    // Display cycle type directly from group data
    const cycleEl = document.getElementById('stat-cycle');
    if (cycleEl) {
      cycleEl.textContent = group.cycleType || '—';
    }

    // Calculate and display total collected
    await updateTotalCollected();

  } catch (error) {
    console.error("Error loading group data:", error);
  }
}

// ─── Calculate Total Collected Contributions ─────────────────────────────────
async function updateTotalCollected() {
  try {
    const token = await getAuthToken();

    const res = await fetch(`${config.apiBase}/api/get-all-contributions/group/${currentGroupId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = await res.json();
    const contributions = result.contributions || result;

    // Sum only paid contributions
    const totalCollected = contributions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);

    document.getElementById('stat-total-collected').textContent = `R ${totalCollected.toFixed(2)}`;

  } catch (error) {
    console.error("Error calculating total collected:", error);
    document.getElementById('stat-total-collected').textContent = 'R 0.00';
  }
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
  setupViewContributionsButton();  // ← ADDED THIS LINE

  document.getElementById("record-payment-form")
    ?.addEventListener("submit", recordPayment);

  document.querySelector("#flagModal .btn-cancel")
    ?.addEventListener("click", closeFlagModal);

  document.querySelector("#flagModal .btn-confirm")
    ?.addEventListener("click", confirmFlag);

  // Load all data
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