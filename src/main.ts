import {
  detectPiiOnDevice,
  explain,
  explainDeadline,
  explainInCase,
  expertHelp,
  extractDeadlines,
  fakeCheck,
  finalPrivacyCheck,
  LANGUAGES,
  localStatus,
  prepareLocalModel,
  type Explanation,
  type FakeCheck,
  type Where,
} from './ai.ts';
import {
  addToCase,
  deleteCase,
  features,
  listCases,
  match,
  newCase,
  saveCase,
  timelineText,
  type Case,
  type LetterFeatures,
  type Match,
  type TimelineEntry,
} from './cases.ts';
import {
  computeDeadline,
  fmt,
  PURPOSE_LABEL,
  STATES,
  trafficLight,
  type ComputedDeadline,
  type Extraction,
  type State,
  type UserDates,
} from './deadline.ts';
import { daysUntil, deleteReminder, icsFor, listReminders, saveReminder, type Reminder } from './reminders.ts';
import { ruleCheck, ruleRisk, type RuleFinding } from './fraud.ts';
import { initFirebase, isConfigured } from './firebase.ts';
import { occurrences, Redactor, type PiiEntity } from './pii.ts';
import { SAMPLE_LETTER } from './sample.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  original: '',
  redactor: new Redactor(),
  explanation: null as Explanation | null,
  where: null as Where | null,
  localRuns: 0,
  nanoChecked: false,
  finalCheckDone: false,
  cloudRuns: 0,
  cloudChars: 0,
  extraction: null as Extraction | null,
  computed: [] as ComputedDeadline[],
  userDates: {} as UserDates,
  rules: [] as RuleFinding[],
  fake: null as { data: FakeCheck; where: Where } | null,
  features: null as LetterFeatures | null,
  match: null as Match | null,
};

initFirebase();
if (!isConfigured) $('setup-warning').hidden = false;

const langSel = $<HTMLSelectElement>('lang');
for (const [code, name] of Object.entries(LANGUAGES)) langSel.add(new Option(name.replace(/ \(.*/, ''), code));
langSel.value = (navigator.language || 'en').slice(0, 2) in LANGUAGES ? navigator.language.slice(0, 2) : 'en';
langSel.addEventListener('change', refreshStatus);

// The federal state decides which public holidays count for deadlines.
const stateSel = $<HTMLSelectElement>('state');
for (const [code, name] of Object.entries(STATES)) stateSel.add(new Option(name, code));
try {
  stateSel.value = localStorage.getItem('readact.state') || 'BE';
} catch {
  stateSel.value = 'BE';
}
stateSel.addEventListener('change', () => {
  try {
    localStorage.setItem('readact.state', stateSel.value);
  } catch {
    // storage blocked, not important
  }
  if (state.extraction) {
    state.computed = computeAll();
    $('deadline-box').innerHTML = deadlinesHtml();
    wireDeadlines();
    explainPrimaryDeadline();
  }
});
renderCases();

refreshStatus();
renderReminders();

async function refreshStatus() {
  const chip = $('ai-status');
  const st = await localStatus(langSel.value);
  chip.className = 'chip';
  if (st === 'available') {
    chip.classList.add('ok');
    chip.textContent = 'Gemini Nano ready · on device';
  } else if (st === 'downloadable' || st === 'downloading') {
    chip.classList.add('warn');
    chip.innerHTML = `On-device AI available <button class="btn-ink" id="dl">Download</button>`;
    $('dl').onclick = async () => {
      chip.innerHTML = '<span class="spinner"></span>Downloading model… 0%';
      try {
        await prepareLocalModel(
          (p) => (chip.innerHTML = `<span class="spinner"></span>Downloading model… ${Math.round(p * 100)}%`),
        );
      } catch (e) {
        toast(errMsg(e));
      }
      refreshStatus();
    };
  } else {
    chip.classList.add('warn');
    chip.textContent = 'Cloud mode · anonymised text only';
  }
}

const drop = $('drop');
const fileInput = $<HTMLInputElement>('file');
fileInput.addEventListener('change', () => fileInput.files?.[0] && handleImage(fileInput.files[0]));
drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) handleImage(f);
});

