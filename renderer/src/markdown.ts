/**
 * Tiny Markdown renderer for release notes, the changelog and the terms. It builds DOM nodes with
 * text only (no innerHTML), so text from GitHub release notes can never inject HTML or scripts.
 * Supports headings, bullet lists, paragraphs, **bold**, `code` and links (http/https only).
 */
import { h } from './dom.js';

function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+[^\s).,;:!?])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('strong', {}, m[1]));
    else if (m[2]) out.push(h('code', {}, m[2]));
    else {
      const url = m[4] ?? m[5];
      out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, m[3] ?? url));
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function markdown(md: string, opts: { skipTitle?: boolean } = {}): HTMLElement {
  const root = h('div', { class: 'md' });
  let list: HTMLUListElement | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) { root.append(h('p', {}, ...inline(para.join(' ')))); para = []; }
    list = null;
  };
  let first = true;
  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      flush();
      if (first && opts.skipTitle && heading[1].length === 1) { first = false; continue; }
      const level = Math.min(4, heading[1].length + 1) as 2 | 3 | 4;
      root.append(h(`h${level}` as 'h2', {}, ...inline(heading[2])));
    } else if (bullet) {
      if (para.length) { root.append(h('p', {}, ...inline(para.join(' ')))); para = []; }
      if (!list) { list = h('ul', {}); root.append(list); }
      list.append(h('li', {}, ...inline(bullet[1])));
    } else if (!line.trim()) {
      flush();
    } else {
      list = null;
      para.push(line.trim());
    }
    if (line.trim()) first = false;
  }
  flush();
  return root;
}
