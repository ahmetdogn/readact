import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { ensureUser, initFirebase } from './firebase.ts';

// Reminders live in Firestore under the anonymous user id. They only hold a title, a date and a task.
export interface Reminder {
  id?: string;
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
}

export async function saveReminder(r: Reminder): Promise<string> {
  const s = initFirebase();
  const uid = await ensureUser();
  if (!s || !uid) throw new Error('Firebase is not configured.');
  const ref = await addDoc(collection(s.db, 'users', uid, 'reminders'), { ...r, createdAt: serverTimestamp() });
  return ref.id;
}

export async function listReminders(): Promise<Reminder[]> {
  const s = initFirebase();
  if (!s) return [];
  const uid = await ensureUser();
  if (!uid) return [];
  const snap = await getDocs(query(collection(s.db, 'users', uid, 'reminders'), orderBy('date')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Reminder) }));
}

export async function deleteReminder(id: string): Promise<void> {
  const s = initFirebase();
  const uid = await ensureUser();
  if (!s || !uid) return;
  await deleteDoc(doc(s.db, 'users', uid, 'reminders', id));
}

// .ics with alarms 7, 3 and 1 day before.
export function icsFor(r: Reminder): Blob {
  const d = r.date.replace(/-/g, '');
  const next = new Date(r.date + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Readact//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@readact`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc('Deadline: ' + r.title)}`,
    `DESCRIPTION:${esc(r.description)}`,
    ...[7, 3, 1].flatMap((n) => [
      'BEGIN:VALARM',
      `TRIGGER:-P${n}D`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`In ${n} day${n === 1 ? '' : 's'}: ` + r.title)}`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

export function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}
