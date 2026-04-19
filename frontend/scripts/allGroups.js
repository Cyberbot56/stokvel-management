const sanitise = (str) => {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
};

function setAvatar() {
    const name     = localStorage.getItem('userName') || '';
    const initials = name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2);
    const avatar   = document.getElementById('avatar');
    if (avatar) avatar.textContent = initials || '?';
}

const setWelcome = () => {
    const name      = localStorage.getItem('userName') || '';
    const firstName = name.split(' ')[0] || 'there';
    const greeting  = document.getElementById('welcomeGreeting');
    if (greeting) greeting.textContent = `Welcome back, ${firstName}!`;
};

// Renders the user's groups into the card grid.
// Routes each group to the correct page based on the user's role:
// admin → group-admin.html, treasurer → group-treasurer.html, member → group-overview.html
function renderGroups(groups) {
    const grid     = document.querySelector('.groups-grid');
    const noGroups = document.getElementById('noGroups');

    if (groups.length === 0) {
        grid.hidden = true;
        if (noGroups) noGroups.hidden = false;
        return;
    }

    grid.innerHTML = '';
    grid.hidden    = false;
    if (noGroups) noGroups.hidden = true;

    groups.forEach(group => {
        const card       = document.createElement('article');
        card.className   = 'group-card';

        card.innerHTML = `
            <figure class="card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#0e9490" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
            </figure>
            <h2 class="groupName">${sanitise(group.name)}</h2>
            <p class="group-desc">${sanitise(group.description) || 'No description provided.'}</p>
            <dl class="card-meta">
                <dt class="meta-members">${group.totalMembers ?? 0} members</dt>
                <dd class="meta-amount">R${group.contributionAmount ?? 0} / ${group.cycleType ?? 'month'}</dd>
            </dl>
            <button class="btnViewGroup" data-id="${sanitise(group.groupId)}">View Group</button>
        `;

        card.querySelector('.btnViewGroup').addEventListener('click', () => {
            let destination;
            if (group.userRole === 'admin') {
                destination = 'group-admin.html';
            } else if (group.userRole === 'treasurer') {
                destination = 'group-treasurer.html';
            } else {
                destination = 'group-overview.html';
            }
            window.location.href = `${destination}?groupId=${group.groupId}`;
        });

        grid.appendChild(card);
    });
}

// Fetches only the groups the logged-in user belongs to and renders them automatically.
// The All Groups / My Groups toggle has been removed — dashboard always shows the user's own groups.
async function loadMyGroups() {
    const grid      = document.querySelector('.groups-grid');
    const loadError = document.getElementById('loadError');
    const userId    = localStorage.getItem('userId');

    if (!userId) {
        console.error('No userId in localStorage — user may not be logged in.');
        if (loadError) loadError.hidden = false;
        return;
    }

    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups_members/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const groups = await response.json();
        renderGroups(groups);

    } catch (error) {
        console.error('Fetch error:', error);
        if (loadError) loadError.hidden = false;
        if (grid) grid.hidden = true;
    }
}

// Wire up Create Group button inside onAuthReady so it fires safely after auth initialises
function onAuthReady() {
    setAvatar();
    setWelcome();
    loadMyGroups();

    const btnCreate = document.getElementById('buttonCreateGroup');
    if (btnCreate) {
        btnCreate.onclick = () => window.location.href = 'create-group.html';
    }
}