async function handleImage(file: File) {
  const bar = $('ocr-progress');
  const fill = bar.firstElementChild as HTMLElement;
  bar.hidden = false;
  fill.style.width = '2%';
  drop.querySelector('span:nth-of-type(2)')!.innerHTML =
    '<span class="spinner"></span>Reading the letter on your device…';
  try {
    const { readImage } = await import('./ocr.ts');
    const text = await readImage(file, (p) => (fill.style.width = `${Math.max(2, p * 100)}%`));
    $<HTMLTextAreaElement>('text').value = text;
    ($('paste-box') as HTMLDetailsElement).open = true;
    drop.querySelector('span:nth-of-type(2)')!.innerHTML =
      '<strong>✓ Text recognised.</strong> Check it below, then continue.';
  } catch (e) {
    toast('Could not read the image: ' + errMsg(e));
    drop.querySelector('span:nth-of-type(2)')!.innerHTML =
      '<strong>Take a photo</strong> or drop an image of the letter';
  } finally {
    bar.hidden = true;
  }
}

$('sample').onclick = () => {
  $<HTMLTextAreaElement>('text').value = SAMPLE_LETTER;
  ($('paste-box') as HTMLDetailsElement).open = true;
};

$('protect').onclick = async () => {
  const text = $<HTMLTextAreaElement>('text').value.trim();
  if (text.length < 30) return toast('Please add a photo or paste the letter first.');
  const btn = $<HTMLButtonElement>('protect');
  busy(btn, 'Scanning for private data…');
  state.original = text;
  state.redactor = new Redactor();
  state.redactor.detectWithRules(text);
  let aiFound = 0;
  state.nanoChecked = false;
  state.finalCheckDone = false;
  try {
    if ((await localStatus()) === 'available' && isConfigured) {
      aiFound = await detectPiiOnDevice(state.redactor.redact(text), state.redactor);
      state.localRuns++;
      state.nanoChecked = true;
    }
  } catch (e) {
    console.warn('On-device PII detection skipped:', e);
  }
  done(btn);
  $('step-firewall').hidden = false;
  // Without Gemini Nano the user is the second check, so start in the cloud view.
  cloudView.checked = !state.nanoChecked;
  confirmBox.checked = false;
  $('confirm-text').textContent = state.nanoChecked
    ? 'Rules and Gemini Nano checked this on your device. I had a look too – nothing private is left.'
    : 'No on-device AI here, so please check: nothing private is left in the cloud view above.';
  syncExplain();
  renderFirewall(aiFound);
  $('step-firewall').scrollIntoView({ behavior: 'smooth' });
};

$('hero-upload').onclick = () => {
  $('app').scrollIntoView({ behavior: 'smooth' });
  fileInput.click();
};
$('hero-sample').onclick = () => {
  $('sample').click();
  $('app').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => $('protect').click(), 600);
};

const cloudView = $<HTMLInputElement>('cloud-view');
cloudView.onchange = () => renderFirewall();
const confirmBox = $<HTMLInputElement>('confirm');
confirmBox.onchange = syncExplain;
function syncExplain() {
  $<HTMLButtonElement>('explain').disabled = !confirmBox.checked;
}

function renderFirewall(aiFound?: number) {
  const view = $('letter-view');
  view.replaceChildren(...segments(state.original, state.redactor.all, cloudView.checked));
  const list = $('pii-list');
  list.replaceChildren(
    ...state.redactor.all.map((e) => {
      const li = document.createElement('li');
      const src =
        e.source === 'on-device-ai'
          ? '<span class="src ai">Gemini Nano</span>'
          : e.source === 'user'
            ? '<span class="src">you</span>'
            : '<span class="src">rule</span>';
      li.innerHTML = `<b>${esc(e.placeholder)}</b> ${src}`;
      return li;
    }),
  );
  const n = state.redactor.all.length;
  const ai = aiFound ? ` · ${aiFound} found by on-device AI` : '';
  $('firewall-summary').textContent = `${n} private item${n === 1 ? '' : 's'} hidden${ai}`;
}

