import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { fetchUrl, type FetchResult } from './util';

export interface Page {
  url: string;
  finalUrl: string;
  res: FetchResult;
  $: CheerioAPI;
  html: string;
  headers: Record<string, string>;
}

export async function loadPage(url: string): Promise<Page> {
  const res = await fetchUrl(url, { timeout: 20000 });
  if (res.status === 0) throw new Error(`Could not reach ${url}: ${res.error}`);
  return { url, finalUrl: res.finalUrl, res, $: cheerio.load(res.body), html: res.body, headers: res.headers };
}

export function clean(s: string | undefined | null): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}
