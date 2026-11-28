/**
 * Terms of use (accepted once per terms version), the "new version available" pop-up and the
 * What's new / Terms pages. The desktop app only: on the website, /terms covers the terms and the
 * web app is always the latest version.
 */
import { h, clear } from './dom.js';
import { t, tf } from './i18n.js';
import { markdown } from './markdown.js';

type Api = SL.Bridge;

/** Shows the terms until the user accepts the current version; declining quits the app. */
export async function ensureTermsAccepted(api: Api, settings: SL.Settings): Promise<SL.Settings> {
  const terms = await api.terms().catch(() => ({ version: '', markdown: '' }));
  if (!terms.version || settings.termsAccepted === terms.version) return settings;
  return new Promise((resolve) => {
    const check = h('input', { type: 'checkbox', id: 'terms-agree' }) as HTMLInputElement;
    const accept = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, t('terms.accept'));
    const decline = h('button', { class: 'btn btn-secondary', type: 'button' }, t('terms.decline'));
    check.addEventListener('change', () => { if (check.checked) accept.removeAttribute('disabled'); else accept.setAttribute('disabled', ''); });
    const dlg = h('dialog', { class: 'consent terms-dialog', 'aria-labelledby': 'terms-title' },
      h('h2', { id: 'terms-title', class: 'tagline' }, t('terms.title')),
      h('p', { class: 'caption muted' }, t('terms.lead')),
      h('div', { class: 'terms-box', tabindex: '0' }, markdown(terms.markdown, { skipTitle: true })),
      h('p', { class: 'fine muted' }, t('terms.english')),
      h('label', { class: 'consent-check', for: 'terms-agree' }, check, t('terms.check')),
      h('div', { class: 'consent-actions' }, decline, accept),
    ) as HTMLDialogElement;
    // Escape must not skip the terms.
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    accept.addEventListener('click', async () => {
      const next = await api.setSettings({ termsAccepted: terms.version });
      dlg.close(); dlg.remove();
      resolve(next);
    });
    decline.addEventListener('click', () => { void api.quit(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

function notesFor(info: SL.UpdateInfo): HTMLElement {
  return markdown(info.notes || '—');
}

/** Pop-up when a newer release exists and the user has not skipped it. */
export async function maybeShowUpdate(api: Api, settings: SL.Settings): Promise<void> {
  const info = await api.checkUpdates(false).catch(() => null);
  if (!info?.available || !info.latest || settings.dismissedUpdate === info.latest) return;
  const v = info.latest;
  const download = h('button', { class: 'btn btn-primary', type: 'button' }, tf('whatsnew.download', { v }));
  const later = h('button', { class: 'btn btn-secondary', type: 'button' }, t('whatsnew.later'));
  const skip = h('button', { class: 'btn btn-link', type: 'button' }, t('whatsnew.skip'));
  const dlg = h('dialog', { class: 'consent update-dialog', 'aria-labelledby': 'update-title' },
    h('h2', { id: 'update-title', class: 'tagline' }, tf('whatsnew.available', { v })),
    h('p', { class: 'caption muted' }, t('update.lead')),
    h('div', { class: 'terms-box' }, notesFor(info)),
    h('div', { class: 'consent-actions' }, skip, later, download),
  ) as HTMLDialogElement;
  const close = () => { dlg.close(); dlg.remove(); };
  download.addEventListener('click', () => { void api.openExternal(info.downloadUrl); close(); });
  later.addEventListener('click', close);
  skip.addEventListener('click', () => { void api.setSettings({ dismissedUpdate: v }); close(); });
  dlg.addEventListener('cancel', close);
  document.body.append(dlg);
  dlg.showModal();
}

/** The What's new tab: this version, an update check and the full changelog. */
export function whatsNewView(api: Api, appInfo: SL.AppInfo): HTMLElement {
  const status = h('div', { class: 'update-status', role: 'status' });
  const checkBtn = h('button', { class: 'btn btn-secondary btn-small', type: 'button' }, t('whatsnew.check'));
  const changelog = h('div', { class: 'card changelog' });

  const show = (info: SL.UpdateInfo | null) => {
    clear(status);
    if (!info || info.error) { status.append(h('p', { class: 'caption muted' }, t('whatsnew.error'))); return; }
    if (!info.available || !info.latest) { status.append(h('p', { class: 'caption' }, t('whatsnew.upToDate'))); return; }
    status.append(
      h('p', { class: 'tagline' }, tf('whatsnew.available', { v: info.latest })),
      h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: () => void api.openExternal(info.downloadUrl) }, tf('whatsnew.download', { v: info.latest })),
      h('h3', {}, tf('whatsnew.latestNotes', { v: info.latest })),
      notesFor(info),
    );
  };
  const run = async (force: boolean) => {
    checkBtn.setAttribute('disabled', '');
    checkBtn.textContent = t('whatsnew.checking');
    show(await api.checkUpdates(force).catch(() => null));
    checkBtn.removeAttribute('disabled');
    checkBtn.textContent = t('whatsnew.check');
  };
  checkBtn.addEventListener('click', () => void run(true));
  if (!appInfo.web) void run(false);
  void api.changelog().then((md) => { if (md) changelog.append(markdown(md, { skipTitle: true })); });

  return h('section', { class: 'tile tile-parchment', style: 'min-height:70vh' },
    h('div', { class: 'inner whatsnew', style: 'max-width:820px;text-align:start' },
      h('h1', { class: 'hero-display', style: 'margin-bottom:12px' }, t('whatsnew.title')),
      h('p', { class: 'lead' }, tf('whatsnew.current', { v: appInfo.version })),
      appInfo.web ? null : h('div', { class: 'card update-card' }, status, checkBtn),
      h('h2', { class: 'display-sm', style: 'margin:40px 0 16px' }, t('whatsnew.history')),
      changelog,
      h('p', { class: 'caption', style: 'margin-top:16px' }, h('a', { href: 'https://github.com/Zubair-hussain/Sightline/releases', target: '_blank', rel: 'noopener noreferrer' }, t('whatsnew.allReleases'))),
    ),
  );
}

/** The Terms page (always reachable from the footer). */
export function termsView(api: Api): HTMLElement {
  const box = h('div', { class: 'card terms-page' });
  void api.terms().then((terms) => { if (terms.markdown) box.append(markdown(terms.markdown, { skipTitle: true })); });
  return h('section', { class: 'tile tile-parchment', style: 'min-height:70vh' },
    h('div', { class: 'inner', style: 'max-width:820px;text-align:start' },
      h('h1', { class: 'hero-display', style: 'margin-bottom:12px' }, t('terms.title')),
      h('p', { class: 'fine muted' }, t('terms.english')),
      box,
    ),
  );
}
