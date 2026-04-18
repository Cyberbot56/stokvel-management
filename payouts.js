const params  = new URLSearchParams(window.location.search);
const groupId = params.get("groupId");

// The logged-in user's ID
const CURRENT_USER_ID = parseInt(localStorage.getItem('userId')) || null;

// Format a number as South African currency
// Intl.NumberFormat is the browser's built-in currency formatter
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2
  }).format(amount);
}

// Converts an ISO date string like "2026-05-31" into "31 May 2026"
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}



async function fetchPayouts(groupId) {
  // The Auth0 token — required by backend on every request
  // auth0Client is initialised by auth_service.js which must be loaded before this script
  // config.apiBase switches between localhost:3000 (dev) and the live server (production)
  const token    = await auth0Client.getTokenSilently();
  const response = await fetch(config.apiBase + "/api/payouts/group/" + groupId, {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  });
  if (!response.ok) throw new Error("Failed to load payouts");
  return await response.json();
}


// ─── DOM references

const nextPayoutEl = document.getElementById("nextPayout");
const countdownEl  = document.getElementById("countdown");
const tableEl      = document.getElementById("payoutTable");
const errorEl      = document.getElementById("error-msg");



// Fills in the "Your next payout" card at the top
// Finds the logged-in member's next upcoming payout from the list
function renderNextPayout(payouts) {
  // Status from real API is "pending" | "completed" | "cancelled"
  // We look for "pending" payouts where the recipient is the logged-in user
  const myNext = payouts.find(
    p => p.recipientId === CURRENT_USER_ID && p.status === "pending"
  );

  if (!myNext) {
    nextPayoutEl.textContent = "No upcoming payout found for you.";
    countdownEl.textContent  = "";
    return;
  }

  nextPayoutEl.textContent = "Amount: " + formatCurrency(myNext.amount) + " | Cycle: " + myNext.cycleNumber;

  // Calculate days remaining using initiatedAt date from real API
  // Math.ceil rounds up so 1.2 days shows as 2, not 1
  const today      = new Date();
  const payoutDate = new Date(myNext.initiatedAt);
  const diffTime   = payoutDate - today;
  const diffDays   = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  countdownEl.textContent = diffDays > 0 ? "In " + diffDays + " days" : "Processing soon";
}

// Builds the payout schedule table — one row per payout entry
function renderTable(payouts) {
  tableEl.innerHTML = "";

  payouts.forEach(p => {
    const row = document.createElement("tr");

    // Real API uses recipientId to identify the member
    if (p.recipientId === CURRENT_USER_ID) {
      row.classList.add("my-row");
    }

    // Member name — real API has recipientName field
    const memberCell = document.createElement("td");
    memberCell.textContent = p.recipientId === CURRENT_USER_ID ? "You" : p.recipientName;
    row.appendChild(memberCell);

    // Payout date — real API uses initiatedAt
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(p.initiatedAt);
    row.appendChild(dateCell);

    // Amount cell — formatted as ZAR currency
    const amountCell = document.createElement("td");
    amountCell.textContent = formatCurrency(p.amount);
    row.appendChild(amountCell);

    // Status badge — real API statuses: "pending" | "completed" | "cancelled"
    const statusCell = document.createElement("td");
    const statusSpan = document.createElement("span");
    statusSpan.textContent = p.status.charAt(0).toUpperCase() + p.status.slice(1);
    statusSpan.className   = "status " + p.status.toLowerCase();
    statusCell.appendChild(statusSpan);
    row.appendChild(statusCell);

    tableEl.appendChild(row);
  });
}


// ─── Main load function ───────────────────────────────────────────────────────

async function loadPayouts() {
  if (!groupId) {
    errorEl.textContent = "No group selected. Please go back and select a group.";
    errorEl.hidden = false;
    return;
  }

  try {
    const payouts = await fetchPayouts(groupId);
    renderNextPayout(payouts);
    renderTable(payouts);
  } catch (error) {
    errorEl.textContent = "Error: " + error.message;
    errorEl.hidden = false;
  }
}

// onAuthReady is called by auth_service.js once auth0Client is fully initialised
function onAuthReady() {
  loadPayouts();
}
