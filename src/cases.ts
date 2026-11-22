// Ongoing matters, kept only on this device. Each case is AES-GCM encrypted with a
// non-extractable WebCrypto key stored in IndexedDB.
//
// Matching is plain code: same reference number -> same case; same sender plus
// "Ihr Schreiben vom <date>" or a similar topic -> ask the user.
import type { PiiEntity, PiiKind } from './pii.ts';

export interface TimelineEntry {
  date: string; // YYYY-MM-DD
  text: string;
}

export interface Case {
  id: string;
  sender: string;
  topic: string;
  status: 'open' | 'waiting_for_authority' | 'waiting_for_user' | 'closed';
  refs: string[];
  secrets: { value: string; kind: PiiKind }[];
  timeline: TimelineEntry[];
  nextDeadline?: { date: string; label: string } | null;
  updatedAt: number;
}

export interface LetterFeatures {
  sender: string;
  topic: string;
  letterDate: string | null;
  refersToDate: string | null;
  refs: string[];
}

export interface Match {
  kind: 'sure' | 'suggest' | 'none';
  case?: Case;
  reason?: string;
}

const REF_KINDS: PiiKind[] = ['REFERENCE', 'TAX_ID'];

export function features(
  text: string,
  entities: readonly PiiEntity[],
  sender: string,
  topic: string,
  letterDate: string | null,
): LetterFeatures {
  const refs = entities.filter((e) => REF_KINDS.includes(e.kind)).map((e) => normRef(e.value));
  const m = text.match(
    /\b(?:Ihr(?:em|en|er)?|Unser(?:em|en)?|auf Ihr(?:en)?)\s+(?:Schreiben|Antrag|Widerspruch|Einspruch|Brief|Bescheid|Anhörung|Mitteilung|E-Mail)\s+vom\s+(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/i,
  );
  const refersToDate = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  return { sender, topic, letterDate, refersToDate, refs: [...new Set(refs)] };
}

const normRef = (s: string) => s.replace(/[\s/.\-]/g, '').toUpperCase();
const normSender = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\d ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const words = (s: string) =>
  new Set(
    normSender(s)
      .split(' ')
      .filter((w) => w.length > 3),
  );

export function match(f: LetterFeatures, cases: Case[]): Match {
  for (const c of cases) {
    const hit = f.refs.find((r) => c.refs.includes(r));
    if (hit) return { kind: 'sure', case: c, reason: 'same reference number' };
  }
  const sameSender = (c: Case) => {
    const a = words(c.sender),
      b = words(f.sender);
    return [...a].some((w) => b.has(w)) && a.size > 0;
  };
  for (const c of cases.filter(sameSender)) {
    if (f.refersToDate && c.timeline.some((e) => e.date === f.refersToDate))
      return { kind: 'suggest', case: c, reason: `refers to your letter from ${f.refersToDate}` };
  }
  for (const c of cases.filter(sameSender)) {
    const t1 = words(c.topic),
      t2 = words(f.topic);
    if ([...t1].some((w) => t2.has(w))) return { kind: 'suggest', case: c, reason: 'same sender and topic' };
  }
  return { kind: 'none' };
}

const DB = 'readact';
const STORE = 'cases';
const KEYS = 'keys';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.result.createObjectStore(KEYS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let keyPromise: Promise<CryptoKey> | null = null;
function key(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const db = await open();
    const existing = await tx<CryptoKey | undefined>(db, KEYS, 'readonly', (s) => s.get('main'));
    if (existing) return existing;
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await tx(db, KEYS, 'readwrite', (s) => s.put(k, 'main'));
    return k;
  })();
  return keyPromise;
}

interface Sealed {
  id: string;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

export async function saveCase(c: Case): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(),
    new TextEncoder().encode(JSON.stringify(c)),
  );
  await tx(await open(), STORE, 'readwrite', (s) => s.put({ id: c.id, iv, data } satisfies Sealed));
}

export async function listCases(): Promise<Case[]> {
  const db = await open();
  const sealed = await tx<Sealed[]>(db, STORE, 'readonly', (s) => s.getAll());
  const k = await key();
  const out: Case[] = [];
  for (const x of sealed) {
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: x.iv }, k, x.data);
      out.push(JSON.parse(new TextDecoder().decode(plain)));
    } catch {
      // key was lost, entry can't be read
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteCase(id: string): Promise<void> {
  await tx(await open(), STORE, 'readwrite', (s) => s.delete(id));
}

export function newCase(f: LetterFeatures, firstEntry: TimelineEntry, entities: readonly PiiEntity[]): Case {
  return {
    id: crypto.randomUUID(),
    sender: f.sender,
    topic: f.topic,
    status: 'open',
    refs: f.refs,
    secrets: entities.map((e) => ({ value: e.value, kind: e.kind })),
    timeline: [firstEntry],
    updatedAt: Date.now(),
  };
}

export function addToCase(
  c: Case,
  f: LetterFeatures,
  entry: TimelineEntry,
  entities: readonly PiiEntity[],
  status?: Case['status'],
): Case {
  const secrets = [...c.secrets];
  for (const e of entities)
    if (!secrets.some((s) => s.value === e.value)) secrets.push({ value: e.value, kind: e.kind });
  return {
    ...c,
    refs: [...new Set([...c.refs, ...f.refs])],
    secrets,
    timeline: [...c.timeline, entry].sort((a, b) => a.date.localeCompare(b.date)),
    status: status ?? c.status,
    updatedAt: Date.now(),
  };
}

export function timelineText(c: Case): string {
  return c.timeline.map((e) => `${e.date} ${e.text}`).join('\n');
}
