// Scam rules that run before the model. They need the original text (real IBAN, numbers, links),
// so they run locally; only the messages are passed to the model.

export type Severity = 'info' | 'warn' | 'high';

export interface RuleFinding {
  id: string;
  severity: Severity;
  message: string; // no personal data, safe to send to the model
  evidence?: string; // shown locally only
}

const EU_EEA = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
]);

const IBAN_LENGTH: Record<string, number> = {
  DE: 22,
  AT: 20,
  NL: 18,
  BE: 16,
  FR: 27,
  IT: 27,
  ES: 24,
  PL: 28,
  CH: 21,
  GB: 22,
  LU: 20,
  DK: 18,
  CZ: 24,
  LT: 20,
  LV: 21,
  EE: 20,
  IE: 22,
  PT: 25,
  SE: 24,
  FI: 18,
  TR: 26,
  UA: 29,
  RO: 24,
  BG: 22,
  HR: 21,
  SK: 24,
  SI: 19,
  HU: 28,
  GR: 27,
  CY: 28,
  MT: 31,
  NO: 15,
};

// ISO 13616 mod-97
export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const len = IBAN_LENGTH[iban.slice(0, 2)];
  if (len && iban.length !== len) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g;

// Real authority and health insurer domains (suffix match).
const OFFICIAL_DOMAINS = [
  'bund.de',
  'arbeitsagentur.de',
  'jobcenter-ge.de',
  'deutsche-rentenversicherung.de',
  'familienkasse.de',
  'elster.de',
  'finanzamt.de',
  'polizei.de',
  'justiz.de',
  'bayern.de',
  'berlin.de',
  'nrw.de',
  'niedersachsen.de',
  'hessen.de',
  'sachsen.de',
  'thueringen.de',
  'brandenburg.de',
  'hamburg.de',
  'bremen.de',
  'saarland.de',
  'rlp.de',
  'bwl.de',
  'baden-wuerttemberg.de',
  'schleswig-holstein.de',
  'sachsen-anhalt.de',
  'mv-regierung.de',
  'regierung-mv.de',
  'aok.de',
  'tk.de',
  'barmer.de',
  'dak.de',
  'ikk-classic.de',
  'kkh.de',
  'hkk.de',
  'bkk.de',
  'knappschaft.de',
  'gkv-spitzenverband.de',
  'beitragsservice.de',
  'rundfunkbeitrag.de',
  'zoll.de',
  'bzst.de',
  'service.bund.de',
];

const AUTHORITY_WORDS =
  /\b(?:Finanzamt|Jobcenter|Agentur für Arbeit|Familienkasse|Rentenversicherung|Krankenkasse|AOK|Bundes\w+|Landes\w+|Polizei|Staatsanwaltschaft|Gericht|Zoll|Ausländerbehörde|Bürgeramt|Stadtverwaltung|Landratsamt|Beitragsservice|Gerichtsvollzieher)\b/i;

const PAYMENT_RED_FLAGS: Array<[RegExp, string]> = [
  [
    /\b(?:Gutschein(?:karte|code)?s?|Paysafe(?:card)?|Google[ -]?Play[- ]?(?:Karte|Card)|iTunes|Apple[ -]?Gift|Amazon[ -]?(?:Gutschein|Gift))\b/i,
    'asks for payment with gift or prepaid cards',
  ],
  [/\b(?:Bitcoin|BTC|Krypto\w*|Crypto\w*|Ethereum|USDT|Wallet)\b/i, 'asks for payment in cryptocurrency'],
  [/\b(?:Western Union|MoneyGram|Ria Money|Bargeldtransfer)\b/i, 'asks for a cash transfer service'],
  [
    /\bPayPal\b[^\n]{0,40}\b(?:Freunde|Familie|friends|family)\b/i,
    'asks for PayPal "friends & family" (no buyer protection)',
  ],
];

const PRESSURE: Array<[RegExp, string]> = [
  [
    /\binnerhalb (?:von )?(?:24|48|72) Stunden\b|\bwithin (?:24|48|72) hours\b|\bheute noch\b|\bsofort(?:ige)? Zahlung\b/i,
    'extreme time pressure (hours, "today")',
  ],
  [
    /\b(?:Haftbefehl|Verhaftung|Festnahme|Inhaftierung|Abschiebung|Ausweisung|Kontopfändung noch heute|Polizei wird)\b/i,
    'threatens arrest, police or deportation',
  ],
  [/\b(?:PIN|TAN|Passwort|Kennwort|Zugangsdaten|Online-?Banking-?Daten)\b/i, 'asks for PIN, TAN or passwords'],
  [/\b(?:QR-?Code|klicken Sie|click here|bit\.ly|tinyurl)\b/i, 'asks to pay or log in via link or QR code'],
];