function segments(text: string, entities: readonly PiiEntity[], showPlaceholders: boolean): Node[] {
  type Span = { start: number; end: number; e: PiiEntity };
  const spans: Span[] = [];
  const sorted = [...entities].sort((a, b) => b.value.length - a.value.length);
  for (const e of sorted) {
    for (const [start, end] of occurrences(text, e.value)) {
      if (!spans.some((s) => start < s.end && end > s.start)) spans.push({ start, end, e });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Node[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) out.push(document.createTextNode(text.slice(pos, s.start)));
    const m = document.createElement('mark');
    m.className = 'pii ' + (showPlaceholders ? 'ph' : 'blur');
    m.textContent = showPlaceholders ? s.e.placeholder : s.e.value;
    m.title = `${s.e.placeholder} – click to un-hide`;
    m.tabIndex = 0;
    m.onclick = () => {
      state.redactor.remove(s.e.placeholder);
      renderFirewall();
    };
    out.push(m);
    pos = s.end;
  }
  out.push(document.createTextNode(text.slice(pos)));
  return out;
}

$('hide-sel').onclick = () => {
  const sel = window.getSelection()?.toString().trim();
  if (!sel || sel.length < 2) return toast('Select a word or number in the letter first.');
  if (cloudView.checked) return toast('Switch off “Show what the cloud would see” to select original text.');
  if (!state.original.includes(sel)) return toast('Please select text inside a single line.');
  state.redactor.add(sel, 'OTHER', 'user');
  renderFirewall();
};

$('explain').onclick = async () => {
  const btn = $<HTMLButtonElement>('explain');
  if (!confirmBox.checked) return toast('Please confirm the check above first.');
  busy(btn, 'Final privacy check…');
  try {
    // Second pass with Gemini Nano, once per letter. After the user confirms again we go ahead.
    const extra = state.finalCheckDone
      ? null
      : await finalPrivacyCheck(state.redactor.redact(state.original), state.redactor).catch(() => null);
    state.finalCheckDone = true;
    if (extra) {
      state.localRuns++;
      confirmBox.checked = false;
      syncExplain();
      renderFirewall();
      toast(
        `Gemini Nano found ${extra} more private item${extra === 1 ? '' : 's'} and hid ${extra === 1 ? 'it' : 'them'} (marked “Gemini Nano”). Tap any you want to show, then confirm again.`,
      );
      return;
    }
    if (extra === 0) state.localRuns++;

    const redacted = state.redactor.redact(state.original);
    state.rules = ruleCheck(state.original); // needs the real IBAN etc., stays local
    btn.innerHTML = '<span class="spinner"></span>Reading your letter…';

    const [ex, dl, fc] = await Promise.allSettled([
      explain(redacted, langSel.value, state.redactor),
      extractDeadlines(redacted, state.redactor),
      fakeCheck(redacted, state.rules, langSel.value, state.redactor),
    ]);
    if (ex.status === 'rejected') throw ex.reason;
    const track = (where: Where, chars: number) => (where === 'on_device' ? state.localRuns++ : countCloud(chars));
    state.explanation = ex.value.data;
    state.where = ex.value.where;
    track(ex.value.where, redacted.length);
    state.extraction = dl.status === 'fulfilled' ? dl.value.data : null;
    if (dl.status === 'fulfilled') track(dl.value.where, redacted.length);
    state.fake = fc.status === 'fulfilled' ? fc.value : null;
    if (fc.status === 'fulfilled') track(fc.value.where, redacted.length);
    state.userDates = {};

    renderResult();
    $('step-result').hidden = false;
    $('step-expert').hidden = false;
    $('step-result').scrollIntoView({ behavior: 'smooth' });
    explainPrimaryDeadline();
    renderCaseMatch();
  } catch (e) {
    toast(errMsg(e));
  } finally {
    done(btn);
  }
};

function computeAll(): ComputedDeadline[] {
  const ex = state.extraction;
  if (!ex) return [];
  const today = new Date().toISOString().slice(0, 10);
  return ex.deadlines
    .map((d) => computeDeadline(d, ex, stateSel.value as State, today, state.userDates))
    .filter((d): d is ComputedDeadline => !!d)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderResult() {
  const x = state.explanation!;
  $('where').className = 'badge ' + (state.where === 'in_cloud' ? 'cloud' : 'device');
  $('where').textContent = state.where === 'on_device' ? 'Computed on your device' : 'Cloud · anonymised text only';
  state.computed = computeAll();

  $('result').innerHTML = `
    <div id="fake-box">${fakeHtml()}</div>
    <div id="deadline-box">${deadlinesHtml()}</div>
    <p class="summary">${show(x.summary)}</p>
    <div class="facts">
      <div class="fact"><div class="k">From</div><div class="v">${show(x.sender)}</div></div>
      <div class="fact"><div class="k">Type</div><div class="v">${show(x.letterType)}</div></div>
      ${x.amount ? `<div class="fact"><div class="k">${x.moneyDirection === 'receive' ? 'You receive' : x.moneyDirection === 'pay' ? 'You pay' : 'Amount'}</div><div class="v">${show(x.amount)}</div></div>` : ''}
      <div class="fact"><div class="k">Urgency</div><div class="v">${{ low: '🟢 Low', medium: '🟠 Medium', high: '🔴 High' }[x.urgency] ?? esc(x.urgency)}</div></div>
    </div>
    <h3>What they want from you</h3>
    <p>${show(x.whatTheyWant)}</p>
    <h3>Your next steps</h3>
    <ul class="actions">${x.actions.map((a, i) => `<li><input type="checkbox" id="a${i}"><span><label for="a${i}">${show(a)}</label></span></li>`).join('')}</ul>
    ${x.needsProfessionalHelp ? `<div class="callout">⚖️ <strong>Worth getting advice.</strong> ${show(x.helpReason)} See <em>Your options</em> below – including free advice services and a reply template.</div>` : ''}
  `;
  $('result')
    .querySelectorAll<HTMLInputElement>('.actions input')
    .forEach((cb) => (cb.onchange = () => cb.closest('li')!.classList.toggle('done', cb.checked)));
  wireDeadlines();
  renderFlow();
}

function fakeHtml(): string {
  const fc = state.fake;
  const rules = state.rules.filter((r) => r.severity !== 'info');
  const info = state.rules.filter((r) => r.severity === 'info');
  const levels = { low: 0, medium: 1, high: 2 } as const;
  const risk = (['low', 'medium', 'high'] as const)[
    Math.max(levels[ruleRisk(state.rules)], fc ? (levels[fc.data.risk] ?? 0) : 0)
  ];
  const badge = fc ? whereBadge(fc.where) : '';
  if (risk === 'low') {
    return `<div class="fake ok"><b>Scam check:</b> ${show(fc?.data.explanation || 'No obvious warning signs found.')} ${badge}
      ${info.length ? `<ul class="fine">${info.map((r) => `<li>${esc(r.message)}</li>`).join('')}</ul>` : ''}</div>`;
  }
  const flags = [
    ...rules.map(
      (r) =>
        `<li><b>${esc(r.message)}</b>${r.evidence ? ` – <code>${esc(r.evidence)}</code>` : ''} <span class="src">checked by code</span></li>`,
    ),
    ...(fc?.data.red_flags ?? []).map(
      (f) => `<li><b>${show(f.flag)}</b>${f.quote ? ` – “${show(f.quote)}”` : ''}</li>`,
    ),
  ];
  return `<div class="fake ${risk}">
    <div class="fake-head">${risk === 'high' ? '🚨 This letter shows strong signs of a scam' : '⚠️ Some warning signs – check before you pay'} ${badge}</div>
    ${fc ? `<p>${show(fc.data.explanation)}</p>` : ''}
    <ul>${flags.join('')}</ul>
    ${fc?.data.advice?.length ? `<p><b>What to do:</b></p><ul>${fc.data.advice.map((a) => `<li>${show(a)}</li>`).join('')}</ul>` : ''}
    <p class="fine">Unsure? Your local <b>Verbraucherzentrale</b> checks letters like this for free or at low cost.</p>
  </div>`;
}

function deadlinesHtml(): string {
  const ex = state.extraction;
  if (!ex) return '<p class="muted">Could not read deadlines from this letter – please check the letter yourself.</p>';
  const items = state.computed;
  const bescheid = /\bBescheid\b/i.test(state.original);
  const noRbb =
    !ex.has_rechtsbehelfsbelehrung && bescheid
      ? `<div class="callout">ℹ️ This decision does not explain how to object (no <em>Rechtsbehelfsbelehrung</em>). In that case the objection period can be <b>one year</b> instead of one month. Have this checked by an advice service.</div>`
      : '';
  if (!items.length) return `<p class="muted">No deadline found in this letter.</p>${noRbb}`;
  return (
    items
      .map((d, i) => {
        const light = trafficLight(d.daysLeft);
        const userInput = d.needsUserDate
          ? `<label class="date-ask">${d.needsUserDate === 'zustellung' ? '📮 Date stamped on the yellow envelope' : '📬 Day you received the letter'}
               <input type="date" data-need="${d.needsUserDate}" value="${state.userDates[d.needsUserDate] ?? ''}"></label>`
          : '';
        return `<div class="deadline ${light}">
          <div class="days">${d.daysLeft < 0 ? '!' : d.daysLeft}<small>${d.daysLeft < 0 ? 'overdue' : d.daysLeft === 1 ? 'day left' : 'days left'}</small></div>
          <div class="dl-body">
            <div class="dl-purpose">${esc(PURPOSE_LABEL[d.purpose])}</div>
            <strong>Must arrive by ${esc(fmt(d.date))}</strong>
            <div class="dl-send">Safer: send by <b>${esc(fmt(d.sendBy))}</b></div>
            <p class="dl-explain" id="dl-explain-${i}"></p>
            <details><summary>How we calculated this</summary><ol>${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
              ${d.quote ? `<p class="fine">Letter: “${esc(d.quote)}”</p>` : ''}
              <p class="fine">Holidays for ${esc(STATES[stateSel.value as State])}. Calculated by code, not by AI – based on § 122 AO / § 37 SGB X (4 days since 2025) and §§ 187–193 BGB. Not legal advice.</p>
            </details>
            ${userInput}
          </div>
        </div>`;
      })
      .join('') +
    `<div class="row">
       <button id="ics" class="btn btn-line small">Add to calendar (7 / 3 / 1 days before)</button>
       <button id="remind" class="btn btn-line small">Remind me</button>
     </div>${noRbb}`
  );
}

function wireDeadlines() {
  const box = $('deadline-box');
  box.querySelectorAll<HTMLInputElement>('input[data-need]').forEach((inp) => {
    inp.onchange = () => {
      state.userDates[inp.dataset.need as 'zustellung' | 'receipt'] = inp.value || undefined;
      state.computed = computeAll();
      box.innerHTML = deadlinesHtml();
      wireDeadlines();
      explainPrimaryDeadline();
    };
  });
  const first = state.computed[0];
  if (!first) return;
  const x = state.explanation!;
  const reminder = (): Reminder => ({
    title: `${PURPOSE_LABEL[first.purpose]}: ${x.letterType} – ${x.sender}`,
    date: first.date,
    description: `Must arrive by ${fmt(first.date)}. Safer: send by ${fmt(first.sendBy)}.`,
  });
  const ics = document.getElementById('ics');
  if (ics) ics.onclick = () => download(icsFor(reminder()), 'readact-deadline.ics');
  const rem = document.getElementById('remind') as HTMLButtonElement | null;
  if (rem)
    rem.onclick = async () => {
      busy(rem, 'Saving…');
      try {
        await saveReminder(reminder());
        toast('Saved. Only the deadline is stored – no personal data.');
        renderReminders();
      } catch (e) {
        toast(errMsg(e));
      } finally {
        done(rem);
      }
    };
}

async function explainPrimaryDeadline() {
  const d = state.computed[0];
  const el = document.getElementById('dl-explain-0');
  if (!d || !el) return;
  el.innerHTML = '<span class="spinner"></span>';
  try {
    const wd = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });
    const r = await explainDeadline(
      { purpose: d.purpose, date: d.date, weekday: wd, daysLeft: d.daysLeft, sendBy: d.sendBy },
      langSel.value,
    );
    if (r.where === 'on_device') state.localRuns++;
    else countCloud(80);
    el.innerHTML = `${esc(r.text)} ${whereBadge(r.where)}`;
    renderFlow();
  } catch {
    el.textContent = '';
  }
}

