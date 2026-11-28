import type { ReactNode } from 'react';

/**
 * Renders the small Markdown subset used by TERMS.md (headings, bullet lists, paragraphs, **bold**
 * and links) as React elements. Text is never inserted as HTML.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|(https?:\/\/[^\s)]+[^\s).,;:!?])/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}-${i++}`}>{m[1]}</strong>);
    else out.push(<a key={`${key}-${i++}`} href={m[2]}>{m[2].replace(/^https:\/\//, '')}</a>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, skipTitle = false }: { source: string; skipTitle?: boolean }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let n = 0;
  const flush = () => {
    if (para.length) { blocks.push(<p key={n++}>{inline(para.join(' '), `p${n}`)}</p>); para = []; }
    if (list.length) { const items = list; blocks.push(<ul key={n++}>{items.map((li, j) => <li key={j}>{inline(li, `l${n}-${j}`)}</li>)}</ul>); list = []; }
  };
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (heading) {
      flush();
      if (heading[1].length === 1) { if (!skipTitle) blocks.push(<h1 key={n++}>{heading[2]}</h1>); continue; }
      blocks.push(heading[1].length === 2 ? <h2 key={n++}>{heading[2]}</h2> : <h3 key={n++}>{heading[2]}</h3>);
    } else if (bullet) {
      if (para.length) { blocks.push(<p key={n++}>{inline(para.join(' '), `p${n}`)}</p>); para = []; }
      list.push(bullet[1]);
    } else if (!line.trim()) flush();
    else { if (list.length) flush(); para.push(line.trim()); }
  }
  flush();
  return <>{blocks}</>;
}
