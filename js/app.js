// =============================================
// app.js — Page loader and shared state
// =============================================

// Shared data that any page can read or write.
// When Create Group saves a group, it goes here.
// Settings can then read it.
var appState = {
  groupName:    '',
  description:  '',
  amount:       '',
  cycle:        '',
  startDate:    '',
  payoutOrder:  ''
};


// ── Load a page into the main area ──────────
// Fetches the HTML file from the pages/ folder
// and puts it inside <main id="app-content">
function loadPage(pageName) {

  // Update the nav — mark the right button active
  var buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach(function(btn) {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Show a loading message while fetching
  document.getElementById('app-content').innerHTML = '<p class="loading-msg">Loading...</p>';

  // Fetch the page HTML from the pages/ folder
  fetch('pages/' + pageName + '.html')
    .then(function(response) {
      return response.text();
    })
    .then(function(html) {
      // Put the page content into the main area
      document.getElementById('app-content').innerHTML = html;

      // Load that page's JS file
      loadScript('js/' + pageName + '.js');
    })
    .catch(function() {
      document.getElementById('app-content').innerHTML = '<p class="loading-msg">Page not found.</p>';
    });
}


// ── Load a JS file dynamically ───────────────
// Called after a page's HTML is loaded,
// so the page's JS can attach to its elements.
function loadScript(src) {
  // Remove old script tag for this page if it exists
  var old = document.getElementById('page-script');
  if (old) old.remove();

  var script  = document.createElement('script');
  script.id   = 'page-script';
  script.src  = src;
  document.body.appendChild(script);
}


// ── Load the first page on startup ──────────
window.addEventListener('DOMContentLoaded', function() {
  // Simulate clicking the first nav button to load create-group
  document.querySelector('.nav-btn').click();
});