async function renderCaseMatch() {
  const x = state.explanation!;
  const box = $('case-box');
  $('step-case').hidden = false;
  let cases: Case[] = [];
  try {
    cases = await listCases();
  } catch (e) {
    box.innerHTML = '<p class="muted">Case file not available in this browser.</p>';
    return;
  }
  state.features = features(
    state.original,
    state.redactor.all,
    x.sender,
    x.letterType,
    state.extraction?.letter_date ?? null,
  );
  const m = match(state.features, cases);
  state.match = m;
  if (m.kind === 'sure' && m.case) {
    box.innerHTML = `<p>📂 This letter belongs to your case <b>${esc(m.case.topic)} – ${esc(m.case.sender)}</b> <span class="muted">(${esc(m.reason!)})</span>.</p><div id="case-ctx"><span class="spinner"></span> Putting it in context…</div>`;
    await addLetterToCase(m.case);
  } else if (m.kind === 'suggest' && m.case) {
    box.innerHTML = `<p>📂 Is this about your case <b>${esc(m.case.topic)} – ${esc(m.case.sender)}</b>? <span class="muted">(${esc(m.reason!)})</span></p>
      <div class="row"><button class="btn btn-ink small" id="case-yes">Yes, add it</button><button class="btn btn-line small" id="case-new">No, new case</button></div><div id="case-ctx"></div>`;
    $('case-yes').onclick = () => addLetterToCase(m.case!);
    $('case-new').onclick = () => createCase();
  } else {
    box.innerHTML = `<p>Keep this letter in your case file so Readact can connect the next letter to it.</p>
      <div class="row"><button class="btn btn-ink small" id="case-new">Start a case file</button></div><div id="case-ctx"></div>`;
    $('case-new').onclick = () => createCase();
  }
}

