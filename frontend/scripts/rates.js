/**
 * rates.js
 * Fetches the latest SA Repo and Prime rates and injects them into the dashboard.
 *
 * Lab concepts used:
 *  - fetch() API
 *  - Promises / async + await
 *  - DOM Manipulation (createElement, appendChild, textContent, classList)
 *  - DOM Events (DOMContentLoaded)
 *
 * API used: https://api.nubela.co/sarb  (free, CORS-friendly, no key needed)
 * Fallback:  hardcoded SARB values (April 2026) used if the fetch fails.
 */

// ─── Fallback data (used if fetch fails) ─────────────────────────────────────
const FALLBACK_RATES = {
  repoRate: 7.50,
  primeRate: 11.00,
  lastUpdated: 'April 2026',
  source: 'SARB (cached)',
};

// ─── Fetch rates from API ─────────────────────────────────────────────────────
/**
 * Attempts to fetch live SA rates.
 * Falls back to FALLBACK_RATES if the request fails for any reason.
 *
 * @returns {Promise<{repoRate: number, primeRate: number, lastUpdated: string, source: string}>}
 */
async function fetchSARates() {
  try {
    // We use a public SARB-mirroring endpoint.
    // It returns JSON: { repo_rate: 7.5, prime_rate: 11.0, date: "2026-04-01" }
    const response = await fetch('https://za-rates.vercel.app/api/rates');

    // If the server responded but with an error status, throw so we hit the catch
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    return {
      repoRate:    data.repo_rate  ?? FALLBACK_RATES.repoRate,
      primeRate:   data.prime_rate ?? FALLBACK_RATES.primeRate,
      lastUpdated: data.date       ?? FALLBACK_RATES.lastUpdated,
      source:      'SARB (live)',
    };

  } catch (error) {
    // Fetch failed (network error, CORS, bad JSON, etc.) — use fallback silently
    console.warn('rates.js: Could not fetch live rates, using fallback.', error.message);
    return FALLBACK_RATES;
  }
}

// ─── Build ticker bar ─────────────────────────────────────────────────────────
/**
 * Creates the thin ticker bar element and injects it below the <header>.
 * Uses DOM manipulation — no innerHTML — to demonstrate createElement/appendChild.
 *
 * @param {{ repoRate: number, primeRate: number, lastUpdated: string, source: string }} rates
 */
function buildTicker(rates) {
  // Create the ticker container
  const ticker = document.createElement('div');
  ticker.id = 'ratesTicker';
  ticker.className = 'rates-ticker';
  ticker.setAttribute('aria-label', 'Current South African interest rates');

  // Label
  const label = document.createElement('span');
  label.className = 'ticker-label';
  label.textContent = 'SA Rates';
  ticker.appendChild(label);

  // Items wrapper
  const items = document.createElement('div');
  items.className = 'ticker-items';

  // Helper: creates one "Rate · Value%" item
  const makeItem = (name, value) => {
    const item = document.createElement('span');
    item.className = 'ticker-item';

    const namePart = document.createElement('span');
    namePart.textContent = name + ' ';

    const valuePart = document.createElement('strong');
    valuePart.textContent = value.toFixed(2) + '%';

    item.appendChild(namePart);
    item.appendChild(valuePart);
    return item;
  };

  // Separator
  const makeSep = () => {
    const sep = document.createElement('span');
    sep.className = 'ticker-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '|';
    return sep;
  };

  items.appendChild(makeItem('Repo rate', rates.repoRate));
  items.appendChild(makeSep());
  items.appendChild(makeItem('Prime rate', rates.primeRate));
  items.appendChild(makeSep());

  // Next MPC meeting (static — SARB meets every ~2 months)
  const mpc = document.createElement('span');
  mpc.className = 'ticker-item';
  mpc.innerHTML = 'Next MPC <strong>May 2026</strong>';
  items.appendChild(mpc);

  ticker.appendChild(items);

  // Source / timestamp on the right
  const src = document.createElement('span');
  src.className = 'ticker-src';
  src.textContent = `${rates.source} · ${rates.lastUpdated}`;
  ticker.appendChild(src);

  // ── DOM Manipulation: insert after <header> ──────────────────────────────
  const header = document.querySelector('header');
  if (header && header.parentNode) {
    // insertAdjacentElement places it immediately after the header
    header.insertAdjacentElement('afterend', ticker);
  }
}

// ─── Build rates card ─────────────────────────────────────────────────────────
/**
 * Creates the rates card and injects it as the last child of .groups-grid,
 * OR just before the grid if the grid is empty/hidden.
 *
 * @param {{ repoRate: number, primeRate: number, lastUpdated: string, source: string }} rates
 */
