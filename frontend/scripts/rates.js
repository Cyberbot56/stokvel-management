/**
 * rates.js
 * Fetches the latest SA Repo and Prime rates and injects them into the dashboard.
 *
 * Strategy:
 *  1. Try the primary za-rates endpoint (with 4s timeout so we don't hang the page).
 *  2. Try a backup endpoint.
 *  3. Fall back to hardcoded SARB values (Jan 29, 2026 MPC decision).
 *
 * Lab concepts used:
 *  - fetch() API with AbortController for timeout
 *  - Promises / async + await with Promise.race
 *  - DOM Manipulation (createElement, appendChild, textContent, classList)
 *  - DOM Events (DOMContentLoaded)
 */

// ─── Fallback data (current SARB rates as of Jan 29, 2026 MPC decision) ──────
const FALLBACK_RATES = {
  repoRate: 6.75,
  primeRate: 10.25,
  lastUpdated: 'Jan 2026',
  source: 'SARB (cached)',
};

// ─── Endpoint registry — tries each in order ─────────────────────────────────
const ENDPOINTS = [
  {
    url: 'https://za-rates.vercel.app/api/rates',
    parse: (data) => ({
      repoRate:    data.repo_rate  ?? data.repoRate,
      primeRate:   data.prime_rate ?? data.primeRate,
      lastUpdated: data.date       ?? data.lastUpdated,
    }),
  },
  // Backup: derive from a CORS-friendly forex/finance source if needed.
  // (For now, we just rely on primary + fallback.)
];

const FETCH_TIMEOUT_MS = 4000;

/**
 * Fetch with timeout — wraps fetch() in a race so the page never waits forever.
 */
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Try each endpoint in order. Returns parsed rates or falls through to fallback.
 */
async function fetchSARates() {
  for (const endpoint of ENDPOINTS) {
    try {
      const data = await fetchWithTimeout(endpoint.url, FETCH_TIMEOUT_MS);
      const parsed = endpoint.parse(data);

      // Sanity check the parsed numbers — reject if obviously wrong
      const repo = Number(parsed.repoRate);
      const prime = Number(parsed.primeRate);
      if (!isFinite(repo) || !isFinite(prime) || repo < 0 || repo > 30 || prime < 0 || prime > 35) {
        throw new Error('Returned rates out of sane range');
      }

      return {
        repoRate:    repo,
        primeRate:   prime,
        lastUpdated: parsed.lastUpdated || FALLBACK_RATES.lastUpdated,
        source:      'SARB (live)',
      };
    } catch (err) {
      console.warn(`rates.js: ${endpoint.url} failed —`, err.message);
      // continue to next endpoint
    }
  }

  // All endpoints failed
  console.info('rates.js: Using cached SARB values.');
  return FALLBACK_RATES;
}

// ─── Build ticker bar ────────────────────────────────────────────────────────
function buildTicker(rates) {
  const ticker = document.createElement('div');
  ticker.id = 'ratesTicker';
  ticker.className = 'rates-ticker';
  ticker.setAttribute('aria-label', 'Current South African interest rates');

  const label = document.createElement('span');
  label.className = 'ticker-label';
  label.textContent = 'SA Rates';
  ticker.appendChild(label);

  const items = document.createElement('div');
  items.className = 'ticker-items';

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

  const mpc = document.createElement('span');
  mpc.className = 'ticker-item';
  const mpcText = document.createElement('span');
  mpcText.textContent = 'Next MPC ';
  const mpcDate = document.createElement('strong');
  mpcDate.textContent = 'Mar 2026';
  mpc.appendChild(mpcText);
  mpc.appendChild(mpcDate);
  items.appendChild(mpc);

  ticker.appendChild(items);

  const src = document.createElement('span');
  src.className = 'ticker-src';
  src.textContent = `${rates.source} · ${rates.lastUpdated}`;
  ticker.appendChild(src);

  const header = document.querySelector('header');
  if (header && header.parentNode) {
    header.insertAdjacentElement('afterend', ticker);
  }
}

