// =============================================
// settings.js — Group settings page logic
// =============================================
 
 
// ── Save bar ────────────────────────────────
// Called every time the user changes a field.
// Shows the "unsaved changes" bar at the top.
function markDirty() {
  document.getElementById('save-bar').hidden = false;
}
 
// Discard button — hide the bar and reload the page
// to reset all fields back to their original values
function discardChanges() {
  document.getElementById('save-bar').hidden = true;
  location.reload();
}
 
// Save button — hides the bar and shows a success message.
// TODO: replace alert with real PATCH /groups/:id fetch call
//       once Dev 3 delivers the API endpoint.
function saveChanges() {
  document.getElementById('save-bar').hidden = true;
  alert('Settings saved!');
}
 
 
// ── Tab switching ────────────────────────────
// Shows the chosen tab panel and hides the other.
function switchTab(tabName) {
 
  // Hide both panels
  document.getElementById('tab-general').hidden = true;
  document.getElementById('tab-audit').hidden   = true;
 
  // Remove active class from both tab buttons
  document.getElementById('tab-btn-general').classList.remove('active');
  document.getElementById('tab-btn-audit').classList.remove('active');
  document.getElementById('tab-btn-general').setAttribute('aria-selected', 'false');
  document.getElementById('tab-btn-audit').setAttribute('aria-selected', 'false');
 
  // Show the chosen panel and mark its button active
  document.getElementById('tab-' + tabName).hidden = false;
  document.getElementById('tab-btn-' + tabName).classList.add('active');
  document.getElementById('tab-btn-' + tabName).setAttribute('aria-selected', 'true');
}
 
 
// ── Close group modal ────────────────────────
// Opens the <dialog> element
function openCloseModal() {
  document.getElementById('close-modal').showModal();
}
 
// Closes the modal without doing anything
function closeModal() {
  document.getElementById('close-modal').close();
  document.getElementById('confirm-name').value = '';
  document.getElementById('err-confirm').classList.remove('show');
}
 
// Checks the typed name matches, then closes the group
function confirmClose() {
  var typed    = document.getElementById('confirm-name').value.trim();
  var expected = document.getElementById('s-name').value.trim();
 
  if (typed !== expected) {
    // Show error if name doesn't match
    document.getElementById('err-confirm').classList.add('show');
    return;
  }
 
  // Name matches — close the modal and confirm
  document.getElementById('close-modal').close();
  // TODO: replace alert with real DELETE /groups/:id call
  alert('Group closed.');
}