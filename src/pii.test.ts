import { Redactor } from './pii.ts';
import { FIXTURES } from './fixtures.ts';

const verbose = process.argv.includes('-v');
let failed = 0;
let totalGone = 0;
let caught = 0;

for (const f of FIXTURES) {
  const r = new Redactor();
  r.detectWithRules(f.text);
  const red = r.redact(f.text);
  const problems: string[] = [];

  for (const s of f.mustBeGone) {
    totalGone++;
    // A value counts as leaked if it still appears as a whole word.
    const re = new RegExp(`(?<![\\p{L}\\d])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u');
    if (re.test(red)) problems.push(`LEAK          ${s}`);
    else caught++;
  }
  for (const s of f.mustStay) if (!red.includes(s)) problems.push(`OVER-REDACTED ${s}`);
  for (const e of r.all) if (e.value.includes('\n')) problems.push(`MULTILINE     ${JSON.stringify(e.value)}`);
  if (r.restore(red) !== f.text) problems.push('restore() is not lossless');

  console.log(`${problems.length ? '✗' : '✓'} ${f.name}  (${r.all.length} items hidden)`);
  for (const p of problems) console.log('    ' + p);
  if (verbose) console.log('\n' + red + '\n');
  failed += problems.length;
}

// Regression: placeholders echoed by the model must not block the cloud call
{
  const f = FIXTURES[0];
  const r = new Redactor();
  r.detectWithRules(f.text);
  const red = r.redact(f.text);
  const newOnes = ['Herr [NAME_2]', 'NAME_1', '[TAX_ID_1]', 'Sehr geehrter Herr Yilmaz', 'Mehmet Yilmaz'].filter((x) =>
    r.addFromModel(x, 'NAME', red),
  ).length;
  const red2 = r.redact(f.text);
  const leaks = r.leaks(red2).length;
  const placeholdersIntact = !/\[\[|\]\]/.test(red2);
  const ok = newOnes === 0 && leaks === 0 && placeholdersIntact;
  console.log(`${ok ? '✓' : '✗'} Model findings with placeholders are ignored  (new: ${newOnes}, leaks: ${leaks})`);
  if (!ok) failed++;
  // a real miss is still caught
  const r2 = new Redactor();
  r2.detectWithRules('Bitte rufen Sie Frau Krüger an. Ihr Nachbar Hans Peter war auch da.');
  const red3 = r2.redact('Bitte rufen Sie Frau Krüger an. Ihr Nachbar Hans Peter war auch da.');
  const caughtMiss =
    r2.addFromModel('Hans Peter', 'NAME', red3) &&
    r2.leaks(r2.redact('Bitte rufen Sie Frau Krüger an. Ihr Nachbar Hans Peter war auch da.')).length === 0;
  console.log(`${caughtMiss ? '✓' : '✗'} A real miss found by the model is hidden`);
  if (!caughtMiss) failed++;
}

console.log(
  `\nRecall: ${caught}/${totalGone} private values caught by rules alone (${((caught / totalGone) * 100).toFixed(0)}%)`,
);
if (failed) {
  console.error(`${failed} problem(s)`);
  process.exit(1);
}
console.log('All privacy checks passed.');