function entryFor(): TimelineEntry {
  const x = state.explanation!;
  const date = state.extraction?.letter_date ?? new Date().toISOString().slice(0, 10);
  return { date, text: `${x.letterType} (${x.sender})${x.amount ? ` – ${x.amount}` : ''}` };
}

async function createCase() {
  const c = newCase(state.features!, entryFor(), state.redactor.all);
  c.nextDeadline = state.computed[0]
    ? { date: state.computed[0].date, label: PURPOSE_LABEL[state.computed[0].purpose] }
    : null;
  await saveCase(c);
  $('case-box').innerHTML = `<p>✅ Saved to your case file – encrypted, only on this device.</p>`;
  renderCases();
}

// The history is redacted with every secret of the case, not just this letter's.
async function addLetterToCase(c: Case) {
  const ctx = $('case-ctx');
  ctx.innerHTML = '<span class="spinner"></span> Putting it in context…';
  for (const s of c.secrets) state.redactor.add(s.value, s.kind, 'rule');
  const redacted = state.redactor.redact(state.original);
  const timeline = state.redactor.redact(timelineText(c));
  try {
    const r = await explainInCase(redacted, timeline, langSel.value, state.redactor);
    if (r.where === 'on_device') state.localRuns++;
    else countCloud(redacted.length + timeline.length);
    const k = r.data;
    k.timeline_entry = k.timeline_entry.replace(/^\s*\d{1,4}[-.]\d{1,2}[-.]\d{2,4}\s*[:–-]?\s*/, '');
    const outcome = { success: '✅', partial: '🟡', rejected: '❌', open: '⏳', not_applicable: '' }[k.outcome] ?? '';
    ctx.innerHTML = `<div class="case-ctx">
      <p><b>${outcome} ${esc(state.redactor.restore(k.explanation))}</b> ${whereBadge(r.where)}</p>
      <p>${esc(state.redactor.restore(k.what_changed))}</p>
      <ol class="timeline">${[...c.timeline, { date: entryFor().date, text: state.redactor.restore(k.timeline_entry) }]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => `<li><span class="d">${esc(fmtDate(e.date))}</span> ${esc(e.text)}</li>`)
        .join('')}</ol></div>`;
    const updated = addToCase(
      c,
      state.features!,
      { date: entryFor().date, text: state.redactor.restore(k.timeline_entry) },
      state.redactor.all,
      k.case_status,
    );
    updated.nextDeadline = state.computed[0]
      ? { date: state.computed[0].date, label: PURPOSE_LABEL[state.computed[0].purpose] }
      : c.nextDeadline;
    await saveCase(updated);
    renderCases();
    renderFlow();
  } catch (e) {
    ctx.textContent = errMsg(e);
  }
}

