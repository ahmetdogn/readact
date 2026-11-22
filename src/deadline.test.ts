import { computeDeadline, holidays, type ExtractedDeadline } from './deadline.ts';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
const period = (
  n: number,
  unit: 'days' | 'weeks' | 'months',
  start: ExtractedDeadline['period_start'] = 'bekanntgabe',
): ExtractedDeadline => ({
  purpose: 'widerspruch',
  kind: 'period',
  fixed_date: null,
  period_amount: n,
  period_unit: unit,
  period_start: start,
  quote: '',
});
const post = (letter_date: string) => ({ letter_date, delivery: 'post' as const });

// Holidays
eq('Easter 2026 -> Karfreitag 03.04.', holidays(2026, 'BE').get('2026-04-03'), 'Karfreitag');
eq('Buß- und Bettag 2026 (SN) = 18.11.', holidays(2026, 'SN').get('2026-11-18'), 'Buß- und Bettag');
eq('No Buß- und Bettag in BE', holidays(2026, 'BE').has('2026-11-18'), false);
eq(
  'Frauentag only BE/MV',
  [holidays(2027, 'BE').has('2027-03-08'), holidays(2027, 'BY').has('2027-03-08')],
  [true, false],
);

// Sample letter: dated Wed 18.11.2026 -> +4 = Sun 22.11. -> Mon 23.11. -> +1 month = Wed 23.12.
eq(
  'Tax office sample',
  computeDeadline(period(1, 'months'), post('2026-11-18'), 'BE', '2026-11-22')?.date,
  '2026-12-23',
);

// Normal case: Mon 02.03.2026 + 4 = Fri 06.03. -> +1 month = Mon 06.04.2026 = Ostermontag -> Tue 07.04.
eq(
  'Month ends on Easter Monday',
  computeDeadline(period(1, 'months'), post('2026-03-02'), 'NW', '2026-03-05')?.date,
  '2026-04-07',
);

// § 188 Abs. 3 BGB: 31.01. + 1 month -> 28.02. (2027 not a leap year); Fri 27.01.2027 + 4 = Sun 31.01. -> Mon 01.02. -> +1 month = Mon 01.03.
eq(
  'Shift then month',
  computeDeadline(period(1, 'months'), post('2027-01-27'), 'BE', '2027-01-28')?.date,
  '2027-03-01',
);
// Event on 31.01 (Zustellung) -> 28.02.2027 is Sunday -> Mon 01.03.
eq(
  'Month end clamp + weekend',
  computeDeadline(
    period(1, 'months', 'zustellung'),
    { letter_date: '2027-01-29', delivery: 'zustellungsurkunde' },
    'BE',
    '2027-02-01',
    { zustellung: '2027-01-31' },
  )?.date,
  '2027-03-01',
);

// Two weeks from Bekanntgabe: Thu 05.11.2026 + 4 = Mon 09.11. -> +14 = Mon 23.11.
eq('Two weeks', computeDeadline(period(2, 'weeks'), post('2026-11-05'), 'BE', '2026-11-06')?.date, '2026-11-23');

// Regional holiday: Mon 27.10.2025 + 4 = Fri 31.10.2025 = Reformationstag in Lower Saxony, normal day in Bavaria
eq(
  'Reformationstag shifts Bekanntgabe (NI)',
  computeDeadline(period(1, 'months'), post('2025-10-27'), 'NI', '2025-10-28')?.date,
  '2025-12-03',
);
eq(
  'but not in Bavaria (30.11. is Sunday -> 01.12.)',
  computeDeadline(period(1, 'months'), post('2025-10-27'), 'BY', '2025-10-28')?.date,
  '2025-12-01',
);

// Zustellungsurkunde without date -> asks the user
eq(
  'Asks for envelope date',
  computeDeadline(
    period(1, 'months', 'zustellung'),
    { letter_date: '2026-11-18', delivery: 'zustellungsurkunde' },
    'BE',
    '2026-11-20',
  )?.needsUserDate,
  'zustellung',
);

// Fixed payment date is not moved
eq(
  'Fixed date stays',
  computeDeadline(
    { ...period(1, 'months'), kind: 'fixed_date', fixed_date: '2026-12-21', purpose: 'zahlung' },
    post('2026-11-18'),
    'BE',
    '2026-11-22',
  )?.date,
  '2026-12-21',
);

// Send-by is 3 days earlier on a working day
eq('Send by', computeDeadline(period(1, 'months'), post('2026-11-18'), 'BE', '2026-11-22')?.sendBy, '2026-12-18');

if (failed) {
  console.error(`\n${failed} deadline test(s) failed`);
  process.exit(1);
}
console.log('\nAll deadline checks passed.');