// ─── Build rates card (themed for dark UI) ───────────────────────────────────
function buildRatesCard(rates) {
  const isLive = rates.source.includes('live');

  const card = document.createElement('article');
  card.id = 'ratesCard';
  card.className = 'group-card rates-card-special';
  card.setAttribute('aria-label', 'Current South African Reserve Bank rates');

  const headerRow = document.createElement('div');
  headerRow.className = 'rates-card-header';

  const title = document.createElement('h2');
  title.className = 'group-name';
  title.textContent = 'SA Rates';
  title.style.cssText = 'font-size:13px;font-weight:700;color:#22d3ee;margin:0;letter-spacing:0.5px;text-transform:uppercase;';

  const livePill = document.createElement('span');
  livePill.className = 'rates-live-pill';
  if (!isLive) livePill.style.opacity = '0.6';

  const dot = document.createElement('span');
  dot.className = 'live-dot';
  dot.setAttribute('aria-hidden', 'true');

  const liveText = document.createElement('span');
  liveText.textContent = isLive ? 'Live' : 'Cached';

  livePill.appendChild(dot);
  livePill.appendChild(liveText);

  headerRow.appendChild(title);
  headerRow.appendChild(livePill);
  card.appendChild(headerRow);

  // Rate rows
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
    valEl.textContent = value.toFixed(2) + '%';

    row.appendChild(left);
    row.appendChild(valEl);
    return row;
  };

  card.appendChild(makeRateRow('Set by SARB', 'Repo rate',  rates.repoRate,  'rate-repo'));
  card.appendChild(makeRateRow('Repo + 3.5%', 'Prime rate', rates.primeRate, 'rate-prime'));

  const note = document.createElement('p');
  note.className = 'group-desc rates-note';
  note.textContent = 'Group savings projections use the current prime rate as the benchmark.';
  card.appendChild(note);

  const srcLine = document.createElement('p');
  srcLine.className = 'rates-src-line';
  srcLine.textContent = `${rates.source} · ${rates.lastUpdated}`;
  card.appendChild(srcLine);

  // Position as fixed floating card
  card.style.position = 'fixed';
  card.style.bottom = '72px';
  card.style.right = '24px';
  card.style.width = '240px';
  card.style.zIndex = '999';
  card.style.background = '#242833';
  card.style.border = '1px solid rgba(34, 211, 238, 0.15)';
  card.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 211, 238, 0.05) inset';
  card.style.display = 'none';
  card.style.padding = '16px';
  document.body.appendChild(card);
}

// ─── Build toggle button (dark-theme styled) ─────────────────────────────────
function buildToggleButton() {
  const btn = document.createElement('button');
  btn.id = 'ratesToggleBtn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'ratesCard');
  btn.textContent = 'SA Rates';

  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
    padding: 10px 18px;
    background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%);
    color: #0f1219;
    border: none;
    border-radius: 24px;
    font-size: 12px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(34, 211, 238, 0.25), 0 0 0 1px rgba(34, 211, 238, 0.15);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    letter-spacing: 0.3px;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translateY(-2px)';
    btn.style.boxShadow = '0 10px 28px rgba(34, 211, 238, 0.35), 0 0 0 1px rgba(34, 211, 238, 0.25)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translateY(0)';
    btn.style.boxShadow = '0 6px 20px rgba(34, 211, 238, 0.25), 0 0 0 1px rgba(34, 211, 238, 0.15)';
  });

  btn.addEventListener('click', () => {
    const card = document.getElementById('ratesCard');
    if (!card) return;
    const isOpen = card.style.display === 'none' || card.style.display === '';

    if (isOpen) {
      card.style.display = 'block';
      btn.textContent = 'Hide Rates';
      btn.style.background = '#1a1d26';
      btn.style.color = '#22d3ee';
      btn.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(34, 211, 238, 0.3)';
      btn.setAttribute('aria-expanded', 'true');
    } else {
      card.style.display = 'none';
      btn.textContent = 'SA Rates';
      btn.style.background = 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)';
      btn.style.color = '#0f1219';
      btn.style.boxShadow = '0 6px 20px rgba(34, 211, 238, 0.25), 0 0 0 1px rgba(34, 211, 238, 0.15)';
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.body.appendChild(btn);
}

// ─── Update DOM in place when rates refresh ──────────────────────────────────
function updateRateValues(rates) {
  const repoEl  = document.querySelector('.rate-repo');
  const primeEl = document.querySelector('.rate-prime');
  if (repoEl)  repoEl.textContent  = rates.repoRate.toFixed(2)  + '%';
  if (primeEl) primeEl.textContent = rates.primeRate.toFixed(2) + '%';

  // Also update ticker values
  const tickerStrongs = document.querySelectorAll('#ratesTicker .ticker-item strong');
  if (tickerStrongs[0]) tickerStrongs[0].textContent = rates.repoRate.toFixed(2) + '%';
  if (tickerStrongs[1]) tickerStrongs[1].textContent = rates.primeRate.toFixed(2) + '%';
}

// ─── Main entry point ────────────────────────────────────────────────────────
async function initRates() {
  // 1. Render with fallback IMMEDIATELY so the UI never feels stuck.
  buildTicker(FALLBACK_RATES);
  buildRatesCard(FALLBACK_RATES);
  buildToggleButton();

  // 2. Fetch in background; if we get something better, swap it in.
  try {
    const rates = await fetchSARates();
    if (rates !== FALLBACK_RATES) {
      updateRateValues(rates);

      // Update source labels too
      const srcSpans = document.querySelectorAll('.ticker-src, .rates-src-line');
      srcSpans.forEach(el => {
        el.textContent = `${rates.source} · ${rates.lastUpdated}`;
      });

      // Update Live/Cached pill
      const livePillText = document.querySelector('.rates-live-pill span:last-child');
      if (livePillText) livePillText.textContent = rates.source.includes('live') ? 'Live' : 'Cached';
    }
  } catch (err) {
    console.warn('rates.js: fetch failed, using fallback display.', err);
  }

  // 3. Refresh every 30 minutes if the tab stays open
  setInterval(async () => {
    try {
      const fresh = await fetchSARates();
      updateRateValues(fresh);
    } catch (err) {
      // silent
    }
  }, 30 * 60 * 1000);
}

// ─── Wait for DOM then run ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initRates);