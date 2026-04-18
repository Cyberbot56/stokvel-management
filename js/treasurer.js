//Get Treasurer ID from localStorage
const treasurerId = localStorage.getItem("userId");

//Get groupId from the URL
const urlParams = new URLSearchParams(window.location.search);
const currentGroupId = urlParams.get('id') || 1;

async function initDashboard() {
    // Check if treasurer is logged in
    if (!treasurerId) {
        console.error("No treasurer found in localStorage. Redirecting to login...");
        window.location.href = "pages/index.html";
        return;
    }

    // Set the user's name on the UI
    document.getElementById('avatar').textContent = localStorage.getItem("userName")?.substring(0, 2).toUpperCase();

    loadGroupData();
}

async function loadGroupData() {
    const response = await fetch(`/api/groups/${currentGroupId}/treasurer-view`);
    const members = await response.json();

    const select = document.getElementById('member-select');
    const tableBody = document.getElementById('member-list-body');
    
    // Clear existing
    select.innerHTML = '<option value="">Choose a member...</option>';
    tableBody.innerHTML = '';

    members.forEach(m => {
        const member = m.users;
        const lastPayment = member.contributions[0];

        // Fill Select Dropdown
        const opt = document.createElement('option');
        opt.value = member.userId;
        opt.textContent = member.name;
        select.appendChild(opt);

        // Fill Tracking Table
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <figure class="member-cell" style="cursor: pointer;" onclick="viewHistory(${member.userId})">
                    <p class="member-avatar">${member.name.substring(0,2).toUpperCase()}</p>
                    <figcaption>
                        <strong class="member-name-text" style="color: #0e9490; text-decoration: underline;">${member.name}</strong>
                        <p class="member-email-text">${member.email}</p>
                    </figcaption>
                </figure>
            </td>
            <td><time>${lastPayment ? new Date(lastPayment.paidAt).toLocaleDateString() : '—'}</time></td>
            <td>
                <span class="status-pill ${lastPayment ? 'paid' : 'pending'}">
                    ${lastPayment ? 'Paid' : 'Pending'}
                </span>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    document.getElementById('member-count').textContent = `${members.length} Members`;
}

// Handle Form Submission
document.getElementById('record-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        userId: document.getElementById('member-select').value,
        groupId: currentGroupId,
        amount: document.getElementById('payment-amount').value,
        treasurerId: treasurerId,
        paidAt: document.getElementById('payment-date').value
    };

    try {
        const res = await fetch('/api/contributions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if(res.ok) {
            alert('Payment recorded successfully!');
            loadGroupData(); 
            e.target.reset();
        }
    } catch (err) {
        console.error("Payment failed", err);
    }
});

/*function viewHistory(userId) {
    // Redirect to a detailed history page
    window.location.href = `/member-history.html?userId=${userId}&groupId=${currentGroupId}`;
}*/

initDashboard();