async function renderCases() {
  let cases: Case[] = [];
  try {
    cases = await listCases();
  } catch {
    return;
  }
  $('cases-card').hidden = cases.length === 0;
  $('cases').replaceChildren(
    ...cases.map((c) => {
      const li = document.createElement('li');
      const st = {
        open: 'Open',
        waiting_for_authority: 'Waiting for them',
        waiting_for_user: 'Your turn',
        closed: 'Closed',
      }[c.status];
      li.innerHTML = `<details><summary><b>${esc(c.topic)}</b> · ${esc(c.sender)} <span class="badge">${st}</span>
          ${c.nextDeadline ? `<span class="muted"> · next: ${esc(c.nextDeadline.label)} ${esc(fmtDate(c.nextDeadline.date))}</span>` : ''}</summary>
        <ol class="timeline">${c.timeline.map((e) => `<li><span class="d">${esc(fmtDate(e.date))}</span> ${esc(e.text)}</li>`).join('')}</ol></details>`;
      const del = document.createElement('button');
      del.className = 'btn btn-line small';
      del.textContent = 'Delete';
      del.onclick = async () => {
        if (!confirm('Delete this case file from this device? This cannot be undone.')) return;
        await deleteCase(c.id);
        renderCases();
      };
      li.append(del);
      return li;
    }),
  );
}

