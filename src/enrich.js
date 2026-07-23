// Runtime enrichment from Wikipedia's public REST APIs (CORS-enabled, no key):
// - per-location summaries + thumbnails for the post-game overview
// - "on this day in history" events for the end screen
// Everything degrades gracefully offline: callers hide the sections on failure.

const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_ONTHISDAY = 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/';

const summaryCache = new Map();
let onThisDayCache = null;

// Derive a likely Wikipedia article title from a location's display name.
//   "Eiffel Tower, Paris"          -> "Eiffel Tower"
//   "Kyoto — Fushimi Inari Shrine" -> "Fushimi Inari Shrine"
//   "Great Wall of China (Badaling)" -> "Great Wall of China"
//   "Sahara — Erg Chebbi, Morocco" -> "Erg Chebbi"
export function wikiTitleForLocation(name) {
  let t = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // strip parentheticals
  const dash = t.split('—');
  if (dash.length > 1) t = dash[dash.length - 1].trim(); // landmark after the em dash
  const comma = t.split(',');
  t = comma[0].trim(); // place before the comma
  return t;
}

export async function fetchWikiSummary(locationName) {
  const title = wikiTitleForLocation(locationName);
  if (summaryCache.has(title)) return summaryCache.get(title);
  let result = null;
  try {
    const res = await fetch(WIKI_SUMMARY + encodeURIComponent(title), {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const j = await res.json();
      if (j.type === 'standard' && j.extract) {
        result = {
          title: j.title,
          extract: j.extract,
          thumbnail: j.thumbnail ? j.thumbnail.source : null,
          url: j.content_urls && j.content_urls.desktop ? j.content_urls.desktop.page : null,
        };
      }
    }
  } catch { /* offline or blocked - caller hides the section */ }
  summaryCache.set(title, result);
  return result;
}

// Up to `limit` curated events for today's date, newest first.
export async function fetchOnThisDay(limit = 3) {
  if (onThisDayCache) return onThisDayCache;
  try {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const res = await fetch(`${WIKI_ONTHISDAY}${mm}/${dd}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const j = await res.json();
    // Keep the tone fun: skip violent/tragic events; prefer discovery, firsts, culture.
    const grim = /\b(kill|murder|bomb|massacre|assassinat|terror|war crime|execut|genocide|shot|shooting|died|death|crash|disaster|hostage|attack|invasion|serial)\w*/i;
    const upbeat = /\b(first|record|discover|launch|land|found|open|premiere|debut|invent|patent|complete|circumnavigat|summit|flight|olympic|championship|crowned|independence)\w*/i;
    const all = (j.selected || []).filter((e) => e.year && e.text);
    const nice = all.filter((e) => !grim.test(e.text));
    const preferred = nice.filter((e) => upbeat.test(e.text));
    const pool = (preferred.length >= limit ? preferred : nice.length ? nice : all);
    const events = pool
      .sort((a, b) => b.year - a.year)
      .slice(0, limit)
      .map((e) => {
        const page = (e.pages && e.pages[0]) || null;
        return {
          year: e.year,
          text: e.text,
          thumbnail: page && page.thumbnail ? page.thumbnail.source : null,
          url: page && page.content_urls && page.content_urls.desktop ? page.content_urls.desktop.page : null,
          // The feed ships each linked page's lead extract - enough for a story card.
          extract: page && page.extract ? page.extract : null,
          pageTitle: page ? (page.titles && page.titles.normalized) || page.title : null,
        };
      });
    onThisDayCache = events.length ? events : null;
    return onThisDayCache;
  } catch {
    return null;
  }
}
