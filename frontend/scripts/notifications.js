function renderFooterButtons(group) {
  const footer = document.querySelector(".action-footer");
  footer.innerHTML = ""; 

  //Create a container for the badge
  const badgeWrapper = document.createElement("div");
  badgeWrapper.className = "badge-container has-notification"; // Add "has-notification" to show the dot

  const viewNotificationsBtn = document.createElement("button");
  viewNotificationsBtn.id = "view-notifications-btn";
  viewNotificationsBtn.textContent = "Notifications";

  //Click Logic
  viewNotificationsBtn.addEventListener("click", () => {
    // Remove the notification dot immediately
    badgeWrapper.classList.remove("has-notification");
    
    // Call the existing function to show the modal
    loadAndShowNotifications(group.groupId);
  });
  badgeWrapper.appendChild(viewNotificationsBtn);
  footer.appendChild(badgeWrapper);
}

async function fetchMeetings(groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/meetings/group/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch meetings');
    return await response.json();
}

async function loadAndShowNotifications(groupId) {
    const userId = parseInt(localStorage.getItem('userId'));

    if (!groupId) { alert('No group selected. Please refresh the page.'); return; }

    // Always remove and recreate the modal so the content section is guaranteed fresh
    const existing = document.getElementById('notifications-modal');
    if (existing) existing.remove();

    const modal = document.createElement('aside');
    modal.id        = 'notifications-modal';
    modal.className = 'modal-overlay';

    const article  = document.createElement('article');
    article.className = 'modal';

    const header   = document.createElement('header');
    header.className = 'modal-header';
    header.innerHTML = '<h2 class="modal-title">Meetings</h2>';

    const closeBtn = document.createElement('button');
    closeBtn.className  = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close notifications');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => { modal.remove(); });
    header.appendChild(closeBtn);

    const content  = document.createElement('section');
    content.className = 'modal-section';

    article.appendChild(header);
    article.appendChild(content);
    modal.appendChild(article);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    content.innerHTML = '<p style="text-align:center;padding:1.5rem;color:#64748b;">Loading...</p>';
    modal.hidden = false;

    try {
        const meetings = await fetchMeetings(groupId);

        if (!meetings || meetings.length === 0) {
            content.innerHTML = '<p style="text-align:center;padding:2rem;color:#64748b;font-style:italic;">No upcoming meetings scheduled for this group.</p>';
            return;
        }

        let html = `
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="border-bottom:1.5px solid #e0f7f6;">
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">title</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">agenda</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">date</th>
                        <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">time</th>
                    </tr>
                </thead>
                <tbody>
        `;

        meetings.forEach(m => {
            
            const date = m.Date 
                ? new Date(m.Date).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' }) 
                : '—';

            const title  = m.title || 'Untitled Meeting';
            const agenda = m.agenda || 'No agenda provided';
            const time   = m.Time || '—';

            html += `
                <tr style="background:white; border-bottom:1px solid #f0fafa;">
                    <td style="padding:11px 12px; font-weight:700; color:#0f172a;">${title}</td>
                    <td style="padding:11px 12px; color:#64748b;">${agenda}</td>
                    <td style="padding:11px 12px; color:#0f172a;">${date}</td>
                    <td style="padding:11px 12px; color:#0f172a;">
                        <span style="background:#e0f7f6; color:#034e52; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700;">
                            ${time}
                        </span>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;

    } catch (error) {
        content.innerHTML = `<p style="text-align:center;padding:2rem;color:#991b1b;">Could not load meetings: ${error.message}</p>`;
    }
}