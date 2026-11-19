/* Safety confirmation shown before the memory test interacts with a website. */
import { h, icon } from './dom.js';
import { t, tf } from './i18n.js';

const RISKY = /buy|purchase|pay|checkout|order|delete|remove|destroy|cancel|unsubscribe|logout|log-out|signout|sign-out|submit|send|confirm|book|reserve|donate|transfer|admin|password|card/i;

export function describeStep(s: SL.ScenarioStep): string {
  switch (s.action) {
    case 'click': return `Click ${s.selector || '(no selector)'}`;
    case 'navigate': return `Go to ${s.value || '/'} (inside the app)`;
    case 'back': return 'Go back';
    case 'type': return `Type "${s.value ?? ''}" into ${s.selector || '(no selector)'} — never submitted`;
    case 'press': return `Press ${s.value || 'Escape'}`;
    case 'scroll': return `Scroll to ${s.value || 'top'}`;
    case 'wait': return `Wait ${s.value || 500} ms`;
  }
}

/** Why a step might be risky, or null when it looks safe. */
export function stepRisk(s: SL.ScenarioStep): string | null {
  const text = `${s.selector ?? ''} ${s.value ?? ''}`;
  if (s.action === 'type' && /pass|card|cvv|iban|ssn/i.test(text)) return 'looks like it types into a password or payment field — never use real credentials';
  if ((s.action === 'click' || s.action === 'navigate') && RISKY.test(text)) return 'its name suggests a real action (buy, delete, submit, log out…)';
  if (s.action === 'press' && /enter/i.test(s.value ?? '')) return 'Enter can submit forms (Sightline blocks Enter inside forms)';
  return null;
}

export function memoryPlan(settings: SL.Settings): string[] {
  const sc = settings.memoryScenario;
  const custom = sc.mode === 'custom' ? sc.steps : [];
  const auto = custom.length === 0 || sc.includeAuto;
  const n = settings.memoryIterations;
  const plan = ['Open the page in a private, hidden browser window on your computer.'];
  if (auto) {
    plan.push(`Repeat ${n} times: scroll to the bottom and back, resize the window, open and close up to 4 menus or accordions, press Escape.`);
    plan.push('If the site switches pages without reloading, visit up to 3 of its own pages and come back each round (logout, delete, cart and checkout links are skipped).');
  }
  if (custom.length) plan.push(`Repeat ${n} times — your steps: ${custom.map(describeStep).join(' → ')}.`);
  plan.push('Measure memory after every round. Nothing is saved on the website.');
  return plan;
}

export function confirmMemoryTest(host: string, settings: SL.Settings): Promise<'run' | 'skip' | 'cancel'> {
  return new Promise((resolve) => {
    const sc = settings.memoryScenario;
    const custom = sc.mode === 'custom' ? sc.steps : [];
    const risky = custom.map((s) => [s, stepRisk(s)] as const).filter(([, r]) => r);
    const pageViews = 1 + settings.memoryIterations * (custom.length ? custom.filter((s) => s.action === 'navigate').length + 1 : 3);

    const check = h('input', { type: 'checkbox', id: 'consent-own' }) as HTMLInputElement;
    const run = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, 'data-consent-run': '' }, t('consent.run'));
    const skip = h('button', { class: 'btn btn-secondary', type: 'button' }, t('consent.skip'));
    const close = h('button', { class: 'dialog-close', type: 'button', 'aria-label': 'Close' }, '×');
    check.addEventListener('change', () => { if (check.checked) run.removeAttribute('disabled'); else run.setAttribute('disabled', ''); });

    const dlg = h('dialog', { class: 'consent', 'aria-labelledby': 'consent-title' },
      close,
      h('div', { class: 'consent-icon' }, icon('memory')),
      h('h2', { id: 'consent-title', class: 'tagline' }, tf('consent.title', { host })),
      h('p', { class: 'caption muted' }, t('consent.lead')),
      h('div', { class: 'consent-cols' },
        h('div', {}, h('h3', {}, t('consent.will')), h('ul', {}, memoryPlan(settings).map((p) => h('li', {}, p)))),
        h('div', {}, h('h3', {}, t('consent.wont')), h('ul', { class: 'wont' },
          (['consent.wont1', 'consent.wont2', 'consent.wont3', 'consent.wont4'] as const).map((k) => h('li', {}, t(k))))),
      ),
      risky.length ? h('div', { class: 'consent-risk', role: 'alert' },
        h('strong', {}, icon('warn', 'status-icon warn'), t('consent.risky')),
        h('ul', {}, risky.map(([s, r]) => h('li', {}, `${describeStep(s)} — ${r}`))),
      ) : null,
      h('p', { class: 'caption muted' }, tf('consent.traffic', { n: pageViews })),
      h('label', { class: 'consent-check', for: 'consent-own' }, check, t('consent.check')),
      h('div', { class: 'consent-actions' }, skip, run),
    ) as HTMLDialogElement;

    const done = (v: 'run' | 'skip' | 'cancel') => { dlg.close(); dlg.remove(); resolve(v); };
    run.addEventListener('click', () => done('run'));
    skip.addEventListener('click', () => done('skip'));
    close.addEventListener('click', () => done('cancel'));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done('cancel'); });
    document.body.append(dlg);
    dlg.showModal();
    check.focus();
  });
}