export function ruleCheck(text: string): RuleFinding[] {
  const f: RuleFinding[] = [];
  const claimsAuthority = AUTHORITY_WORDS.test(text.slice(0, 400));

  for (const m of text.matchAll(IBAN_RE)) {
    const iban = m[0];
    const cc = iban.slice(0, 2);
    if (!ibanValid(iban)) {
      f.push({
        id: 'iban-checksum',
        severity: 'high',
        message: 'bank account (IBAN) has an invalid check digit – it cannot be a real account',
        evidence: iban,
      });
    } else if (!EU_EEA.has(cc)) {
      f.push({
        id: 'iban-foreign',
        severity: 'high',
        message: `bank account is outside the EU (country code ${cc})`,
        evidence: iban,
      });
    } else if (claimsAuthority && cc !== 'DE') {
      f.push({
        id: 'iban-authority-foreign',
        severity: 'warn',
        message: `a German authority asks for payment to a foreign account (${cc})`,
        evidence: iban,
      });
    }
  }

  for (const m of text.matchAll(/(?:\+49[ \-]?|\b0)(?:\(0\))?[ ]?(900|137|138|180|118\d{2})[ \-/]?\d[\d \-/]{3,}/g)) {
    f.push({
      id: 'premium-phone',
      severity: 'warn',
      message: `premium-rate phone number (0${m[1]}…)`,
      evidence: m[0].trim(),
    });
  }
  if (claimsAuthority) {
    for (const m of text.matchAll(/\+(?!49\b)\d{2,3}[ \-]?\d{3,}[\d \-]{4,}/g)) {
      f.push({
        id: 'foreign-phone',
        severity: 'warn',
        message: 'an authority gives a foreign phone number',
        evidence: m[0].trim(),
      });
    }
    if (/\b(?:WhatsApp|Telegram|Signal)\b/i.test(text))
      f.push({
        id: 'messenger',
        severity: 'high',
        message: 'an authority asks to be contacted via messenger',
        evidence: text.match(/\b(?:WhatsApp|Telegram|Signal)\b/i)![0],
      });
    const free = text.match(
      /\b[\w.+-]+@(?:gmail|googlemail|gmx|web|yahoo|outlook|hotmail|t-online|icloud|proton(?:mail)?)\.\w+\b/i,
    );
    if (free)
      f.push({
        id: 'free-mail',
        severity: 'high',
        message: 'an authority uses a free e-mail address',
        evidence: free[0],
      });
  }

  for (const m of text.matchAll(/\b(?:[\w-]+\.)+(?:de|com|net|org|info|eu|online|site|xyz|top)\b/gi)) {
    const dom = m[0].toLowerCase();
    if (
      /(?:finanzamt|jobcenter|arbeitsagentur|rentenversicherung|bundes|polizei|zoll|elster|familienkasse)/.test(dom) &&
      !OFFICIAL_DOMAINS.some((o) => dom === o || dom.endsWith('.' + o))
    ) {
      f.push({
        id: 'lookalike-domain',
        severity: 'high',
        message: 'web/e-mail domain looks official but is not on the list of real authority domains',
        evidence: dom,
      });
    }
  }

  for (const [re, msg] of [...PAYMENT_RED_FLAGS, ...PRESSURE]) {
    const m = text.match(re);
    if (m)
      f.push({
        id: msg,
        severity:
          re.source.includes('Gutschein') || re.source.includes('Bitcoin') || re.source.includes('PIN')
            ? 'high'
            : 'warn',
        message: msg,
        evidence: m[0],
      });
  }

  // A "Bescheid" without information on legal remedies
  if (
    /\bBescheid\b/i.test(text) &&
    !/\b(?:Rechtsbehelfsbelehrung|Rechtsmittelbelehrung|Widerspruch|Einspruch|Klage)\b/i.test(text)
  ) {
    f.push({
      id: 'no-remedy',
      severity: 'info',
      message: 'decision letter without information on how to object (Rechtsbehelfsbelehrung)',
    });
  }

  // Debt collection: fees out of proportion
  if (/\bInkasso\b/i.test(text)) {
    const main = amountAfter(text, /Hauptforderung/i);
    const fees = amountAfter(text, /Inkasso(?:kosten|gebühr\w*)/i);
    if (main && fees && fees > main * 0.5 && fees > 50) {
      f.push({
        id: 'high-fees',
        severity: 'warn',
        message: `debt collection fees are very high compared to the original debt (${fees.toFixed(2)} vs ${main.toFixed(2)} EUR)`,
      });
    }
    f.push({
      id: 'check-register',
      severity: 'info',
      message: 'debt collectors must be registered – check the company at rechtsdienstleistungsregister.de',
    });
  }
  return dedupe(f);
}

function amountAfter(text: string, label: RegExp): number | null {
  const m = text.match(new RegExp(label.source + '[^\\d\\n]{0,20}(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?)', 'i'));
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
}

function dedupe(f: RuleFinding[]): RuleFinding[] {
  const seen = new Set<string>();
  return f.filter((x) => (seen.has(x.id + x.evidence) ? false : (seen.add(x.id + x.evidence), true)));
}

// The model may raise this level but never lower it.
export function ruleRisk(f: RuleFinding[]): 'low' | 'medium' | 'high' {
  if (f.some((x) => x.severity === 'high')) return 'high';
  if (f.filter((x) => x.severity === 'warn').length >= 1) return 'medium';
  return 'low';
}

export type Risk = 'low' | 'medium' | 'high';

// Combines the code rules with the language model's view.
// The cloud model may raise the risk above the rules. Gemini Nano is small and sometimes
// sees red flags in perfectly normal letters, so on its own (no rule finding) it can only
// add a soft hint, never a warning.
export function combineRisk(
  rules: Risk,
  model: Risk | null,
  where: 'on_device' | 'in_cloud' | null,
): {
  risk: Risk;
  softHint: boolean;
} {
  const level = { low: 0, medium: 1, high: 2 } as const;
  const names: Risk[] = ['low', 'medium', 'high'];
  if (!model) return { risk: rules, softHint: false };
  if (where === 'on_device' && rules === 'low') return { risk: 'low', softHint: model !== 'low' };
  return { risk: names[Math.max(level[rules], level[model])], softHint: false };
}
