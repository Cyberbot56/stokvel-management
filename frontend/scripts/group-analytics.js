// scripts/group-analytics.js
// Sprint 4 Story 3 - Analytics Dashboard

let complianceChart = null;
let payoutsChart = null;
let breakdownChart = null;

// Helper: format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 0
    }).format(amount);
}

// Helper: destroy existing chart
function destroyChart(chart) {
    if (chart) {
        chart.destroy();
        chart = null;
    }
    return null;
}

// Fetch analytics data from API
async function fetchAnalyticsData(groupId) {
    const token = await auth0Client.getTokenSilently();
    
    const [overview, members, payouts] = await Promise.all([
        fetch(`${config.apiBase}/api/groups/${groupId}/analytics/overview`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        fetch(`${config.apiBase}/api/groups/${groupId}/analytics/members`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        fetch(`${config.apiBase}/api/groups/${groupId}/analytics/payouts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json())
    ]);
    
    return { overview, members, payouts };
}

// Update summary cards
function updateSummaryCards(overview, members) {
    document.getElementById('an-members').textContent = overview.totalMembers || 0;
    
    // Calculate compliance rate from member data
    const totalMembers = members.members?.length || 0;
    const excellentCount = members.summary?.excellent || 0;
    const complianceRate = totalMembers > 0 ? Math.round((excellentCount / totalMembers) * 100) : 0;
    document.getElementById('an-compliance').textContent = `${complianceRate}%`;
    
    document.getElementById('an-paidout').textContent = formatCurrency(overview.totalPayedOut || 0);
    document.getElementById('an-collected').textContent = formatCurrency(overview.totalCollected || 0);
}

// Render compliance bar chart (per member)
function renderComplianceChart(membersData) {
    const container = document.getElementById('compliance-chart-wrap');
    if (!container) return;
    
    const members = membersData.members || [];
    if (members.length === 0) {
        container.innerHTML = '<p class="chart-loading">No member data available</p>';
        return;
    }
    
    // Prepare data (limit to top 15 members for readability)
    const displayMembers = members.slice(0, 15);
    const labels = displayMembers.map(m => m.name.length > 20 ? m.name.substring(0, 17) + '...' : m.name);
    const paidData = displayMembers.map(m => m.paid || 0);
    const missedData = displayMembers.map(m => m.missed || 0);
    const pendingData = displayMembers.map(m => m.pending || 0);
    
    // Clear container and create canvas
    container.innerHTML = '<canvas id="compliance-canvas" style="max-height: 280px; width: 100%;"></canvas>';
    const canvas = document.getElementById('compliance-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    complianceChart = destroyChart(complianceChart);
    
    complianceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Paid', data: paidData, backgroundColor: '#0e9490', borderRadius: 4 },
                { label: 'Missed', data: missedData, backgroundColor: '#ef4444', borderRadius: 4 },
                { label: 'Pending', data: pendingData, backgroundColor: '#f59e0b', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { stacked: true, ticks: { font: { size: 10 } } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Number of Contributions' } }
            }
        }
    });
}

// Render payout history bar chart
function renderPayoutsChart(payoutsData) {
    const container = document.getElementById('payouts-chart-wrap');
    if (!container) return;
    
    const payouts = payoutsData.payouts || [];
    if (payouts.length === 0) {
        container.innerHTML = '<p class="chart-loading">No payout data available</p>';
        return;
    }
    
    // Sort by cycle number
    const sortedPayouts = [...payouts].sort((a, b) => a.cycleNumber - b.cycleNumber);
    const labels = sortedPayouts.map(p => `Cycle ${p.cycleNumber}`);
    const amounts = sortedPayouts.map(p => p.amount);
    const statusColors = sortedPayouts.map(p => p.status === 'completed' ? '#0e9490' : '#f59e0b');
    
    container.innerHTML = '<canvas id="payouts-canvas" style="max-height: 280px; width: 100%;"></canvas>';
    const canvas = document.getElementById('payouts-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    payoutsChart = destroyChart(payoutsChart);
    
    payoutsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Payout Amount (ZAR)',
                data: amounts,
                backgroundColor: statusColors,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: { callbacks: { label: (ctx) => `Amount: ${formatCurrency(ctx.raw)}` } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Amount (ZAR)' } }
            }
        }
    });
}

// Render contribution breakdown doughnut chart
function renderBreakdownChart(membersData) {
    const container = document.getElementById('breakdown-chart-wrap');
    if (!container) return;
    
    const members = membersData.members || [];
    if (members.length === 0) {
        container.innerHTML = '<p class="chart-loading">No data available</p>';
        return;
    }
    
    // Aggregate totals
    let totalPaid = 0, totalMissed = 0, totalPending = 0;
    members.forEach(m => {
        totalPaid += m.paid || 0;
        totalMissed += m.missed || 0;
        totalPending += m.pending || 0;
    });
    
    container.innerHTML = '<canvas id="breakdown-canvas" style="max-height: 220px; width: 100%;"></canvas>';
    const canvas = document.getElementById('breakdown-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    breakdownChart = destroyChart(breakdownChart);
    
    breakdownChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Paid', 'Missed', 'Pending'],
            datasets: [{
                data: [totalPaid, totalMissed, totalPending],
                backgroundColor: ['#0e9490', '#ef4444', '#f59e0b'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} contributions (${Math.round(ctx.raw / (totalPaid + totalMissed + totalPending) * 100)}%)` } }
            }
        }
    });
}

// Main function called when analytics tab is opened
async function loadAnalytics(groupId) {
    if (!groupId) {
        console.error('No groupId provided for analytics');
        return;
    }
    
    // Show loading states
    document.getElementById('an-members').textContent = 'Loading...';
    document.getElementById('an-compliance').textContent = 'Loading...';
    document.getElementById('an-paidout').textContent = 'Loading...';
    document.getElementById('an-collected').textContent = 'Loading...';
    
    const containers = ['compliance-chart-wrap', 'payouts-chart-wrap', 'breakdown-chart-wrap'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p class="chart-loading">Loading chart...</p>';
    });
    
    try {
        const data = await fetchAnalyticsData(groupId);
        
        updateSummaryCards(data.overview, data.members);
        renderComplianceChart(data.members);
        renderPayoutsChart(data.payouts);
        renderBreakdownChart(data.members);
        
    } catch (error) {
        console.error('Error loading analytics:', error);
        document.getElementById('an-members').textContent = 'Error';
        document.getElementById('an-compliance').textContent = 'Error';
        document.getElementById('an-paidout').textContent = 'Error';
        document.getElementById('an-collected').textContent = 'Error';
        
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<p class="chart-loading" style="color:#ef4444;">Failed to load data. Please try again.</p>';
        });
    }
}

// Export functions for external use
window.loadAnalytics = loadAnalytics;
window.destroyAnalyticsCharts = () => {
    complianceChart = destroyChart(complianceChart);
    payoutsChart = destroyChart(payoutsChart);
    breakdownChart = destroyChart(breakdownChart);
};