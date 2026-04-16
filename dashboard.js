const sanitise = (str) => {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
};

const setAvatar = () => {
    const name = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
};

async function loadMyGroups() {
    const grid = document.querySelector('.groups-grid');
    const noGroups = document.getElementById('noGroups');
    const loadError = document.getElementById('loadError');
    const userId = localStorage.getItem('userId');

    if (!userId) {
        console.error('No userId found in localStorage — user may not be logged in.');
        if (loadError) loadError.hidden = false;
        return;
    }

    try {
        // FIXED: use config.apiBase instead of hardcoded localhost
        // FIXED: send auth token with request
        const token = await auth0Client.getTokenSilently();

        const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const groups = await response.json();

        if (groups.length === 0) {
            grid.hidden = true;
            if (noGroups) noGroups.hidden = false;
            return;
        }

        grid.innerHTML = '';
        grid.hidden = false;
        if (noGroups) noGroups.hidden = true;

        groups.forEach(group => {
            const card = document.createElement('article');
            card.className = 'group-card';

            card.innerHTML = `
                <figure class="card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0e9490" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                    </svg>
                </figure>
                <h2 class="group-name">${sanitise(group.name)}</h2>
                <p class="group-desc">${sanitise(group.description) || 'No description provided.'}</p>
                <dl class="card-meta">
                    <dt class="meta-members">${group.totalMembers ?? 0} members</dt>
                    <dd class="meta-amount">R${group.contributionAmount ?? 0} / ${group.cycleType ?? 'month'}</dd>
                </dl>
                <button class="btnViewGroup" data-id="${sanitise(group.groupId)}">View Group</button>
            `;

            // FIXED: pass groupId as URL param instead of localStorage
            // FIXED: corrected path to group-overview.html
            card.querySelector('.btnViewGroup').addEventListener('click', () => {
                // Route admins to the admin page, members to the regular overview
                const dest = group.userRole === 'admin' ? 'group-admin.html' : 'group-overview.html';
                window.location.href = `${dest}?groupId=${group.groupId}`;
            });

            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Fetch error:', error);
        if (loadError) loadError.hidden = false;
        if (grid) grid.hidden = true;
    }
}

// FIXED: button ID matches what's in my-groups.html
const btnAll = document.getElementById('buttonViewAllGroups');
if (btnAll) {
    btnAll.onclick = () => window.location.href = '../dashboard.html';
}

const btnCreate = document.getElementById('buttonCreateGroup');
if (btnCreate) {
    btnCreate.onclick = () => window.location.href = 'create-group.html';
}

// onAuthReady is called by auth_service.js once auth0Client is fully initialised
function onAuthReady() {
    setAvatar();
    loadMyGroups();
}
