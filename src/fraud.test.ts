import { ibanValid, ruleCheck, ruleRisk } from './fraud.ts';
import { FIXTURES } from './fixtures.ts';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

eq('Valid German IBAN', ibanValid('DE89 3704 0044 0532 0130 00'), true);
eq('One digit wrong', ibanValid('DE89 3704 0044 0532 0130 01'), false);
eq('Wrong length', ibanValid('DE89 3704 0044 0532 0130'), false);

// Real letters from the corpus must not look like scams
for (const f of FIXTURES) eq(`No false alarm: ${f.name}`, ruleRisk(ruleCheck(f.text)) !== 'high', true);

const SCAM = `Finanzamt Bundeszentrale – Vollstreckungsabteilung
Steuerrückstand 2024: 2.480,00 EUR
Zahlen Sie innerhalb von 24 Stunden, sonst wird ein Haftbefehl erlassen.
Überweisung an: GB33 BUKB 2020 1555 5555 55 oder per Bitcoin.
Rückfragen nur per WhatsApp: +44 7700 900123 oder steuer.finanzamt@gmail.com
Weitere Infos: www.finanzamt-zahlung-online.com`;
const s = ruleCheck(SCAM);
eq('Scam is high risk', ruleRisk(s), 'high');
eq(
  'Scam: foreign IBAN found',
  s.some((x) => x.id === 'iban-foreign'),
  true,
);
eq(
  'Scam: crypto found',
  s.some((x) => x.message.includes('cryptocurrency')),
  true,
);
eq(
  'Scam: messenger found',
  s.some((x) => x.id === 'messenger'),
  true,
);
eq(
  'Scam: free mail found',
  s.some((x) => x.id === 'free-mail'),
  true,
);
eq(
  'Scam: look-alike domain found',
  s.some((x) => x.id === 'lookalike-domain'),
  true,
);
eq(
  'Scam: pressure found',
  s.some((x) => x.message.includes('time pressure')),
  true,
);

if (failed) {
  console.error(`\n${failed} fraud test(s) failed`);
  process.exit(1);
}
console.log('\nAll fake-check tests passed.');
