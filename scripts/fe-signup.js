// Full signup E2E: signed-out -> email -> magic link -> onboarding -> profile.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8071';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  // 1. Land signed-out, open Join -> sign-in step.
  await page.goto(BASE + '/beta.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.click('#btn-join-nav');
  await page.waitForSelector('#onb-panel-0.active', { timeout: 5000 });

  // 2. Request magic link.
  await page.fill('#onb-email', 'newburner@example.com');
  await page.click('#onb-send-link');
  await page.waitForFunction(() => /dev link|Check your email/i.test(document.querySelector('#onb-auth-status').textContent), { timeout: 5000 });
  const devLink = await page.evaluate(() => {
    const a = document.querySelector('#onb-auth-status a');
    return a ? a.getAttribute('href') : null;
  });
  console.log('devLink:', devLink ? 'received' : 'MISSING');

  // 3. Follow the link (verifies + redirects to ?onboard=1, auto-opens onboarding).
  await page.goto(devLink, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.waitForSelector('#onb-panel-1.active', { timeout: 5000 });
  console.log('returned authed, age gate open:', await page.isVisible('#onb-panel-1.active'));

  // 4. Age gate.
  await page.fill('#onb-dob', '1990-05-05');
  await page.click('#age-gate-submit');
  await page.waitForSelector('#onb-panel-2.active', { timeout: 5000 });

  // 5. Fields (fill the required playa name + a couple; set via value for enhanced selects).
  await page.fill('#onb-f-pn', 'Tumbleweed');
  await page.fill('#onb-f-pronouns', 'they/them');
  await page.fill('#onb-f-avatar', '🌵');
  await page.fill('#onb-f-bio', 'logistics brain, real signup test');
  await page.fill('#onb-f-skills', 'Logistics, Spreadsheets');
  await page.fill('#onb-f-looking', 'Friends');
  await page.click('#onb-next-2');
  await page.waitForSelector('#onb-panel-3.active', { timeout: 5000 });

  // 6. Visibility -> Searchable (beacon).
  await page.evaluate(() => {
    const opt = document.querySelector('.tier-opt[data-tier="beacon"]');
    if (opt) opt.click();
  });
  await page.click('#onb-next-3');
  await page.waitForSelector('#onb-panel-4.active', { timeout: 5000 });

  // 7. Location: set region + city (region select is enhanced -> set value directly).
  await page.evaluate(() => {
    const r = document.querySelector('#onb-loc-region');
    r.value = 'Austin';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.fill('#onb-loc-city', 'Austin, TX');
  await page.click('#onb-next-4'); // submits profile
  await page.waitForSelector('#onb-panel-5.active', { timeout: 8000 });
  const confirmTitle = await page.textContent('#onb-confirm-title');
  const confirmBody = await page.textContent('#onb-confirm-body');
  const submitErr = await page.evaluate(() => {
    const e = document.querySelector('#onb-submit-error');
    return e && e.style.display !== 'none' ? e.textContent : '';
  });
  console.log('confirm title:', confirmTitle.trim());
  console.log('confirm body:', confirmBody.trim().slice(0, 90));
  console.log('submit error:', submitErr || 'none');
  console.log('pageerrors:', errors.length ? errors : 'none');

  await browser.close();
})();
