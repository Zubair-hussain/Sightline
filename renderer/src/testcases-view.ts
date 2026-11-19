/* Launch-day test case checklist: filter, update status and notes, export. */
import { h, icon, clear } from './dom.js';
import { t, type Key } from './i18n.js';

type Edits = Record<string, { status?: SL.TestStatus; notes?: string }>;

const STATUS_KEYS: Record<SL.TestStatus, Key> = { pass: 'tc.pass', fail: 'tc.fail', blocked: 'tc.blocked', 'not-run': 'tc.todo' };
const STATUS_ICON: Record<SL.TestStatus, string> = { pass: 'pass', fail: 'fail', blocked: 'warn', 'not-run': 'info' };

function storageKey(r: SL.Report): string { return `sl.tc.${r.finalUrl}|${r.startedAt}`; }
function loadEdits(r: SL.Report): Edits {
  try { return JSON.parse(localStorage.getItem(storageKey(r)) || '{}') as Edits; } catch { return {}; }
}
function saveEdits(r: SL.Report, e: Edits): void {
  try { localStorage.setItem(storageKey(r), JSON.stringify(e)); } catch { /* storage unavailable */ }
}

/** Test cases with the user's status/notes applied. */
export function mergedCases(r: SL.Report): SL.TestCase[] {
  const e = loadEdits(r);
  return (r.testCases ?? []).map((c) => ({ ...c, status: e[c.id]?.status ?? c.status, notes: e[c.id]?.notes ?? c.notes }));
}

export function renderTestCases(report: SL.Report, api: SL.Bridge): HTMLElement {
  const edits = loadEdits(report);
  let priority: 'all' | SL.TestPriority = 'all';
  let kind: 'all' | 'automated' | 'manual' = 'all';
  const counts = h('p', { class: 'caption muted', 'aria-live': 'polite' });
  const list = h('ul', { class: 'checks tc-list' });

  const updateCounts = () => {
    const cs = mergedCases(report);
    const n = (s: SL.TestStatus) => cs.filter((c) => c.status === s).length;
    counts.textContent = `${cs.length} · ${n('pass')} ${t('tc.pass')} · ${n('fail')} ${t('tc.fail')} · ${n('blocked')} ${t('tc.blocked')} · ${n('not-run')} ${t('tc.todo')}`;
  };

  const draw = () => {
    clear(list);
    const rows = mergedCases(report).filter((c) => (priority === 'all' || c.priority === priority) && (kind === 'all' || c.type === kind));
    for (const c of rows) {
      const statusSel = h('select', { class: `tc-status st-${c.status}`, 'aria-label': `Status of ${c.id}` },
        (Object.keys(STATUS_KEYS) as SL.TestStatus[]).map((s) => h('option', { value: s }, t(STATUS_KEYS[s])))) as HTMLSelectElement;
      statusSel.value = c.status;
      const ic = icon(STATUS_ICON[c.status], `status-icon ${STATUS_ICON[c.status]}`);
      statusSel.addEventListener('change', () => {
        edits[c.id] = { ...edits[c.id], status: statusSel.value as SL.TestStatus };
        saveEdits(report, edits);
        statusSel.className = `tc-status st-${statusSel.value}`;
        const s = statusSel.value as SL.TestStatus;
        ic.setAttribute('class', `status-icon ${STATUS_ICON[s]}`);
        ic.innerHTML = icon(STATUS_ICON[s]).innerHTML;
        updateCounts();
      });
      const notes = h('textarea', { class: 'tc-notes', rows: 2, placeholder: t('tc.notes'), 'aria-label': `${t('tc.notes')} ${c.id}` }, c.notes) as HTMLTextAreaElement;
      notes.addEventListener('input', () => { edits[c.id] = { ...edits[c.id], notes: notes.value }; saveEdits(report, edits); });

      const body = h('div', { class: 'body', hidden: true },
        c.preconditions ? h('p', {}, h('strong', {}, `${t('tc.pre')}: `), c.preconditions) : null,
        h('p', { class: 'tc-h' }, t('tc.steps')),
        h('ol', { class: 'tc-steps' }, c.steps.map((s) => h('li', {}, s))),
        h('div', { class: 'fix' }, h('strong', {}, t('tc.expected')), c.expected),
        c.evidence ? h('p', { class: 'tc-evidence' }, h('strong', {}, `${t('tc.evidence')}: `), c.evidence) : null,
        notes,
      );
      const head = h('button', { type: 'button', 'aria-expanded': 'false' },
        ic,
        h('div', {},
          h('div', { class: 'title' }, h('span', { class: 'tc-id' }, c.id), ' ', c.title),
          h('div', { class: 'detail' },
            h('span', { class: `tc-pill p-${c.priority}` }, c.priority), ' ',
            h('span', { class: 'tc-pill' }, t(c.type === 'automated' ? 'tc.automated' : 'tc.manual')), ' ', c.area)),
        icon('chevron', 'chev'),
      );
      head.addEventListener('click', () => { body.hidden = !body.hidden; head.setAttribute('aria-expanded', String(!body.hidden)); });
      list.append(h('li', { class: 'check tc' }, h('div', { class: 'tc-row' }, head, statusSel), body));
    }
    if (!rows.length) list.append(h('li', { class: 'empty-filter' }, '—'));
  };

  const seg = <T extends string>(options: [T, string][], get: () => T, set: (v: T) => void) => {
    const g = h('div', { class: 'segmented', role: 'group' });
    for (const [v, label] of options) {
      const b = h('button', { type: 'button', 'aria-pressed': String(get() === v) }, label);
      b.addEventListener('click', () => { set(v); g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
      g.append(b);
    }
    return g;
  };

  const exportBtn = (format: SL.TestCaseFormat, label: Key, primary = false) => {
    const b = h('button', { class: `btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-small`, type: 'button' }, t(label));
    b.addEventListener('click', async () => {
      b.setAttribute('disabled', '');
      try { await api.exportTestCases(report, mergedCases(report), format); } finally { b.removeAttribute('disabled'); }
    });
    return b;
  };

  updateCounts();
  draw();
  return h('section', { class: 'tile tile-parchment', id: 'test-cases' },
    h('div', { class: 'inner' },
      h('div', { class: 'section-head' },
        h('div', { style: 'text-align:start' },
          h('h2', { class: 'display-lg' }, t('tc.title')),
          h('p', { class: 'caption muted', style: 'margin:6px 0 0;max-width:620px' }, t('tc.lead')),
          counts),
        h('div', { class: 'tc-exports' }, exportBtn('csv', 'tc.csv', true), exportBtn('md', 'tc.md'), exportBtn('playwright', 'tc.pw')),
      ),
      h('div', { class: 'tc-filters' },
        seg<'all' | SL.TestPriority>([['all', t('filter.all')], ['P0', 'P0'], ['P1', 'P1'], ['P2', 'P2']], () => priority, (v) => { priority = v; }),
        seg<'all' | 'automated' | 'manual'>([['all', t('filter.all')], ['automated', t('tc.automated')], ['manual', t('tc.manual')]], () => kind, (v) => { kind = v; }),
      ),
      list,
    ),
  );
}
