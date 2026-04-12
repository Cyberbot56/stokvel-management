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

async function loadAllGroups() {
    const grid = document.querySelector('.groups-grid');
    const noGroups = document.getElementById('noGroups');
    const loadError = document.getElementById('loadError');

    try {
        // FIXED: use auth0Client.getTokenSilently() — token was never stored
        // in localStorage under 'token', so localStorage.getItem('token') always returned null
        const token = await auth0Client.getTokenSilently();

        const response = await fetch(`${config.apiBase}/api/groups`, {
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
                <div class="card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0e9490" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                    </svg>
                </div>
                <h2 class="groupName">${sanitise(group.name)}</h2>
                <p class="group-desc">${sanitise(group.description) || 'No description provided.'}</p>
                <div class="card-meta">
                    <span class="meta-members">${group.totalMembers ?? 0} members</span>
                    <span class="meta-amount">R${group.contributionAmount ?? 0} / ${group.cycleType ?? 'month'}</span>
                </div>
                <button class="btnViewGroup" data-id="${sanitise(group.groupId)}">View Group</button>
            `;

            card.querySelector('.btnViewGroup').addEventListener('click', () => {
                // Route admins to the admin page, members to the regular overview
                const dest = group.userRole === 'admin' ? 'group-admin.html' : 'group-overview.html';
                window.location.href = `pages/${dest}?groupId=${group.groupId}`;
            });

            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Fetch error:', error);
        if (loadError) loadError.hidden = false;
        grid.hidden = true;
    }
}

// FIXED: My Groups navigates to pages/my-groups.html
const btnMy = document.getElementById('buttonMyGroups');
if (btnMy) {
    btnMy.onclick = () => window.location.href = 'pages/my-groups.html';
}

const btnCreate = document.getElementById('buttonCreateGroup');
if (btnCreate) {
    btnCreate.onclick = () => window.location.href = 'pages/create-group.html';
}

// onAuthReady is called by auth_service.js once auth0Client is fully initialised
function onAuthReady() {
    setAvatar();
    loadAllGroups();
}