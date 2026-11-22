// Runs entirely in the browser. Personal data is swapped for placeholders like [NAME_1];
// the mapping back to real values never leaves the device.

export type PiiKind =
  'NAME' | 'ADDRESS' | 'IBAN' | 'EMAIL' | 'PHONE' | 'TAX_ID' | 'REFERENCE' | 'BIRTHDATE' | 'HEALTH' | 'OTHER';

export type PiiSource = 'rule' | 'on-device-ai' | 'user';

export interface PiiEntity {
  value: string;
  kind: PiiKind;
  placeholder: string;
  source: PiiSource;
}

interface Rule {
  kind: PiiKind;
  re: RegExp;
  group?: number; // capture group with the sensitive part, default: whole match
}

// Unicode classes so names like Ayşe, Kovalenko or Nguyễn match
const UP = '\\p{Lu}';
const LO = "[\\p{Ll}'’]";
const NAME_WORD = `${UP}${LO}+(?:-${UP}${LO}+)?`;
const PERSON = `${NAME_WORD}(?:[ \\t]+${NAME_WORD}){0,3}`;
const SALUTATION = '(?:Herrn?|Frau|Familie|Mr\\.?|Mrs\\.?|Ms\\.?)';
const TITLE = '(?:(?:Dr|Prof)\\.(?:[ \\t]*med\\.)?[ \\t]+)?';

