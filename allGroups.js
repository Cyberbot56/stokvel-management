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

const setWelcome = () => {
    const name = localStorage.getItem('userName') || '';
    const firstName = name.split(' ')[0] || 'there';
    const greeting = document.getElementById('welcomeGreeting');
    if (greeting) greeting.textContent = `Welcome back, ${firstName}!`;
};

// Renders the user's groups into the card grid.
// Admins route to group-admin.html, members route to group-overview.html.
function renderGroups(groups) {
    const grid = document.querySelector('.groups-grid');
    const noGroups = document.getElementById('noGroups');

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
            <h2 class="groupName">${sanitise(group.name)}</h2>
            <p class="group-desc">${sanitise(group.description) || 'No description provided.'}</p>
            <dl class="card-meta">
                <dt class="meta-members">${group.totalMembers ?? 0} members</dt>
                <dd class="meta-amount">R${group.contributionAmount ?? 0} / ${group.cycleType ?? 'month'}</dd>
            </dl>
            <button class="btnViewGroup" data-id="${sanitise(group.groupId)}">View Group</button>
        `;

        card.querySelector('.btnViewGroup').addEventListener('click', () => {
            const dest = group.userRole === 'admin' ? 'group-admin.html' : 'group-overview.html';
            window.location.href = `/pages/${dest}?groupId=${group.groupId}`;
        });

        grid.appendChild(card);
    });
}

// Fetches only the groups the logged-in user belongs to and renders them automatically.
// The All Groups / My Groups toggle has been removed — dashboard always shows the user's own groups.
async function loadMyGroups() {
    const grid = document.querySelector('.groups-grid');
    const loadError = document.getElementById('loadError');
    const userId = localStorage.getItem('userId');

    if (!userId) {
        console.error('No userId in localStorage — user may not be logged in.');
        if (loadError) loadError.hidden = false;
        return;
    }

    try {
        const token = await auth0Client.getTokenSilently();

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

// onAuthReady is called by auth_service.js once auth0Client is fully initialised
function onAuthReady() {
    setAvatar();
    setWelcome();
    loadMyGroups();

    // Wire up Create Group button here so it's guaranteed to run after the DOM
    // is fully ready and auth_service.js has finished initialising
    const btnCreate = document.getElementById('buttonCreateGroup');
    if (btnCreate) {
        btnCreate.onclick = () => window.location.href = '/pages/create-group.html';
    }
}