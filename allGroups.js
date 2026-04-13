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

// Store both lists once fetched so toggling doesn't re-fetch
let allGroupsCache = [];
let myGroupsCache = [];
let currentView = 'all'; // 'all' or 'mine'

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
            const dest = group.userRole === 'admin' ? 'group-admin.html' : 'group-overview.html';
            window.location.href = `pages/${dest}?groupId=${group.groupId}`;
        });

        grid.appendChild(card);
    });
}

function setActiveButton(view) {
    const btnAll = document.getElementById('buttonAllGroups');
    const btnMy = document.getElementById('buttonMyGroups');
    const headerTitle = document.querySelector('.header-title');

    if (view === 'all') {
        btnAll.classList.add('active');
        btnMy.classList.remove('active');
        if (headerTitle) headerTitle.textContent = 'All Groups';
    } else {
        btnMy.classList.add('active');
        btnAll.classList.remove('active');
        if (headerTitle) headerTitle.textContent = 'My Groups';
    }
}

function showAllGroups() {
    currentView = 'all';
    setActiveButton('all');
    renderGroups(allGroupsCache);
}

function showMyGroups() {
    currentView = 'mine';
    setActiveButton('mine');
    renderGroups(myGroupsCache);
}

async function loadAllGroups() {
    const grid = document.querySelector('.groups-grid');
    const noGroups = document.getElementById('noGroups');
    const loadError = document.getElementById('loadError');

    try {
        const token = await auth0Client.getTokenSilently();
        const userId = localStorage.getItem('userId');

        // Fetch both in parallel
        const [allGroupsRes, myGroupsRes] = await Promise.all([
            fetch(`${config.apiBase}/api/groups`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${config.apiBase}/api/groups_members/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        if (!allGroupsRes.ok) throw new Error(`Server error: ${allGroupsRes.status}`);
        if (!myGroupsRes.ok) throw new Error(`Server error: ${myGroupsRes.status}`);

        const allGroups = await allGroupsRes.json();
        const myGroups = await myGroupsRes.json();

        // Build role map from user's memberships
        const roleMap = {};
        myGroups.forEach(g => { roleMap[g.groupId] = g.userRole; });

        // All groups with role merged in
        allGroupsCache = allGroups.map(group => ({
            ...group,
            userRole: roleMap[group.groupId] ?? null
        }));

        // My groups already have userRole from the API
        myGroupsCache = myGroups;

        // Default view is all groups
        showAllGroups();

    } catch (error) {
        console.error('Fetch error:', error);
        if (loadError) loadError.hidden = false;
        grid.hidden = true;
    }
}

// Button listeners
const btnMy = document.getElementById('buttonMyGroups');
if (btnMy) btnMy.onclick = showMyGroups;

const btnAll = document.getElementById('buttonAllGroups');
if (btnAll) btnAll.onclick = showAllGroups;

const btnCreate = document.getElementById('buttonCreateGroup');
if (btnCreate) {
    btnCreate.onclick = () => window.location.href = 'pages/create-group.html';
}

function onAuthReady() {
    setAvatar();
    setWelcome();
    loadAllGroups();
}
