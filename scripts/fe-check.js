// Browser smoke test for the wired beta page (live + demo modes).
const { chromium } = require('playwright');

async function run(url, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1200); // allow hydration + render

  const counts = await page.evaluate(() => ({
    dirCards: document.querySelectorAll('#grid .card').length,
    campCards: document.querySelectorAll('#camp-list .camp-card').length,
    mapPins: document.querySelectorAll('#map .leaflet-interactive').length,
    dirCount: (document.querySelector('#dir-count') || {}).textContent || '',
    banner: (document.querySelector('#demo-banner-text') || {}).textContent || '',
  }));
  console.log(`\n[${label}] ${url}`);
  console.log('  dirCards=%d campCards=%d mapPins=%d', counts.dirCards, counts.campCards, counts.mapPins);
  console.log('  dirCount:', counts.dirCount.trim().slice(0, 80));
  console.log('  banner:', counts.banner.trim().slice(0, 90));
  console.log('  console errors:', errors.length ? errors.slice(0, 5) : 'none');
  await browser.close();
  return { counts, errors };
}

(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:8070';
  await run(base + '/beta.html', 'LIVE');
  await run(base + '/beta.html?demo=1', 'DEMO');
})();
