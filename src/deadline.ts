// Deadline maths. The model only extracts what the letter says, the dates are computed here.
// Rules used (should be reviewed by a lawyer before a real launch):
//   - letters sent by post count as received on the 4th day after posting
//     (§ 122 Abs. 2 AO, § 37 Abs. 2 SGB X, § 41 Abs. 2 VwVfG; 3 days until 2024),
//     moved to the next working day if that is a weekend or holiday (BFH)
//   - periods: §§ 187, 188 BGB, a month ends on the same day of the month
//   - an end date on a weekend or holiday moves to the next working day
//     (§ 193 BGB, § 108 Abs. 3 AO, § 26 Abs. 3 SGB X)
//   - without a Rechtsbehelfsbelehrung the objection period is one year
//     (§ 66 Abs. 2 SGG, § 58 Abs. 2 VwGO), shown as a hint only

export type State =
  'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV' | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

export const STATES: Record<State, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

export type Purpose =
  'widerspruch' | 'zahlung' | 'unterlagen_einreichen' | 'termin' | 'stellungnahme' | 'klage' | 'other';
export type PeriodStart = 'bekanntgabe' | 'zustellung' | 'letter_date' | 'receipt' | 'other' | null;
export type Delivery = 'post' | 'zustellungsurkunde' | 'email_portal' | 'hand' | 'unknown';

export interface ExtractedDeadline {
  purpose: Purpose;
  kind: 'fixed_date' | 'period';
  fixed_date: string | null;
  period_amount: number | null;
  period_unit: 'days' | 'weeks' | 'months' | null;
  period_start: PeriodStart;
  quote: string;
}

export interface Extraction {
  letter_date: string | null;
  delivery: Delivery;
  deadlines: ExtractedDeadline[];
  has_rechtsbehelfsbelehrung: boolean;
}

export interface ComputedDeadline {
  purpose: Purpose;
  quote: string;
  date: string; // last day it has to arrive
  sendBy: string;
  daysLeft: number;
  steps: string[]; // shown to the user
  needsUserDate?: 'zustellung' | 'receipt';
  shifted: boolean;
}

const d = (iso: string) => new Date(iso + 'T00:00:00Z');
export const iso = (x: Date) => x.toISOString().slice(0, 10);
const addDays = (x: Date, n: number) => new Date(x.getTime() + n * 86_400_000);

function addMonths(x: Date, n: number): Date {
  const y = x.getUTCFullYear();
  const m = x.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  // § 188 Abs. 3 BGB: 31 Jan + 1 month = 28/29 Feb
  return new Date(Date.UTC(y, m, Math.min(x.getUTCDate(), last)));
}

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const dd = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map<string, Map<string, string>>();

