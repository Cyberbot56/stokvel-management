// =======================================================
// missed-contributions.js


var currentGroupId = new URLSearchParams(window.location.search).get('groupId');
var pendingFlagId  = null;
var allContributions = [];

// ── Set back link ─────────────────────────────────────
document.getElementById('backBtn').onclick = function() {
  window.location.href = 'treasurer-dashboard.html?groupId=' + currentGroupId;
};

// ── Logout ────────────────────────────────────────────
document.getElementById('logoutBtn').onclick = function() {
  fetch('/api/logout', { method: 'POST', credentials: 'include' })
    .then(function() { window.location.href = '../index.html'; });
};

// ── Init ──────────────────────────────────────────────
if (!currentGroupId) {
  showError('No group ID found. Please go back and try again.');
} else {
  loadContributions();
}

// ── Fetch contributions ───────────────────────────────
function loadContributions() {
  document.getElementById('loadingMsg').hidden  = false;
  document.getElementById('tableContainer').hidden = true;
  document.getElementById('emptyState').hidden  = true;
  document.getElementById('errorBanner').hidden = true;

  fetch('/contributions/group/' + currentGroupId, {
    credentials: 'include'
  })
    .then(function(res) {
      if (res.status === 401) throw new Error('not-logged-in');
      if (res.status === 403) throw new Error('not-treasurer');
      if (!res.ok)            throw new Error('server-error');
      return res.json();
    })
    .then(function(data) {
      document.getElementById('loadingMsg').hidden = true;

      if (!data || data.length === 0) {
        document.getElementById('emptyState').hidden = false;
        return;
      }

      allContributions = data;
      document.getElementById('memberCount').textContent =
        data.length + ' contribution' + (data.length !== 1 ? 's' : '');

      renderTable(data);
      document.getElementById('tableContainer').hidden = false;
    })
    .catch(function(err) {
      document.getElementById('loadingMsg').hidden = true;
      if (err.message === 'not-logged-in') {
        showError('You are not logged in. Please log in and try again.');
      } else if (err.message === 'not-treasurer') {
        showError('Only the group treasurer can view this page.');
      } else {
        showError('Could not load contributions. Please try again.');
      }
    });
}

// ── Render table rows ─────────────────────────────────
function renderTable(contributions) {
  var tbody = document.getElementById('contributionsBody');
  tbody.innerHTML = '';

  contributions.forEach(function(c) {
    var name    = c.users ? c.users.name : 'Unknown';
    var initials = name.split(' ').map(function(w) {
      return w[0];
    }).join('').toUpperCase().slice(0, 2);

    var due = new Date(c.dueDate).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    var amount = 'R ' + parseFloat(c.amount).toFixed(2);

    var badge = '<strong class="status-pill ' + c.status + '">' +
      c.status.charAt(0).toUpperCase() + c.status.slice(1) +
      '</strong>';

    var action = '';
    if (c.status === 'pending') {
      action = '<button class="btn-flag" onclick="openFlagModal(' +
        c.contributionId + ', \'' + escapeHtml(name) + '\')">' +
        'Flag as missed</button>';
    } else {
      action = '<span class="no-action">—</span>';
    }

    var row = document.createElement('tr');
    row.id  = 'row-' + c.contributionId;
    row.innerHTML =
      '<td>' +
        '<div class="member-cell">' +
          '<div class="member-avatar">' + initials + '</div>' +
          '<span>' + escapeHtml(name) + '</span>' +
        '</div>' +
      '</td>' +
      '<td>' + due + '</td>' +
      '<td>' + amount + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + escapeHtml(c.note || '—') + '</td>' +
      '<td>' + action + '</td>';

    tbody.appendChild(row);
  });
}

// ── Filter pills ──────────────────────────────────────
function filterTable(status) {
  ['all', 'pending', 'missed', 'paid'].forEach(function(p) {
    var el = document.getElementById('filter-' + p);
    if (el) el.className = 'filter-pill' + (p === status ? ' active' : '');
  });

  var filtered = status === 'all'
    ? allContributions
    : allContributions.filter(function(c) { return c.status === status; });

  renderTable(filtered);
}

// ── Modal ─────────────────────────────────────────────
function openFlagModal(contributionId, memberName) {
  pendingFlagId = contributionId;
  document.getElementById('modalMemberName').textContent = memberName;
  document.getElementById('flagNote').value = '';
  document.getElementById('flagModal').showModal();
}

function closeFlagModal() {
  pendingFlagId = null;
  document.getElementById('flagModal').close();
}

// ── Confirm flag ──────────────────────────────────────
function confirmFlag() {
  var note = document.getElementById('flagNote').value.trim();

  fetch('/contributions/' + pendingFlagId + '/flag', {
    method:      'PATCH',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ note: note })
  })
    .then(function(res) {
      if (!res.ok) throw new Error('Could not flag');
      return res.json();
    })
    .then(function(updated) {
      updateRowInTable(updated);
      closeFlagModal();
    })
    .catch(function() {
      closeFlagModal();
      showError('Something went wrong. Please try again.');
    });
}

// ── Update single row without full reload ─────────────
function updateRowInTable(updated) {
  var row = document.getElementById('row-' + updated.contributionId);
  if (!row) return;

  row.cells[3].innerHTML =
    '<strong class="status-pill missed">Missed</strong>';
  row.cells[4].textContent = updated.note || '—';
  row.cells[5].innerHTML   = '<span class="no-action">—</span>';

  allContributions = allContributions.map(function(c) {
    return c.contributionId === updated.contributionId ? updated : c;
  });
}

// ── Helpers ───────────────────────────────────────────
function showError(msg) {
  var el = document.getElementById('errorBanner');
  el.textContent = msg;
  el.hidden = false;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}