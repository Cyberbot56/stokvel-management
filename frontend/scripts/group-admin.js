// State
let currentGroup = null;

// Helpers
const sanitise = (str) => {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
};

function getInitials(name) {
    return (name || '').trim().split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

const setAvatar = () => {
    const name = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
};


// Render group header
function renderGroupHeader(group) {
    document.getElementById('group-name').textContent = sanitise(group.name);
    document.getElementById('group-desc').textContent = sanitise(group.description) || 'No description provided.';

    const badge = document.getElementById('status-badge');
    badge.textContent = group.status.charAt(0).toUpperCase() + group.status.slice(1);
    badge.className = 'badge ' + group.status;

    document.getElementById('stat-members').textContent = group.totalMembers;
    document.getElementById('stat-amount').textContent = formatCurrency(group.contributionAmount);
    document.getElementById('stat-cycle').textContent = group.cycleType;
    document.getElementById('stat-start').textContent = formatDate(group.startDate);
}


// Render members table
function renderMembers(members) {
    const container = document.getElementById('members-container');
    const countEl = document.getElementById('member-count');

    countEl.textContent = members.length + ' total';

    if (members.length === 0) {
        container.innerHTML = '<p class="empty-members">No members yet.</p>';
        return;
    }

    const AVATAR_COLOURS = ['av-teal', 'av-blue', 'av-purple', 'av-coral'];

    const rows = members.map((member, index) => {
        const colour = AVATAR_COLOURS[index % AVATAR_COLOURS.length];
        const initials = getInitials(member.name);
        const joined = formatDate(member.joinedAt);
        const roleClass = member.role === 'admin' ? 'admin' : 'member';
        const roleLabel = member.role.charAt(0).toUpperCase() + member.role.slice(1);

        return `
            <tr>
                <td>
                    <div class="member-info">
                        <div class="member-initials ${colour}">${sanitise(initials)}</div>
                        <div>
                            <div class="member-name-text">${sanitise(member.name)}</div>
                            <div class="member-email-text">${sanitise(member.email)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
                <td class="joined-date">${joined}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="members-table">
            <thead>
                <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Joined</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}


// Add member
async function addMember() {
    const emailInput = document.getElementById('member-email');
    const feedback = document.getElementById('add-feedback');
    const btn = document.getElementById('btn-add-member');
    const email = emailInput.value.trim();

    // Reset state
    emailInput.classList.remove('input-error');
    feedback.hidden = true;
    feedback.className = 'form-feedback';

    if (!email || !email.includes('@')) {
        emailInput.classList.add('input-error');
        showFeedback('Please enter a valid email address.', 'error');
        return;
    }

    if (!currentGroup) {
        showFeedback('No group loaded. Please refresh the page.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
        const token = await auth0Client.getTokenSilently();

        const response = await fetch(`${config.apiBase}/api/groups/add-member`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                email: email,
                groupId: currentGroup.groupId
            })
        });

        const data = await response.json();

        if (response.ok) {
            showFeedback(`${data.member.userName} (${data.member.userEmail}) was added to ${data.member.groupName} successfully.`, 'success');
            emailInput.value = '';
            // Reload group data to refresh member list
            await loadGroupData();
        } else {
            showFeedback(data.error || 'Failed to add member.', 'error');
        }

    } catch (err) {
        console.error('Add member error:', err);
        showFeedback('Something went wrong. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add member';
    }
}

function showFeedback(message, type) {
    const feedback = document.getElementById('add-feedback');
    feedback.textContent = message;
    feedback.className = 'form-feedback ' + type;
    feedback.hidden = false;
}


// ─── Load group data ──────────────────────────────────────────────────────────
async function loadGroupData() {
    const userId = localStorage.getItem('userId');
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('groupId');

    const banner = document.getElementById('status-banner');

    if (!userId || !groupId) {
        banner.textContent = 'Missing session data. Please log in again.';
        banner.className = 'status-banner closed';
        banner.hidden = false;
        return;
    }

    try {
        const token = await auth0Client.getTokenSilently();

        const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const groups = await response.json();
        const group = groups.find(g => String(g.groupId) === String(groupId));

        if (!group) {
            banner.textContent = 'Group not found or you are not a member.';
            banner.className = 'status-banner closed';
            banner.hidden = false;
            return;
        }

        // If user is not admin, redirect to regular group overview
        if (group.userRole !== 'admin') {
            window.location.href = `group-overview.html?groupId=${groupId}`;
            return;
        }

        currentGroup = group;
        renderGroupHeader(group);
        renderMembers(group.members);

    } catch (err) {
        console.error('Load error:', err);
        banner.textContent = 'Error loading group data. Please try again.';
        banner.className = 'status-banner closed';
        banner.hidden = false;
    }
}

// This is for the view contributions button.
//The admin will use it to also view their contributions on the group.

const viewContributionsBtn = document.getElementById("view-contributions-btn");

async function loadAndShowContributions() {
  // Use currentGroup instead of groupSelect (which doesn't exist in admin page)
  const groupId = currentGroup?.groupId;
  const userId = localStorage.getItem('userId');
  
  if (!groupId) {
    alert("No group selected. Please refresh the page.");
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
  // Create modal if it doesn't exist
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
            <th style="padding:8px; text-align:left;">Date Paid</th>
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
      if (contrib.status === "pending") {
        statusColor = "#ff9800";
        statusBg = "#ff980020";
      } else if (contrib.status === "missed" || contrib.status === "overdue") {
        statusColor = "#f44336";
        statusBg = "#f4433620";
      }
      
      html += `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${paidDate}</td>
          <td style="padding:8px;">${formatCurrency(parseFloat(contrib.amount))}</td>
          <td style="padding:8px;"><span style="background:${statusBg}; color:${statusColor}; padding:4px 12px; border-radius:20px;">${contrib.status}</span></td>
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

async function assignTreasurer() {
    const emailInput = document.getElementById('treasurer-email');
    const feedback = document.getElementById('assign-feedback');
    const btn = document.getElementById('btn-assign-treasurer');
    const email = emailInput.value.trim();

    // Reset state
    emailInput.classList.remove('input-error');
    if (feedback) {
        feedback.hidden = true;
        feedback.className = 'form-feedback';
    }

    if (!email || !email.includes('@')) {
        emailInput.classList.add('input-error');
        showFeedbackForAssign('Please enter a valid email address.', 'error');
        return;
    }

    if (!currentGroup) {
        showFeedbackForAssign('No group loaded. Please refresh the page.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Assigning...';

    try {
        const token = await auth0Client.getTokenSilently();

        const response = await fetch(`${config.apiBase}/api/groups/assign-treasurer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                email: email,
                groupId: currentGroup.groupId
            })
        });

        const data = await response.json();

        if (response.ok) {
            showFeedbackForAssign(`${data.member.userName} (${data.member.userEmail}) was assigned as treasurer for ${data.member.groupName} successfully.`, 'success');
            emailInput.value = '';
            // Reload group data to refresh member list
            await loadGroupData();
        } else {
            showFeedbackForAssign(data.error || 'Failed to assign treasurer.', 'error');
        }

    } catch (err) {
        console.error('Assign treasurer error:', err);
        showFeedbackForAssign('Something went wrong. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Assign Treasurer';
    }
}

function showFeedbackForAssign(message, type) {
    const feedback = document.getElementById('assign-feedback');
    if (!feedback) {
        // Create feedback element if it doesn't exist
        const formSection = document.querySelector('.add-treasurer-form');
        const newFeedback = document.createElement('p');
        newFeedback.id = 'assign-feedback';
        newFeedback.className = 'form-feedback';
        formSection.appendChild(newFeedback);
    }
    
    const feedbackEl = document.getElementById('assign-feedback');
    feedbackEl.textContent = message;
    feedbackEl.className = 'form-feedback ' + type;
    feedbackEl.hidden = false;
}

// Fix the event listener - change from 'assign-treasurer-btn' to 'btn-assign-treasurer'
document.getElementById('btn-assign-treasurer').addEventListener('click', assignTreasurer);

document.getElementById('treasurer-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') assignTreasurer();
});


// Added an  event listener for view contributions button
if (viewContributionsBtn) {
  viewContributionsBtn.addEventListener("click", loadAndShowContributions);
}


//Event listeners
document.getElementById('btn-add-member').addEventListener('click', addMember);

document.getElementById('member-email').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addMember();
});

document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
});


// Entry point
function onAuthReady() {
    setAvatar();
    loadGroupData();
}