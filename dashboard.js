// Function to fetch all groups from the backend
async function loadMyGroups() {
    const grid = document.querySelector('.groups-grid');
    //const noGroupsMessage = document.getElementById('noGroups');
    const userId = localStorage.getItem('userId');

    try {
        const response = await fetch(`http://localhost:3000/api/groups_members/${userId}`);
        const Groups = await response.json(); 

        if (Groups.length === 0) {
            //noGroupsMessage.hidden = false;
            grid.hidden = true;
            return;
        }

        grid.innerHTML = ''; 
        grid.hidden = false;
        //noGroupsMessage.hidden = true;

        Groups.forEach(group => {
            const card = document.createElement('article');
            card.className = 'group-card';

            // Accessing the data from the structure
            card.innerHTML = `
                <h2 class="group-name">${group.name}</h2>
                <button class="btnViewGroup" data-id="${group.groupId}">View Group</button>
            `;
            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Fetch error:', error);
        grid.innerHTML = '<p>Could not load your groups.</p>';
        grid.hidden = false;
    }
}

const btnAll = document.getElementById("buttonViewAllGroups");
if (btnAll) {
    btnAll.onclick = () => window.location.href = "allGroups.html";
}

document.querySelector('.groups-grid').addEventListener('click', (e) => {
    // Checking if what was clicked is actually the button
    if (e.target.classList.contains('btnViewGroup')) {
        const groupId = e.target.dataset.id;
        console.log("Navigating to group:", groupId);
        
        // Save the ID so the next page knows which group to load
        localStorage.setItem('selectedGroupId', groupId);
        window.location.href = "group-overview.html";
    }
});

// Run the function when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', loadMyGroups);