/**
 * Free external tool connectors (module I).
 * No paid LLMs involved — every tool below has a free tier or no key at all.
 * Tool results are injected into the LLM prompt as structured content.
 */
import type { ToolResult } from '../services/types.js';

const UA = 'jarvis-agent/0.1 (personal assistant; on-device)';

/** Open-Meteo: free, no API key, unlimited. */
export async function weather(city = 'auto', lat?: number, lon?: number): Promise<ToolResult> {
  const coords =
    lat && lon
      ? { lat, lon }
      : await geocodeCity(city);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`weather: HTTP ${res.status}`);
  const data = await res.json();
  const cw = data.current_weather;
  return {
    name: 'weather',
    content: `${city}: ${cw.temperature}°C, wind ${cw.windspeed} km/h (${cw.weathercode}); today ${data.daily.temperature_2m_max[0]}°C / ${data.daily.temperature_2m_min[0]}°C`,
    sourceUrl: url,
  };
}

async function geocodeCity(city: string): Promise<{ lat: number; lon: number }> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`geocode: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) return { lat: 28.6139, lon: 77.2090 }; // sensible default
  return { lat: data.results[0].latitude, lon: data.results[0].longitude };
}

/** Wikipedia REST: free, no key. */
export async function wikipedia(term: string): Promise<ToolResult> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`, { headers: { 'User-Agent': UA } });
  if (res.status === 404) return { name: 'wikipedia', content: `No Wikipedia summary for "${term}".` };
  if (!res.ok) throw new Error(`wikipedia: HTTP ${res.status}`);
  const data = await res.json();
  return { name: 'wikipedia', content: data.extract ?? data.title ?? '', sourceUrl: data.content_urls?.desktop?.page };
}

/** NewsAPI.org dev tier: 100 req/day, key required. Returns '' when no key set. */
export async function news(query = '', apiKey?: string): Promise<ToolResult> {
  if (!apiKey) return { name: 'news', content: 'News tool: no NewsAPI key configured. Key is optional (free dev tier, 100 req/day).' };
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query || 'technology')}&pageSize=5&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`news: HTTP ${res.status}`);
  const data = await res.json();
  const items = (data.articles ?? []).slice(0, 5).map((a: any) => `• ${a.title} (${a.source?.name})`);
  return { name: 'news', content: items.join('\n') || 'No articles found.', sourceUrl: 'newsapi.org' };
}

/** OpenStreetMap Nominatim: free, requires a descriptive User-Agent. */
export async function searchPlaces(query: string): Promise<ToolResult> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`nominatim: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.length) return { name: 'places', content: `No places found for "${query}".` };
  const items = data.map((p: any) => `${p.display_name} (${p.lat},${p.lon})`);
  return { name: 'places', content: items.join('\n'), sourceUrl: 'https://nominatim.openstreetmap.org' };
}

/** DuckDuckGo Instant Answers — web search, no key required. */
export async function webSearch(query: string): Promise<ToolResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`ddg: HTTP ${res.status}`);
  const data = await res.json();
  const abstract = data.AbstractText ?? '';
  const related = (data.RelatedTopics ?? [])
    .slice(0, 3)
    .map((t: any) => `• ${t.Text}`)
    .join('\n');
  const content = [abstract, related].filter(Boolean).join('\n') || `No instant answer for "${query}".`;
  return { name: 'web_search', content, sourceUrl: data.AbstractURL || url };
}

/** Open Library — book search, no key required. */
export async function searchBooks(query: string): Promise<ToolResult> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`openlibrary: HTTP ${res.status}`);
  const data = await res.json();
  const docs = (data.docs ?? []).slice(0, 3);
  if (!docs.length) return { name: 'books', content: `No books found for "${query}".` };
  const items = docs.map((b: any) => `• ${b.title}${b.author_name ? ' — ' + b.author_name.join(', ') : ''}`);
  return { name: 'books', content: items.join('\n'), sourceUrl: 'https://openlibrary.org' };
}

/** IP Geolocation (ip-api.com) — location detection, no key required. */
export async function geolocate(ip = ''): Promise<ToolResult> {
  const url = `https://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,query`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`ipapi: HTTP ${res.status}`);
  const d = await res.json();
  if (d.status !== 'success') return { name: 'geolocation', content: 'Geolocation unavailable.' };
  return {
    name: 'geolocation',
    content: `${d.city}, ${d.regionName}, ${d.country} (${d.lat}, ${d.lon}) [${d.query}]`,
    sourceUrl: 'https://ip-api.com',
  };
}

/** Random Quotes (quotable.io) — motivational/fun quotes, no key required. */
export async function randomQuote(): Promise<ToolResult> {
  const url = 'https://api.quotable.io/random';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`quotable: HTTP ${res.status}`);
  const d = await res.json();
  return { name: 'quote', content: `"${d.content}" — ${d.author}`, sourceUrl: 'https://quotable.io' };
}

/** Dictionary (Free Dictionary API) — word definitions, no key required. */
export async function define(word: string): Promise<ToolResult> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 404) return { name: 'dictionary', content: `No definition found for "${word}".` };
  if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
  const d = await res.json();
  const entry = Array.isArray(d) ? d[0] : d;
  const meanings = (entry.meanings ?? [])
    .slice(0, 2)
    .map((m: any) => `${m.partOfSpeech}: ${(m.definitions?.[0]?.definition) ?? ''}`)
    .join('\n');
  return { name: 'dictionary', content: meanings || `No definition found for "${word}".`, sourceUrl: url };
}

/** Registry so the brain can route tool calls by name. */
export const freeTools: Record<string, (...a: any[]) => Promise<ToolResult>> = {
  weather,
  wikipedia,
  news,
  searchPlaces,
  webSearch,
  searchBooks,
  geolocate,
  randomQuote,
  define,
};
