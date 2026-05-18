async function fetchMeetings(groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/meetings/group/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch meetings');
    return await response.json();
}

async function fetchAnnouncements(groupId) {
    try {
        const token    = await auth0Client.getTokenSilently();
        const response = await fetch(`${config.apiBase}/api/groups/${groupId}/announcements`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch announcements');
        return await response.json();
    } catch (error) {
        console.error('Error fetching announcements:', error);
        return [];
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadAndShowNotifications(groupId) {
    if (!groupId) { alert('No group selected. Please refresh the page.'); return; }

    const existing = document.getElementById('notifications-modal');
    if (existing) existing.remove();

    const modal = document.createElement('aside');
    modal.id        = 'notifications-modal';
    modal.className = 'modal-overlay';

    const article = document.createElement('article');
    article.className = 'modal';

    // Header
    const header = document.createElement('header');
    header.className = 'modal-header';
    header.innerHTML = '<h2 class="modal-title">Notifications</h2>';

    const closeBtn = document.createElement('button');
    closeBtn.className   = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close notifications');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => modal.remove());
    header.appendChild(closeBtn);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;border-bottom:1.5px solid #e0f7f6;padding:0 16px;gap:4px;';

    function makeTab(label, active) {
        const btn = document.createElement('button');
        btn.textContent  = label;
        btn.style.cssText = `
            padding:10px 16px;font-size:13px;font-weight:700;
            border:none;background:none;cursor:pointer;
            font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;
            border-bottom:2.5px solid transparent;margin-bottom:-1.5px;
            color:${active ? '#0e9490' : '#64748b'};
            border-bottom-color:${active ? '#0e9490' : 'transparent'};
            transition:color 0.15s,border-color 0.15s;
        `;
        return btn;
    }

    const meetingsTab      = makeTab('📅 Meetings', true);
    const announcementsTab = makeTab('📢 Announcements', false);
    tabBar.appendChild(meetingsTab);
    tabBar.appendChild(announcementsTab);

    // Content panes
    const meetingsPane = document.createElement('section');
    meetingsPane.className = 'modal-section';

    const announcementsPane = document.createElement('section');
    announcementsPane.className = 'modal-section';
    announcementsPane.style.display = 'none';

    const loading = '<p style="text-align:center;padding:1.5rem;color:#64748b;">Loading...</p>';
    meetingsPane.innerHTML      = loading;
    announcementsPane.innerHTML = loading;

    // Tab switching
    function switchTab(name) {
        const isMeetings = name === 'meetings';
        meetingsPane.style.display      = isMeetings ? 'block' : 'none';
        announcementsPane.style.display = isMeetings ? 'none'  : 'block';
        meetingsTab.style.color                   = isMeetings ? '#0e9490' : '#64748b';
        meetingsTab.style.borderBottomColor       = isMeetings ? '#0e9490' : 'transparent';
        announcementsTab.style.color              = isMeetings ? '#64748b' : '#0e9490';
        announcementsTab.style.borderBottomColor  = isMeetings ? 'transparent' : '#0e9490';

        if (!isMeetings) {
            localStorage.setItem(`announcements_last_viewed_${groupId}`, new Date().toISOString());
            const badge = document.getElementById('announcements-badge');
            if (badge) badge.hidden = true;
        }
    }

    meetingsTab.addEventListener('click',      () => switchTab('meetings'));
    announcementsTab.addEventListener('click', () => switchTab('announcements'));

    // Assemble
    article.appendChild(header);
    article.appendChild(tabBar);
    article.appendChild(meetingsPane);
    article.appendChild(announcementsPane);
    modal.appendChild(article);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.hidden = false;

    // Load meetings
    fetchMeetings(groupId).then(meetings => {
        if (!meetings || meetings.length === 0) {
            meetingsPane.innerHTML = '<p style="text-align:center;padding:2rem;color:#64748b;font-style:italic;">No upcoming meetings scheduled.</p>';
            return;
        }
        let html = `
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:1.5px solid #e0f7f6;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Title</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Agenda</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Date</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Time</th>
                    </tr>
                </thead><tbody>`;
        meetings.forEach(m => {
            const date   = m.Date ? new Date(m.Date).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' }) : '—';
            html += `
                <tr style="background:white;border-bottom:1px solid #f0fafa;">
                    <td style="padding:11px 12px;font-weight:700;color:#0f172a;">${m.title || 'Untitled Meeting'}</td>
                    <td style="padding:11px 12px;color:#64748b;">${m.agenda || 'No agenda provided'}</td>
                    <td style="padding:11px 12px;color:#0f172a;">${date}</td>
                    <td style="padding:11px 12px;color:#0f172a;">
                        <span style="background:#e0f7f6;color:#034e52;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${m.Time || '—'}</span>
                    </td>
                </tr>`;
        });
        html += '</tbody></table>';
        meetingsPane.innerHTML = html;
    }).catch(err => {
        meetingsPane.innerHTML = `<p style="text-align:center;padding:2rem;color:#991b1b;">Could not load meetings: ${err.message}</p>`;
    });

    // Load announcements
    fetchAnnouncements(groupId).then(announcements => {
        if (!announcements || announcements.length === 0) {
            announcementsPane.innerHTML = '<p style="text-align:center;padding:2rem;color:#64748b;font-style:italic;">No announcements yet.</p>';
            return;
        }
        let html = '';
        announcements.forEach(a => {
            const postedDate = new Date(a.postedAt).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' });
            const postedTime = new Date(a.postedAt).toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' });
            const author     = a.author?.name || a.author?.email || 'Group Admin';
            html += `
                <div style="padding:14px 16px;border-bottom:1px solid #f0fafa;">
                    <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">${escapeHtml(a.title)}</p>
                    <p style="font-size:13px;color:#374151;margin:0 0 8px;">${escapeHtml(a.content)}</p>
                    <p style="font-size:11px;color:#64748b;margin:0;">👤 ${escapeHtml(author)} &nbsp;·&nbsp; 📅 ${postedDate} at ${postedTime}</p>
                </div>`;
        });
        announcementsPane.innerHTML = html;
    }).catch(err => {
        announcementsPane.innerHTML = `<p style="text-align:center;padding:2rem;color:#991b1b;">Could not load announcements: ${err.message}</p>`;
    });
}

// Badge check — called by both pages
async function checkNewNotifications(groupId, wrapper) {
    try {
        const meetings = await fetchMeetings(groupId);
        if (meetings && meetings.length > 0) wrapper.classList.add('has-notification');
    } catch (e) { console.error('Badge check failed', e); }

    try {
        const announcements = await fetchAnnouncements(groupId);
        const badge = document.getElementById('announcements-badge');
        if (badge && announcements && announcements.length > 0) {
            const lastViewed = localStorage.getItem(`announcements_last_viewed_${groupId}`);
            const hasNew = !lastViewed || new Date(announcements[0].postedAt) > new Date(lastViewed);
            badge.hidden      = !hasNew;
            badge.textContent = hasNew ? announcements.length : '0';
        }
    } catch (e) { console.error('Announcements badge check failed', e); }
}