function renderFooterButtons(group) {
  const footer   = document.querySelector(".action-footer");
  

  footer.innerHTML = ""; // clear existing buttons
  // Everyone gets Notifications

  const viewNotificationsBtn = document.createElement("button");
  viewNotificationsBtn.id          = "view-notifications-btn";
  viewNotificationsBtn.textContent = "Notifications";
  viewNotificationsBtn.addEventListener("click", () => {
    loadAndShowNotifications(groupSelect.value);
  });
  footer.appendChild(viewNotificationsBtn);

}

async function fetchMeetings(groupId) {
    const token    = await auth0Client.getTokenSilently();
    const response = await fetch(`${config.apiBase}/api/meeting/group/${groupId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch meetings');
    return await response.json();
}

