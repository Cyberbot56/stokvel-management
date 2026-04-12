// =============================================
// wizard.js — Group creation wizard (CLEAN VERSION)
// =============================================
//I have added this to connect to my existing backend so that I can create groups.
const API_BASE_URL = 'http://localhost:3000/api';
// Which step the user is currently on
var currentStep = 1;

// Store what the user typed so Back button works
var savedName        = '';
var savedDescription = '';
var savedAmount      = '';
var savedDate        = '';
var savedCycle       = 'monthly';


// ── Move to a specific step ──────────────────
function goToStep(newStep) {

  document.getElementById('step-' + currentStep).hidden = true;

  var oldPill = document.getElementById('pill-' + currentStep);
  if (newStep > currentStep) {
    oldPill.className = 'step-pill done';
  } else {
    oldPill.className = 'step-pill';
  }

  currentStep = newStep;

  document.getElementById('step-' + currentStep).hidden = false;

  document.getElementById('pill-' + currentStep).className = 'step-pill active';
}


// ── Next button clicked ──────────────────────
function nextStep() {

  // --- Step 1 validation ---
  if (currentStep === 1) {
    var name = document.getElementById('group-name').value.trim();

    if (name.length < 3 || name.length > 60) {
      document.getElementById('err-name').classList.add('show');
      document.getElementById('group-name').classList.add('error-border');
      return;
    }

    savedName        = name;
    savedDescription = document.getElementById('group-desc').value.trim();

    document.getElementById('err-name').classList.remove('show');
    document.getElementById('group-name').classList.remove('error-border');
  }

  // --- Step 2 validation ---
  if (currentStep === 2) {
    var amount = parseFloat(document.getElementById('contribution-amount').value);
    var date   = document.getElementById('start-date').value;
    var valid  = true;

    if (isNaN(amount) || amount <= 0) {
      document.getElementById('err-amount').classList.add('show');
      document.getElementById('contribution-amount').classList.add('error-border');
      valid = false;
    } else {
      document.getElementById('err-amount').classList.remove('show');
      document.getElementById('contribution-amount').classList.remove('error-border');
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!date || new Date(date) <= today) {
      document.getElementById('err-date').classList.add('show');
      document.getElementById('start-date').classList.add('error-border');
      valid = false;
    } else {
      document.getElementById('err-date').classList.remove('show');
      document.getElementById('start-date').classList.remove('error-border');
    }

    if (!valid) return;

    savedAmount = amount;
    savedDate   = date;
  }

  // --- Step 3 (no validation anymore) ---
  if (currentStep === 3) {
    fillReview();
  }

  goToStep(currentStep + 1);
}


// ── Back button ──────────────────────────────
function prevStep() {
  goToStep(currentStep - 1);

  if (currentStep === 1) {
    document.getElementById('group-name').value = savedName;
    document.getElementById('group-desc').value = savedDescription;
    updateCharCount();
  }

  if (currentStep === 2) {
    document.getElementById('contribution-amount').value = savedAmount;
    document.getElementById('start-date').value = savedDate;
    selectCycle(savedCycle);
  }
}


// ── Cycle selection ──────────────────────────
function selectCycle(value) {
  savedCycle = value;

  document.getElementById('pill-monthly').className =
    'radio-pill' + (value === 'monthly' ? ' selected' : '');

  document.getElementById('pill-weekly').className =
    'radio-pill' + (value === 'weekly' ? ' selected' : '');
}


// ── Character counter ────────────────────────
function updateCharCount() {
  var textarea = document.getElementById('group-desc');

  if (textarea.value.length > 300) {
    textarea.value = textarea.value.substring(0, 300);
  }

  document.getElementById('desc-count').textContent =
    textarea.value.length + ' / 300';
}


// ── Fill review step ─────────────────────────
function fillReview() {
  document.getElementById('rev-name').textContent   = savedName;
  document.getElementById('rev-desc').textContent   = savedDescription || '(none)';
  document.getElementById('rev-amount').textContent = 'R ' + parseFloat(savedAmount).toLocaleString('en-ZA');
  document.getElementById('rev-cycle').textContent  = savedCycle === 'monthly' ? 'Monthly' : 'Weekly';
  document.getElementById('rev-date').textContent   = savedDate;

  // FIXED: no more savedPayout bug
  document.getElementById('rev-payout').textContent = 'Rotation (ordered)';
}


// ── Submit ───────────────────────────────────
async function submitGroup() {
  const currentUserId = localStorage.getItem('userId');
  if (!currentUserId) {
    alert("Error: You must be logged in to create a group.");
    return;
  }
  const groupData = {
    name: savedName,
    description: savedDescription || null,
    contributionAmount: parseFloat(savedAmount),
    cycleType: savedCycle,
    payoutOrder: "random",
    status: "active",
    createdBy: parseInt(currentUserId),  //Used the userid 1 as default for now, we will change this later
    FiuserId: parseInt(currentUserId)    // 
  };

  try {
    const response = await fetch(`${API_BASE_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groupData)
    });

    if (response.ok) {
      const newGroup = await response.json();
      alert(`Group "${newGroup.name}" created successfully! You will be directed to the group soon`);
      // Optionally redirect after 2 seconds
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 2000);
    } else {
      const error = await response.json();
      alert(`Error creating group: ${error.details || error.error}`);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error creating group. Please try again.');
  }
}

