// Captures the README screenshots from the local dev server (npm run dev) using the installed Chrome.
// Usage: node scripts/screenshots.mjs
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = 'docs/screenshots';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const FOLLOW_UP = `Finanzamt Berlin-Mitte
Neue Jakobstraße 6-7, 10179 Berlin

Herrn
Mehmet Yilmaz
Lindenstraße 42
10969 Berlin

Steuernummer: 34/567/89012
Datum: 15.01.2027

Einspruchsentscheidung zur Einkommensteuer 2025

Sehr geehrter Herr Yilmaz,

auf Ihren Einspruch vom 10.12.2026 wird der Bescheid vom 18.11.2026 geändert. Die Kosten für das häusliche Arbeitszimmer werden nach Vorlage der Nachweise anerkannt.
Die Nachzahlung verringert sich auf 214,00 EUR. Der Betrag ist bis zum 15.02.2027 zu zahlen.

Gegen diese Entscheidung kann innerhalb eines Monats nach Bekanntgabe Klage beim Finanzgericht erhoben werden.`;

const SCAM = `Finanzamt Bundeszentrale – Vollstreckungsabteilung

Frau Olena Kovalenko
Am Kanal 7
14467 Potsdam

Steuerrückstand 2024: 2.480,00 EUR
Letzte Mahnung! Zahlen Sie innerhalb von 24 Stunden, sonst wird ein Haftbefehl erlassen.
Überweisung an: GB33 BUKB 2020 1555 5555 55 oder per Bitcoin.
Rückfragen nur per WhatsApp: +44 7700 900123 oder steuer.finanzamt@gmail.com`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function run(page, text) {
  await page.selectOption('#lang', 'en');
  if (text) {
    await page.evaluate(() => (document.getElementById('paste-box').open = true));
    await page.fill('#text', text);
  } else {
    await page.click('#sample');
  }
  await page.click('#protect');
  await page.waitForSelector('#step-firewall:not([hidden])');
  await page.evaluate(() => {
    document.getElementById('result').innerHTML = '';
    document.getElementById('case-box').innerHTML = '';
  });
  await page.check('#confirm', { force: true });
  await page.click('#explain');
  await page.waitForFunction(() => document.getElementById('result').innerText.length > 50, null, { timeout: 120_000 });
}

const settle = (page, ms = 1500) => page.waitForTimeout(ms);

// Desktop, light
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
  await settle(page, 2600); // let the redaction animation reach the redacted state
  await page.screenshot({ path: `${OUT}/hero.png` });

  await page.selectOption('#lang', 'en');
  await page.click('#sample');
  await page.click('#protect');
  await page.waitForSelector('#step-firewall:not([hidden])');
  await page.check('#cloud-view', { force: true });
  await settle(page);
  await page.locator('#step-firewall').screenshot({ path: `${OUT}/firewall.png` });

  await page.check('#confirm', { force: true });
  await page.click('#explain');
  await page.waitForFunction(() => document.getElementById('result').innerText.length > 50, null, { timeout: 120_000 });
  await page
    .waitForFunction(() => (document.getElementById('dl-explain-0')?.innerText ?? '').length > 20, null, {
      timeout: 60_000,
    })
    .catch(() => {});
  await settle(page);
  await page.locator('#step-result').screenshot({ path: `${OUT}/result.png` });

  await page.click('#case-new');
  await settle(page);

  await page.click('#expert');
  await page.waitForFunction(() => document.getElementById('expert-out').innerText.length > 200, null, {
    timeout: 120_000,
  });
  await settle(page);
  await page.locator('#step-expert').screenshot({ path: `${OUT}/options.png` });

  await page.evaluate(() => window.scrollTo(0, 0));
  await run(page, FOLLOW_UP);
  await page.waitForSelector('.case-ctx', { timeout: 120_000 });
  await settle(page);
  await page.locator('#step-case').screenshot({ path: `${OUT}/case.png` });

  await run(page, SCAM);
  await page.waitForSelector('.fake.high, .fake.medium', { timeout: 120_000 });
  await settle(page, 1500);
  await page.locator('#fake-box').screenshot({ path: `${OUT}/scam.png` });
  await ctx.close();
}

// Phone, dark
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    colorScheme: 'dark',
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
  await settle(page, 2600);
  await page.screenshot({ path: `${OUT}/mobile.png` });
  await ctx.close();
}

await browser.close();
console.log('Screenshots written to', OUT);