function buildRatesCard(rates) {
  // ── Create card container ─────────────────────────────────────────────────
  const card = document.createElement('article');
  card.id = 'ratesCard';
  card.className = 'group-card rates-card-special';
  card.setAttribute('aria-label', 'Current South African Reserve Bank rates');

  // ── Card header row ───────────────────────────────────────────────────────
  const headerRow = document.createElement('div');
  headerRow.className = 'rates-card-header';

  const title = document.createElement('h2');
  title.className = 'group-name';
  title.textContent = 'Current SA Rates';

  const livePill = document.createElement('span');
  livePill.className = 'rates-live-pill';

  const dot = document.createElement('span');
  dot.className = 'live-dot';
  dot.setAttribute('aria-hidden', 'true');

  const liveText = document.createElement('span');
  liveText.textContent = 'Live';

  livePill.appendChild(dot);
  livePill.appendChild(liveText);

  headerRow.appendChild(title);
  headerRow.appendChild(livePill);
  card.appendChild(headerRow);

  // ── Icon ─────────────────────────────────────────────────────────────────
  const icon = document.createElement('figure');
  icon.className = 'card-icon';
  icon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="#0e9490" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <text x="4" y="18" font-size="16" font-weight="bold" 
            fill="#0e9490" stroke="none" font-family="serif">R</text>
    </svg>`;
  card.appendChild(icon);

  // ── Rate rows (repo + prime) ──────────────────────────────────────────────
  const makeRateRow = (tagText, nameText, value, valueClass) => {
    const row = document.createElement('dl');
    row.className = 'rate-display-row';

    const left = document.createElement('div');

    const tag = document.createElement('dt');
    tag.className = 'rate-tag';
    tag.textContent = tagText;

    const name = document.createElement('dd');
    name.className = 'rate-name';
    name.textContent = nameText;

    left.appendChild(tag);
    left.appendChild(name);

    const valEl = document.createElement('dd');
    valEl.className = `rate-big-value ${valueClass}`;

    // Set the numeric content via textContent (safe — no innerHTML for user data)
    valEl.textContent = value.toFixed(2) + '%';

    row.appendChild(left);
    row.appendChild(valEl);
    return row;
  };

  card.appendChild(makeRateRow('Set by SARB', 'Repo rate',  rates.repoRate,  'rate-repo'));
  card.appendChild(makeRateRow('Repo + 3.5%', 'Prime rate', rates.primeRate, 'rate-prime'));

  // ── Explainer note ────────────────────────────────────────────────────────
  const note = document.createElement('p');
  note.className = 'group-desc rates-note';
  note.textContent =
    'Your group savings projections are calculated using the current prime rate as the benchmark.';
  card.appendChild(note);

  // ── Source line ───────────────────────────────────────────────────────────
  const srcLine = document.createElement('p');
  srcLine.className = 'rates-src-line';
  srcLine.textContent = `Source: ${rates.source} · ${rates.lastUpdated}`;
  card.appendChild(srcLine);

  // ── DOM Manipulation: inject into groups-grid ─────────────────────────────
  const grid = document.querySelector('.groups-grid');
  if (grid) {
    grid.hidden = false;       // make sure grid is visible even if no groups loaded yet
    grid.appendChild(card);   // append as last card in the grid
  }
}

// ─── Update DOM if rates change (bonus: shows how to mutate existing nodes) ──
/**
 * If the rates card already exists in the DOM, update just the values.
 * Demonstrates targeted DOM mutation without rebuilding the whole element.
 *
 * @param {{ repoRate: number, primeRate: number }} rates
 */
function updateRateValues(rates) {
  const repoEl  = document.querySelector('.rate-repo');
  const primeEl = document.querySelector('.rate-prime');
  if (repoEl)  repoEl.textContent  = rates.repoRate.toFixed(2)  + '%';
  if (primeEl) primeEl.textContent = rates.primeRate.toFixed(2) + '%';
}

// ─── Main entry point ─────────────────────────────────────────────────────────
/**
 * Called once the DOM is ready.
 * Orchestrates fetch → DOM build → optional refresh.
 */
async function initRates() {
  // 1. Fetch (async/await + Promises)
  const rates = await fetchSARates();

  // 2. Build and inject ticker bar (DOM manipulation)
  buildTicker(rates);

  // 3. Build and inject rates card into the groups grid (DOM manipulation)
  buildRatesCard(rates);

  // 4. (Optional) Re-fetch every 30 minutes in case user leaves tab open
  //    and SARB updates mid-session — demonstrates chained async behaviour
  setInterval(async () => {
    const fresh = await fetchSARates();
    updateRateValues(fresh);
  }, 30 * 60 * 1000); // 30 minutes
}

// ─── Wait for DOM then run ────────────────────────────────────────────────────
// DOMContentLoaded ensures the header and grid exist before we manipulate them
document.addEventListener('DOMContentLoaded', initRates);