// Model output with real values put back in, escaped for HTML.
function show(s: unknown): string {
  return esc(state.redactor.restore(String(s ?? '')));
}

function whereBadge(w: Where): string {
  return w === 'on_device'
    ? '<span class="badge device">on device</span>'
    : '<span class="badge cloud">cloud · anonymised</span>';
}

$('expert').onclick = async () => {
  if (!state.explanation) return;
  const btn = $<HTMLButtonElement>('expert');
  const redacted = state.redactor.redact(state.original);
  const question = state.redactor.redact($<HTMLInputElement>('question').value.trim());
  busy(btn, 'Preparing your options…');
  try {
    const md = await expertHelp(redacted, state.explanation, langSel.value, question, state.redactor);
    countCloud(redacted.length + question.length);
    $('expert-out').innerHTML = markdown(md);
    $('expert-out')
      .querySelectorAll('.copy')
      .forEach((b) =>
        b.addEventListener('click', () => {
          navigator.clipboard.writeText((b.nextElementSibling as HTMLElement).innerText);
          toast('Template copied – your details are filled in. Complete the ___ parts before sending.');
        }),
      );
    renderFlow();
  } catch (e) {
    toast(errMsg(e));
  } finally {
    done(btn);
  }
};

async function renderReminders() {
  if (!isConfigured) return;
  try {
    const items = await listReminders();
    $('reminders-card').hidden = items.length === 0;
    $('reminders').replaceChildren(
      ...items.map((r) => {
        const li = document.createElement('li');
        const d = daysUntil(r.date);
        li.innerHTML = `<span class="d">${esc(fmtDate(r.date))}</span><span>${esc(r.title)}<br><small class="muted">${d < 0 ? 'overdue' : `in ${d} days`}</small></span>`;
        const del = document.createElement('button');
        del.className = 'btn btn-line small';
        del.textContent = 'Done';
        del.onclick = async () => (await deleteReminder(r.id!), renderReminders());
        li.append(del);
        return li;
      }),
    );
  } catch (e) {
    console.warn('Reminders unavailable', e);
  }
}

