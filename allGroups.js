// Function to fetch all groups from the backend
async function loadAllGroups() {
    const grid = document.querySelector('.groups-grid');
    const noGroupsMessage = document.getElementById('noGroups');

    try {
        // Calling backend endpoint
        const response = await fetch('/api/groups'); 
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const groups = await response.json();

        //Check if there is data
        if (groups.length === 0) {
            noGroupsMessage.hidden = false;
            grid.hidden = true;
            return;
        }

        // Clear the grid and show it
        grid.innerHTML = ''; 
        grid.hidden = false;
        noGroupsMessage.hidden = true;

        //inject HTML in each group
        groups.forEach(group => {
            const card = document.createElement('article');
            card.className = 'group-card';

            card.innerHTML = `
                <h2 class="group-name">${group.name}</h2>
                <button class="btnViewGroup" data-id="${group.groupId}">View Group</button>
            `;
            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Fetch error:', error);
        grid.innerHTML = '<p>Error loading groups. Please try again later.</p>';
        grid.hidden = false;
    }
}

//Going back to dashboard
const btnMy = document.getElementById("buttonMyGroups");
if (btnMy) {
    btnMy.onclick = () => window.location.href = "dashboard.html";
}

const btnCreate = document.getElementById("buttonCreateGroup");
/*if (btnCreate) {
    btnCreate.onclick = () => window.location.href = ;
}*/
// Run the function when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', loadAllGroups);