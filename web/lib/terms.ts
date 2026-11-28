import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** TERMS.md from the repository root: the same text the desktop app and installers show. */
export function readTerms(): { version: string; markdown: string } {
  const markdown = readFileSync(path.join(process.cwd(), '..', 'TERMS.md'), 'utf8');
  return { version: markdown.match(/^Version:\s*(\S+)/m)?.[1] ?? '', markdown };
}