export function holidays(year: number, state: State): Map<string, string> {
  const key = `${year}-${state}`;
  const cached = holidayCache.get(key);
  if (cached) return cached;
  const h = new Map<string, string>();
  const fixed = (mmdd: string, name: string, states?: State[]) => {
    if (!states || states.includes(state)) h.set(`${year}-${mmdd}`, name);
  };
  const easter = easterSunday(year);
  const rel = (days: number, name: string, states?: State[]) => {
    if (!states || states.includes(state)) h.set(iso(addDays(easter, days)), name);
  };

  fixed('01-01', 'Neujahr');
  fixed('01-06', 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  fixed('03-08', 'Internationaler Frauentag', ['BE', 'MV']);
  rel(-2, 'Karfreitag');
  rel(1, 'Ostermontag');
  fixed('05-01', 'Tag der Arbeit');
  rel(39, 'Christi Himmelfahrt');
  rel(50, 'Pfingstmontag');
  rel(60, 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  fixed('08-15', 'Mariä Himmelfahrt', ['SL']);
  fixed('09-20', 'Weltkindertag', ['TH']);
  fixed('10-03', 'Tag der Deutschen Einheit');
  fixed('10-31', 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
  fixed('11-01', 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  if (state === 'SN') {
    // Buß- und Bettag: Wednesday before 23 November
    let bb = new Date(Date.UTC(year, 10, 22));
    while (bb.getUTCDay() !== 3) bb = addDays(bb, -1);
    h.set(iso(bb), 'Buß- und Bettag');
  }
  fixed('12-25', '1. Weihnachtstag');
  fixed('12-26', '2. Weihnachtstag');
  holidayCache.set(key, h);
  return h;
}

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function nonWorkingReason(x: Date, state: State): string | null {
  const wd = x.getUTCDay();
  if (wd === 0 || wd === 6) return WEEKDAY_DE[wd];
  return holidays(x.getUTCFullYear(), state).get(iso(x)) ?? null;
}

function nextWorkingDay(x: Date, state: State): { date: Date; reasons: string[] } {
  const reasons: string[] = [];
  let cur = x;
  let r: string | null;
  while ((r = nonWorkingReason(cur, state))) {
    reasons.push(`${fmt(cur)} ist ${r}`);
    cur = addDays(cur, 1);
  }
  return { date: cur, reasons };
}

export function fmt(x: Date | string): string {
  const v = typeof x === 'string' ? d(x) : x;
  return `${WEEKDAY_DE[v.getUTCDay()].slice(0, 2)}, ${String(v.getUTCDate()).padStart(2, '0')}.${String(v.getUTCMonth() + 1).padStart(2, '0')}.${v.getUTCFullYear()}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((d(toIso).getTime() - d(fromIso).getTime()) / 86_400_000);
}

export interface UserDates {
  zustellung?: string; // date on the yellow envelope
  receipt?: string;
}

export function computeDeadline(
  dl: ExtractedDeadline,
  ex: Pick<Extraction, 'letter_date' | 'delivery'>,
  state: State,
  today: string,
  user: UserDates = {},
): ComputedDeadline | null {
  const steps: string[] = [];
  let end: Date;
  let shifted = false;
  let needsUserDate: ComputedDeadline['needsUserDate'];

  if (dl.kind === 'fixed_date') {
    if (!dl.fixed_date || !/^\d{4}-\d{2}-\d{2}$/.test(dl.fixed_date)) return null;
    end = d(dl.fixed_date);
    steps.push(`Im Brief steht ein festes Datum: ${fmt(end)}.`);
  } else {
    if (!dl.period_amount || !dl.period_unit) return null;

    let event: Date | null = null;
    const start = dl.period_start ?? 'bekanntgabe';
    if (ex.delivery === 'zustellungsurkunde' || start === 'zustellung') {
      if (user.zustellung) {
        event = d(user.zustellung);
        steps.push(`Zugestellt laut Umschlag am ${fmt(event)}.`);
      } else {
        needsUserDate = 'zustellung';
        if (!ex.letter_date) return null;
        event = addDays(d(ex.letter_date), 1);
        steps.push('Datum auf dem gelben Umschlag fehlt – vorläufig gerechnet ab dem Tag nach dem Briefdatum.');
      }
    } else if (start === 'receipt') {
      if (user.receipt) {
        event = d(user.receipt);
        steps.push(`Erhalten am ${fmt(event)}.`);
      } else {
        needsUserDate = 'receipt';
        event = d(today);
        steps.push('Eingangsdatum fehlt – vorläufig gerechnet ab heute.');
      }
    } else if (start === 'letter_date') {
      if (!ex.letter_date) return null;
      event = d(ex.letter_date);
      steps.push(`Frist läuft ab Briefdatum ${fmt(event)}.`);
    } else {
      if (!ex.letter_date) return null;
      const posted = d(ex.letter_date);
      const raw = addDays(posted, 4);
      const moved = nextWorkingDay(raw, state);
      event = moved.date;
      steps.push(`Briefdatum ${fmt(posted)} + 4 Tage Postlaufzeit (gilt seit 2025) = ${fmt(raw)}.`);
      if (moved.reasons.length) steps.push(`${moved.reasons.join(', ')} → bekanntgegeben am ${fmt(event)}.`);
      else steps.push(`Gilt als bekanntgegeben am ${fmt(event)}.`);
    }

    const n = dl.period_amount;
    if (dl.period_unit === 'months') end = addMonths(event, n);
    else if (dl.period_unit === 'weeks') end = addDays(event, 7 * n);
    else end = addDays(event, n);
    const unitDe = {
      days: n === 1 ? 'Tag' : 'Tage',
      weeks: n === 1 ? 'Woche' : 'Wochen',
      months: n === 1 ? 'Monat' : 'Monate',
    }[dl.period_unit];
    steps.push(`+ ${n} ${unitDe} = ${fmt(end)}.`);
  }

  const moved = nextWorkingDay(end, state);
  if (moved.reasons.length && dl.kind === 'period') {
    shifted = true;
    end = moved.date;
    steps.push(`${moved.reasons.join(', ')} → Fristende verschiebt sich auf ${fmt(end)}.`);
  }

  // suggest sending three working days early
  let send = addDays(end, -3);
  while (nonWorkingReason(send, state)) send = addDays(send, -1);
  if (send < d(today)) send = d(today);

  return {
    purpose: dl.purpose,
    quote: dl.quote,
    date: iso(end),
    sendBy: iso(send),
    daysLeft: daysBetween(today, iso(end)),
    steps,
    needsUserDate,
    shifted,
  };
}

export function trafficLight(daysLeft: number): 'red' | 'amber' | 'green' {
  if (daysLeft <= 7) return 'red';
  if (daysLeft <= 14) return 'amber';
  return 'green';
}

export const PURPOSE_LABEL: Record<Purpose, string> = {
  widerspruch: 'Objection (Widerspruch / Einspruch)',
  zahlung: 'Payment',
  unterlagen_einreichen: 'Send documents',
  termin: 'Appointment',
  stellungnahme: 'Statement',
  klage: 'Lawsuit',
  other: 'Deadline',
};
