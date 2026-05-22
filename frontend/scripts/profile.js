/**
 * profile-modal.js
 * Drop-in profile modal for every page.
 *
 * Usage: add ONE script tag AFTER auth_service.js but AFTER any page script
 * that defines its own onAuthReady. Load order should be:
 *   1. config.js
 *   2. auth_service.js
 *   3. <page script e.g. group-admin.js>   ← defines onAuthReady
 *   4. profile.js                           ← chains onto it
 *
 * Then make your avatar call:  onclick="showProfileModal()"
 */

(function () {

  // ── 1. Inject modal HTML ──────────────────────────────────────────────────

  const MODAL_HTML = `
    <style id="profile-modal-styles">
      .profile-modal-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }
      .profile-modal-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      .pm-modal {
        background: #242833;
        border-radius: 24px;
        width: 90%;
        max-width: 460px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        transform: scale(0.95);
        transition: transform 0.25s ease;
      }
      .profile-modal-overlay.active .pm-modal { transform: scale(1); }
      .pm-band {
        height: 90px;
        background: linear-gradient(135deg, #0891b2 0%, #06b6d4 40%, #22d3ee 75%, #67e8f9 100%);
        position: relative;
        border-radius: 24px 24px 0 0;
      }
      .pm-close {
        position: absolute;
        top: 14px; right: 16px;
        background: rgba(255,255,255,0.25);
        backdrop-filter: blur(8px);
        border: none;
        border-radius: 50%;
        width: 34px; height: 34px;
        font-size: 18px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        transition: background 0.2s;
      }
      .pm-close:hover { background: rgba(255,255,255,0.4); }
      .pm-avatar-wrap {
        position: absolute;
        bottom: -44px;
        left: 50%;
        transform: translateX(-50%);
      }
      .pm-avatar {
        width: 88px; height: 88px;
        border-radius: 50%;
        background: #22d3ee;
        border: 4px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        font-weight: 700;
        color: #242833;
        box-shadow: 0 4px 16px rgba(14,148,144,0.25);
        user-select: none;
      }
      .pm-body {
        padding: 60px 28px 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
      }
      .pm-name {
        font-size: 20px;
        font-weight: 700;
        color: #22d3ee;
        margin: 0;
        text-align: center;
      }
      .pm-email {
        font-size: 13px;
        color: #9095a6;
        margin: 2px 0 0;
        text-align: center;
      }
      .pm-since {
        font-size: 11px;
        color: #9095a6;
        margin-top: 4px;
      }
      .pm-details {
        width: 100%;
        margin-top: 20px;
        border: 1px solid rgba(14,148,144,0.12);
        border-radius: 12px;
        overflow: hidden;
      }
      .pm-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 13px 16px;
        border-bottom: 1px solid rgba(14,148,144,0.08);
        font-size: 13px;
      }
      .pm-row:last-child { border-bottom: none; }
      .pm-label {
        font-size: 11px;
        font-weight: 700;
        color: #9095a6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .pm-value {
        font-weight: 600;
        color: #e4e7ef;
        text-align: right;
        max-width: 60%;
        word-break: break-all;
      }
      .pm-logout {
        margin-top: 24px;
        width: 100%;
        padding: 13px;
        background: #242833;
        color: #ef4444;
        border: 1.5px solid rgba(239, 68, 68, 0.3);
        border-radius: 12px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s, transform 0.15s;
        font-family: inherit;
      }
      .pm-logout:hover { background: rgba(239, 68, 68, 0.08); transform: translateY(-1px); }
      .pm-modal::-webkit-scrollbar { width: 6px; }
      .pm-modal::-webkit-scrollbar-track { background: rgba(34, 211, 238, 0.06); border-radius: 10px; }
      .pm-modal::-webkit-scrollbar-thumb { background: #22d3ee; border-radius: 10px; }
    </style>

    <div id="profileModal" class="profile-modal-overlay" role="dialog" aria-modal="true" aria-label="User profile">
      <div class="pm-modal">
        <div class="pm-band">
          <button class="pm-close" id="pm-close-btn" aria-label="Close profile">✕</button>
          <div class="pm-avatar-wrap">
            <div class="pm-avatar" id="pm-avatar">?</div>
          </div>
        </div>
        <div class="pm-body">
          <h2 class="pm-name"  id="pm-name">—</h2>
          <p  class="pm-email" id="pm-email">—</p>
          <p  class="pm-since" id="pm-since"></p>
          <div class="pm-details">
            <div class="pm-row">
              <span class="pm-label">Full name</span>
              <span class="pm-value" id="pm-detail-name">—</span>
            </div>
            <div class="pm-row">
              <span class="pm-label">Email</span>
              <span class="pm-value" id="pm-detail-email">—</span>
            </div>
            <div class="pm-row">
              <span class="pm-label">Member since</span>
              <span class="pm-value" id="pm-detail-since">—</span>
            </div>
          </div>
          <button class="pm-logout" id="pm-logout-btn">Log out</button>
        </div>
      </div>
    </div>
  `;

  // Only inject once
  if (!document.getElementById('profileModal')) {
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
  }

  // ── 2. Helpers ────────────────────────────────────────────────────────────

  function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
  }

  function formatDate(str) {
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── 3. Populate ───────────────────────────────────────────────────────────

  function populateProfile(user) {
    const name  = (user && (user.name || user.nickname || user.email))
                  || localStorage.getItem('userName')
                  || '—';
    const email = (user && user.email) || '—';
    const since = user && (user.created_at || user.updated_at);

    set('pm-avatar',       getInitials(name));
    set('pm-name',         name);
    set('pm-email',        email);
    set('pm-detail-name',  name);
    set('pm-detail-email', email);
    set('pm-detail-since', since ? formatDate(since) : '—');
    set('pm-since',        since ? 'Member since ' + formatDate(since) : '');

    // FIX: sync the header avatar initials every time the profile is populated
    const headerAvatar = document.getElementById('avatar');
    if (headerAvatar) headerAvatar.textContent = getInitials(name);
  }

  // ── 4. Load user from Auth0 ───────────────────────────────────────────────

  async function loadProfile() {
    // Instant paint from localStorage so modal never looks blank
    populateProfile(null);

    if (typeof auth0Client === 'undefined' || !auth0Client) return;

    try {
      let user = await auth0Client.getUser();

      if (!user) {
        await auth0Client.getTokenSilently();
        user = await auth0Client.getUser();
      }

      if (user) populateProfile(user);

    } catch (err) {
      console.warn('profile-modal: could not load Auth0 user:', err.message);
    }
  }

  // ── 5. Show / hide ────────────────────────────────────────────────────────

  function openModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('active');
    loadProfile();
  }

  function closeModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('active');
  }

  // Expose globally so onclick="showProfileModal()" works anywhere
  window.showProfileModal  = openModal;
  window.closeProfileModal = closeModal;

  // ── 6. Event listeners ────────────────────────────────────────────────────

  document.getElementById('pm-close-btn').addEventListener('click', closeModal);

  document.getElementById('profileModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ── 7. Logout ─────────────────────────────────────────────────────────────

  document.getElementById('pm-logout-btn').addEventListener('click', async () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');

    try {
      if (typeof auth0Client !== 'undefined' && auth0Client) {
        await auth0Client.logout({ openUrl: false });
      }
    } catch (err) {
      console.warn('profile-modal: logout error (non-fatal):', err.message);
    }

    window.location.href = window.location.origin + '/pages/index.html';
  });

  // ── 8. Hook into onAuthReady ──────────────────────────────────────────────
  // FIX: capture the page's onAuthReady *after* a DOM-ready tick so that page
  // scripts which are loaded synchronously before profile.js have already set
  // their own onAuthReady by the time we wrap it.
  //
  // auth_service.js calls window.onload, so there is always a small async gap
  // between script evaluation and onAuthReady being invoked. We use
  // setTimeout(0) to push our wrapping to the end of the current call stack,
  // after all synchronous <script> tags on the page have run.

  setTimeout(function () {
    const pageOnAuthReady = typeof window.onAuthReady === 'function'
      ? window.onAuthReady
      : null;

    window.onAuthReady = function () {
      loadProfile();
      if (pageOnAuthReady) pageOnAuthReady();
    };
  }, 0);

})();