function countCloud(chars: number) {
  state.cloudRuns++;
  state.cloudChars += chars;
}

function renderFlow() {
  $('flow').hidden = false;
  $('flow-body').innerHTML = `<div class="flow-grid">
    <div><b>${state.redactor.all.length}</b>private items protected</div>
    <div><b>${state.localRuns}</b>AI steps on this device</div>
    <div><b>${state.cloudRuns}</b>cloud requests (${state.cloudChars.toLocaleString()} chars, anonymised)</div>
    <div class="zero"><b>0</b>personal values sent anywhere</div>
  </div>`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

// Minimal markdown: escape first, then headings, bold, lists. The reply template becomes a copyable block.
function markdown(md: string): string {
  const parts = md.split(/^##\s+/m);
  return parts
    .map((part, idx) => {
      if (idx === 0 && !md.startsWith('##')) return para(part);
      const nl = part.indexOf('\n');
      const title = nl === -1 ? part : part.slice(0, nl);
      const body = nl === -1 ? '' : part.slice(nl + 1);
      if (/template|draft|vorlage|antwort|entwurf|reply/i.test(title)) {
        const clean = body
          .replace(/^```\w*\n?|```$/gm, '')
          .replace(/^\s*-{3,}\s*$/gm, '')
          .replace(/`([^`]+)`/g, '$1')
          .trim();
        return `<h2>${esc(title)}</h2><button class="btn btn-ink small copy">Copy template</button><div class="draft">${esc(clean)}</div>`;
      }
      return `<h2>${esc(title)}</h2>${para(body)}`;
    })
    .join('');
}
function para(s: string): string {
  const inline = (t: string) =>
    esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\s)\*(.+?)\*(?=\s|$)/g, '$1<em>$2</em>');
  const lines = s
    .trim()
    .split('\n')
    .filter((l) => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l));
  let html = '';
  let inList = false;
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (m) {
      if (!inList) ((html += '<ul>'), (inList = true));
      html += `<li>${inline(m[1])}</li>`;
    } else {
      if (inList) ((html += '</ul>'), (inList = false));
      if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
  }
  return html + (inList ? '</ul>' : '');
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(+d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function busy(btn: HTMLButtonElement, label: string) {
  btn.dataset.label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${esc(label)}`;
}
function done(btn: HTMLButtonElement) {
  btn.disabled = btn.id === 'explain' ? !confirmBox.checked : false;
  if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 4500);
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/app.?check|attestation/i.test(m)) {
    const detail = m.match(/\(appCheck\/[\w-]+\)|HTTP status: \d+|attestation failed|not registered/i)?.[0] ?? '';
    return location.hostname === 'localhost'
      ? `App Check failed ${detail} – register your debug token in the Firebase console (see README).`
      : `Security check (App Check) failed ${detail}. Please reload the page and try again.`;
  }
  return m.replace(/^\[?FirebaseError\]?:?\s*/i, '');
}
