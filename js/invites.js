// =============================================
// invites.js — Invite management logic
// =============================================

// Populate the group name subtitle from appState
// =============================================
// invites.js — Invite management logic
// =============================================

// Use default group ID 1
const DEFAULT_GROUP_ID = 1;

// Populate the group name subtitle from appState
(function populateInvites() {
  var subtitle = document.getElementById('invites-group-name');
  subtitle.textContent = appState.groupName || '';
})();


// Load existing invites when page loads
async function loadInvites() {
  try {
    const response = await fetch(`/api/invites/group/${DEFAULT_GROUP_ID}`);
    if (response.ok) {
      const data = await response.json();
      
      if (data.invites && data.invites.length > 0) {
        document.getElementById('invite-empty').hidden = true;
        document.getElementById('invite-table').hidden = false;
        
        // Clear existing rows
        const tbody = document.getElementById('invite-body');
        tbody.innerHTML = '';
        
        // Add each invite to the table
        data.invites.forEach(invite => {
          addInviteRow(invite);
        });
      }
    }
  } catch (error) {
    console.error('Error loading invites:', error);
  }
}

function addInviteRow(invite) {
  var tbody = document.getElementById('invite-body');
  var rowId = 'inv-' + invite.group_inviteId;

  var row = document.createElement('tr');
  row.id = rowId;
  
  var statusClass = invite.status === 'active' ? 'pending' : 'revoked';
  var statusText = invite.status === 'active' ? 'Pending' : 'Revoked';
  
  row.innerHTML =
    '<td>' + invite.email + '</td>' +
    '<td><span class="badge ' + statusClass + '">' + statusText + '</span></td>' +
    '<td>' + new Date(invite.createdAt).toLocaleDateString() + '</td>' +
    '<td><button type="button" class="btn danger sm" onclick="revokeInvite(\'' + invite.group_inviteId + '\')">Revoke</button></td>';

  tbody.insertBefore(row, tbody.firstChild);
}

async function sendInvite() {
  var email = document.getElementById('invite-email').value.trim();

  // Validate email
  if (!email || !email.includes('@')) {
    document.getElementById('err-email').classList.add('show');
    document.getElementById('invite-email').classList.add('error-border');
    return;
  }

  document.getElementById('err-email').classList.remove('show');
  document.getElementById('invite-email').classList.remove('error-border');

  try {
    const response = await fetch('/api/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        groupId: DEFAULT_GROUP_ID,
        email: email,
        createdBy: 1
      })
    });

    if (response.ok) {
      const data = await response.json();
      
      // Add the invite row to the table
      addInviteRow(data.invite);
      
      // Clear the input
      document.getElementById('invite-email').value = '';
      
      // Hide empty state, show table
      document.getElementById('invite-empty').hidden = true;
      document.getElementById('invite-table').hidden = false;
      
      // Update the shareable link
      document.querySelector('.link-url').textContent = data.inviteLink || 'stokvel.app/invite/' + data.invite.token;
    } else {
      const error = await response.json();
      alert('Error: ' + (error.error || 'Failed to send invite'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error sending invite. Please try again.');
  }
}

async function revokeInvite(inviteId) {
  try {
    const response = await fetch(`/api/invites/${inviteId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      var row = document.getElementById('inv-' + inviteId);
      if (row) {
        row.querySelector('.badge').className = 'badge revoked';
        row.querySelector('.badge').textContent = 'Revoked';
        
        var btn = row.querySelector('button');
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'default';
      }
    } else {
      alert('Failed to revoke invite');
    }
  } catch (error) {
    console.error('Error revoking invite:', error);
    alert('Error revoking invite');
  }
}

function copyLink() {
  var linkText = document.querySelector('.link-url').textContent;
  navigator.clipboard.writeText(linkText);
  var msg = document.getElementById('copied-msg');
  msg.hidden = false;
  setTimeout(function() { msg.hidden = true; }, 2000);
}

// Load invites when page loads
loadInvites();