// More specific patterns first. No pattern may cross a line break.
const RULES: Rule[] = [
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g },
  { kind: 'EMAIL', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  // Tax ID (11 digits), tax number, social insurance number
  { kind: 'TAX_ID', re: /\b(?:Steuer-?ID|Identifikationsnummer|IdNr\.?)[ \t]*:?[ \t]*([\d ]{11,15})/gi, group: 1 },
  { kind: 'TAX_ID', re: /\b(?:Steuernummer|St\.?-?Nr\.?)[ \t]*:?[ \t]*([\d/ ]{10,16})/gi, group: 1 },
  { kind: 'TAX_ID', re: /\b\d{2}[ \t]?\d{6}[ \t]?[A-Z][ \t]?\d{3}\b/g },
  // Reference numbers after a label
  {
    kind: 'REFERENCE',
    re: /\b(?:Aktenzeichen|Az\.?|Gesch(?:ä|ae)ftszeichen|Kunden-?(?:nummer|nr\.?)|Vertrags-?(?:nummer|nr\.?)|Versicherten-?(?:nummer|nr\.?)|BG-?Nummer|Mitglieds-?(?:nummer|nr\.?)|Rechnungs-?(?:nummer|nr\.?)|Vorgangs-?(?:nummer|nr\.?)|Unser Zeichen|Ihr Zeichen)[ \t]*:?[ \t]*([A-Z0-9][A-Z0-9/.\- ]{3,30}[A-Z0-9])/gi,
    group: 1,
  },
  { kind: 'REFERENCE', re: /\b[A-Z]\d{9}\b/g }, // health insurance number
  // Health data: diagnosis after a label, ICD-10 codes
  {
    kind: 'HEALTH',
    re: /\b(?:Diagnosen?|Befund|Erkrankung|Krankheit|Behinderung)[ \t]*:[ \t]*([^\n(]{3,90}?)(?=[ \t]*\(|[ \t]*$)/gim,
    group: 1,
  },
  { kind: 'HEALTH', re: /\bICD(?:-?10)?(?:-GM)?[ \t]*:?[ \t]*([A-TV-Z]\d{2}(?:\.\d{1,2})?[GVAZRLB]?)\b/g, group: 1 },
  { kind: 'PHONE', re: /(?<![\w/.,])(?:\+\d{1,3}[ \-]?(?:\(0\)[ ]?)?|0)\d{2,5}(?:[ \-/]?\d{2,}){1,4}(?![\w/.,])/g },
  {
    kind: 'BIRTHDATE',
    re: /\b(?:geb(?:oren)?\.?(?:[ \t]+am)?|Geburtsdatum|born(?: on)?|date of birth)[ \t]*:?[ \t]*(\d{1,2}\.[ \t]?\d{1,2}\.[ \t]?\d{2,4})/gi,
    group: 1,
  },
  {
    kind: 'ADDRESS',
    re: /(?<![\p{L}])\p{Lu}[\p{Ll}\-]+(?:straße|strasse|str\.|weg|allee|platz|gasse|ring|damm|ufer|chaussee|pfad|steig|zeile)[ \t]+\d+[ \t]?[a-z]?\b/gu,
  },
  { kind: 'ADDRESS', re: /\b\d{5}[ \t]+\p{Lu}\p{Ll}+(?:[ \-]\p{Lu}\p{Ll}+)?(?![\p{L}])/gu },
  // Salutation + name ("Herrn\nMehmet Yilmaz", "Sehr geehrte Frau Demir", "Liebe Familie Nguyen")
  { kind: 'NAME', re: new RegExp(`\\b${SALUTATION}[ \\t]*\\n?[ \\t]*${TITLE}(${PERSON})`, 'gu'), group: 1 },
  // Family members mentioned in the text ("Ihr Sohn Emir")
  {
    kind: 'NAME',
    re: new RegExp(
      `\\b(?:Sohn|Tochter|Kind|Ehemann|Ehefrau|Ehepartner(?:in)?|Lebenspartner(?:in)?|Enkel(?:in)?|Bruder|Schwester|Vater|Mutter)[ \\t]+(${NAME_WORD})`,
      'gu',
    ),
    group: 1,
  },
];

const NAME_LIST_LABEL =
  /\b(?:Name|Vorname|Nachname|Kinder?|Mitglieder(?: der Bedarfsgemeinschaft)?|Bedarfsgemeinschaft|Versicherte[rn]?|Patient(?:in)?|Mieter(?:innen|in)?|Schuldner(?:in)?|Antragsteller(?:in)?|Empfänger(?:in)?|Leistungsberechtigte[rn]?)[ \t]*:[ \t]*([^\n]+)/gu;

const ORG_WORDS =
  /\b(?:GmbH|AG|KG|e\.\s?V\.|mbH|Amt|Finanzamt|Jobcenter|Agentur|Krankenkasse|Kasse|AOK|BKK|IKK|Bank|Sparkasse|Stadt|Gemeinde|Landkreis|Bezirk|Verwaltung|Hausverwaltung|Inkasso|Partner|Gericht|Versicherung|Behörde|Ministerium|Bundes\w*|Postfach|Universität|Schule)\b|&/u;

const NOT_A_NAME = new Set([
  'Herr',
  'Herrn',
  'Frau',
  'Familie',
  'Dr',
  'Prof',
  'Und',
  'Sehr',
  'Liebe',
  'Lieber',
  'Hallo',
  'Datum',
  'Betreff',
  'Bescheid',
  'Antrag',
]);

const PURE_POSTCODE_LINE = /^[ \t]*\d{5}[ \t]+\p{Lu}[\p{L} \-]+$/u;
const PERSON_LINE = new RegExp(
  `^[ \\t]*(?:${SALUTATION}[ \\t]+)?${TITLE}(${PERSON}(?:[ \\t]*(?:,|und|&)[ \\t]*${PERSON})*)[ \\t]*$`,
  'u',
);

const PLACEHOLDER = /\[[A-Z_]+_\d+\]/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole words only, so "Emir" does not match inside "Emirates".
function wordRe(value: string, flags = 'gu'): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${escapeRe(value)}(?![\\p{L}\\d])`, flags);
}

export function occurrences(text: string, value: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(wordRe(value))) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

export class Redactor {
  private entities: PiiEntity[] = [];
  private counters = new Map<PiiKind, number>();

  get all(): readonly PiiEntity[] {
    return this.entities;
  }

  // Name parts are registered too, so a later "Herr Yilmaz" is caught.
  add(value: string, kind: PiiKind, source: PiiSource): string | null {
    const v = value
      .trim()
      .replace(/[,;:]+$/, '')
      .replace(/(?<!\b[A-Z])\.$/, '');
    if (v.length < 2) return null;
    if (PLACEHOLDER.test(v) || /^[A-Z]+(?:_[A-Z]+)*_\d+$/.test(v)) return null; // placeholders are never PII
    const existing = this.entities.find((e) => e.value === v);
    if (existing) return existing.placeholder;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const placeholder = `[${kind}_${n}]`;
    this.entities.push({ value: v, kind, placeholder, source });

    if (kind === 'NAME') {
      const parts = v.split(/[ \t]+/).filter((p) => p.length >= 3 && /^\p{Lu}/u.test(p) && !NOT_A_NAME.has(p));
      if (parts.length > 1) for (const p of parts) this.add(p, 'NAME', source);
    }
    return placeholder;
  }

  // Models sometimes echo placeholders ("Herr [NAME_2]") or values that are already hidden.
  // Only text that is still visible in the redacted letter counts as a new finding.
  addFromModel(raw: string, kind: PiiKind, redactedText: string): boolean {
    const v = this.restore(String(raw ?? ''))
      .trim()
      .replace(/[,;:]+$/, '');
    if (v.length < 2 || PLACEHOLDER.test(v)) return false;
    if (!wordRe(v, 'u').test(redactedText)) return false;
    const before = this.entities.length;
    this.add(v, kind, 'on-device-ai');
    return this.entities.length > before;
  }

  remove(placeholder: string): void {
    this.entities = this.entities.filter((e) => e.placeholder !== placeholder);
  }

  detectWithRules(text: string): void {
    const covered: Array<[number, number]> = [];
    const overlaps = (a: number, b: number) => covered.some(([s, e]) => a < e && b > s);
    const take = (start: number, value: string, kind: PiiKind) => {
      const end = start + value.length;
      if (overlaps(start, end)) return;
      covered.push([start, end]);
      this.add(value, kind, 'rule');
    };

    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        const hit = rule.group ? m[rule.group] : m[0];
        if (!hit || m.index === undefined) continue;
        if (rule.kind === 'PHONE' && hit.replace(/\D/g, '').length < 7) continue;
        if (rule.kind === 'NAME' && (ORG_WORDS.test(hit) || NOT_A_NAME.has(hit))) continue;
        take(m.index + m[0].indexOf(hit), hit, rule.kind);
      }
    }

    // Name lists after labels ("Mitglieder der Bedarfsgemeinschaft: A, B und C")
    for (const m of text.matchAll(NAME_LIST_LABEL)) {
      const start = m.index! + m[0].indexOf(m[1]);
      this.addNameList(m[1], start, take);
    }

    this.detectAddressBlocks(text, take);
  }

  // Recipient block: a line with only "12345 City" anchors it. The line above is the street,
  // up to two lines above that are names, unless they look like an organisation.
  private detectAddressBlocks(text: string, take: (start: number, value: string, kind: PiiKind) => void) {
    const lines = text.split('\n');
    const offsets: number[] = [];
    lines.reduce((pos, l) => (offsets.push(pos), pos + l.length + 1), 0);

    lines.forEach((line, i) => {
      if (!PURE_POSTCODE_LINE.test(line) || i === 0) return;
      const street = lines[i - 1];
      if (!/\d/.test(street) || ORG_WORDS.test(street)) return;
      // Whole line as well, to catch things like "Whg. 3.2".
      take(offsets[i - 1] + street.search(/\S/), street.trim(), 'ADDRESS');
      this.add(street.trim(), 'ADDRESS', 'rule');
      take(offsets[i] + line.search(/\S/), line.trim(), 'ADDRESS');

      for (let j = i - 2; j >= Math.max(0, i - 4); j--) {
        const l = lines[j];
        if (!l.trim() || ORG_WORDS.test(l)) break;
        const m = l.match(PERSON_LINE);
        if (!m) break;
        this.addNameList(m[1], offsets[j] + l.indexOf(m[1]), take);
      }
    });
  }

  private addNameList(list: string, start: number, take: (start: number, value: string, kind: PiiKind) => void) {
    let cursor = 0;
    for (const raw of list.split(/[ \t]*(?:,|;|\bund\b|&)[ \t]*/u)) {
      const name = raw.trim().replace(/^(?:Herrn?|Frau|Familie)[ \t]+/u, '');
      const at = list.indexOf(name, cursor);
      cursor = at + name.length;
      if (!name || ORG_WORDS.test(name) || !new RegExp(`^${TITLE}${PERSON}$`, 'u').test(name) || NOT_A_NAME.has(name))
        continue;
      take(start + at, name, 'NAME');
    }
  }

  redact(text: string): string {
    let out = text;
    const sorted = [...this.entities].sort((a, b) => b.value.length - a.value.length);
    for (const e of sorted) out = out.replace(wordRe(e.value), e.placeholder);
    return out;
  }

  restore(text: string): string {
    return text.replace(/\[([A-Z_]+_\d+)\]/g, (whole) => {
      const e = this.entities.find((x) => x.placeholder === whole);
      return e ? e.value : whole;
    });
  }

  leaks(text: string): PiiEntity[] {
    return this.entities.filter((e) => wordRe(e.value, 'u').test(text));
  }
}

const KINDS: PiiKind[] = [
  'NAME',
  'ADDRESS',
  'IBAN',
  'EMAIL',
  'PHONE',
  'TAX_ID',
  'REFERENCE',
  'BIRTHDATE',
  'HEALTH',
  'OTHER',
];

export function normalizeKind(k: unknown): PiiKind {
  const up = String(k ?? '').toUpperCase();
  return (KINDS as string[]).includes(up) ? (up as PiiKind) : 'OTHER';
}
