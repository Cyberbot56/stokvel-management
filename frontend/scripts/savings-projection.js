// ─── Savings Projection (shared across member, treasurer, admin pages) ────────
// This file provides the projected savings growth chart and summary card.
// It requires Chart.js to be loaded before this script runs.
// 
// Usage: call loadSavingsProjection(userId, groupId) after auth is ready
//        and the page has a #savings-projection-card element.

let savingsChartInstance = null;

/**
 * Fetches the savings projection data from the API.
 * @param {number} userId  - The logged-in user's ID
 * @param {number} groupId - The current group's ID
 * @returns {Promise<Object>} Projection data with projectionData array and summary stats
 */
async function fetchSavingsProjection(userId, groupId) {
  const token = await auth0Client.getTokenSilently();
  const response = await fetch(`${config.apiBase}/api/groups/${groupId}/savings-projection/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error('Failed to fetch savings projection');
  return await response.json();
}

/**
 * Formats a number as South African Rand currency.
 * Falls back if formatCurrency isn't already defined by the page script.
 */
function projFormatCurrency(amount) {
  if (typeof formatCurrency === 'function') return formatCurrency(amount);
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency', currency: 'ZAR', minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Renders the savings projection card: summary stats, Chart.js line chart, and contextual note.
 * @param {Object} data - The response from /api/groups/:groupId/savings-projection/:userId
 */
function renderSavingsProjection(data) {
  const card = document.getElementById('savings-projection-card');
  if (!card) return;

  // Fill summary stats
  document.getElementById('proj-total-contrib').textContent = projFormatCurrency(data.totalContributed);
  document.getElementById('proj-payout-cycle').textContent = data.payoutPosition;
  document.getElementById('proj-payout-amount').textContent = projFormatCurrency(data.potAmount);
  document.getElementById('proj-progress').textContent = data.paidSoFar + ' of ' + data.totalCycles + ' cycles';

  // Contextual note based on where the member is in the rotation
  const noteEl = document.getElementById('proj-note');
  if (data.paidSoFar >= data.payoutPosition && data.payoutsReceived > 0) {
    noteEl.textContent = 'You have already received your payout. Keep contributing for the remaining members.';
  } else if (data.paidSoFar >= data.payoutPosition) {
    noteEl.textContent = 'You are due for your payout this cycle. Contact your treasurer.';
  } else {
    const remaining = data.payoutPosition - data.paidSoFar;
    noteEl.textContent = remaining + ' contribution' + (remaining !== 1 ? 's' : '') + ' remaining before your payout.';
  }

  // Build Chart.js line chart
  const ctx = document.getElementById('savings-chart');
  if (!ctx) return;

  // Destroy previous instance to prevent canvas reuse errors
  if (savingsChartInstance) {
    savingsChartInstance.destroy();
    savingsChartInstance = null;
  }

  const labels = data.projectionData.map(d => {
    const dt = new Date(d.cycleDate);
    return dt.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' });
  });

  const contributedData = data.projectionData.map(d => d.contributed);
  const receivedData    = data.projectionData.map(d => d.received);
  const netData         = data.projectionData.map(d => d.netPosition);

  // Highlight the payout cycle with a larger point
  const payoutIndex      = data.projectionData.findIndex(d => d.isPayoutCycle);
  const contributedRadius = data.projectionData.map((d, i) => i === payoutIndex ? 6 : 3);
  const receivedRadius    = data.projectionData.map((d, i) => i === payoutIndex ? 8 : 0);

  savingsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cumulative Contributions',
          data: contributedData,
          borderColor: '#0e9490',
          backgroundColor: 'rgba(14, 148, 144, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: contributedRadius,
          pointBackgroundColor: '#0e9490',
          borderWidth: 2
        },
        {
          label: 'Cumulative Received',
          data: receivedData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: false,
          tension: 0,
          pointRadius: receivedRadius,
          pointBackgroundColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [6, 3],
          stepped: 'before'
        },
        {
          label: 'Net Position',
          data: netData,
          borderColor: '#6d28d9',
          backgroundColor: 'rgba(109, 40, 217, 0.05)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointBackgroundColor: '#6d28d9',
          borderWidth: 2,
          borderDash: [4, 2]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10
          }
        },
        tooltip: {
          backgroundColor: '#034e52',
          titleFont: { size: 12, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
          bodyFont: { size: 12, family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (context.parsed.y !== null) {
                label += ': ' + projFormatCurrency(context.parsed.y);
              }
              if (context.dataIndex === payoutIndex) {
                label += ' ★ PAYOUT';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#64748b' }
        },
        y: {
          grid: { color: 'rgba(14, 148, 144, 0.08)' },
          ticks: {
            font: { size: 10 },
            color: '#64748b',
            callback: function(value) { return 'R' + value.toLocaleString(); }
          }
        }
      }
    }
  });

  card.hidden = false;
}

/**
 * Main entry point — fetches data and renders the chart.
 * Silently hides the card on error so the page still works.
 * @param {number} userId  - The logged-in user's ID
 * @param {number} groupId - The current group's ID
 */
async function loadSavingsProjection(userId, groupId) {
  try {
    const data = await fetchSavingsProjection(userId, groupId);
    renderSavingsProjection(data);
  } catch (error) {
    console.error('Savings projection error:', error);
    const card = document.getElementById('savings-projection-card');
    if (card) card.hidden = true;
  }
}