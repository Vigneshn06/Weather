import { COUNTRIES, type Country } from "./countries";

export type Phase = "night" | "sunrise" | "day" | "sunset";
const PHASE_INFO: Record<Phase, [string, string]> = {
  night: ["🌙", "Night"], sunrise: ["🌅", "Sunrise"], day: ["☀️", "Day"], sunset: ["🌇", "Sunset"],
};

const rad = Math.PI / 180;
/** Solar altitude (deg) and whether the sun is before local solar noon. NOAA-style approximation (~0.1° accuracy). */
export function sunState(lat: number, lon: number, date: Date) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 4e-7 * n) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / rad;
  let H = ((280.46061837 + 360.98564736629 * n + lon - ra) % 360 + 540) % 360 - 180;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H * rad)) / rad;
  return { alt, rising: H < 0 };
}
export function phaseOf(lat: number, lon: number, d: Date): Phase {
  const { alt, rising } = sunState(lat, lon, d);
  if (alt > 8) return "day";
  if (alt >= -4) return rising ? "sunrise" : "sunset";
  return "night";
}

const KEY = "clocks3", FMT = "clock24";
const DEFAULTS = ["IN", "CA", "CA-AB", "US"];
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function initClocks() {
  const pinnedEl = document.getElementById("clocks")!;
  const allEl = document.getElementById("allclocks")!;
  const allWrap = document.getElementById("allwrap")!;
  const search = document.getElementById("csearch") as HTMLInputElement;
  const fmtBtn = document.getElementById("fmt")!;
  const allBtn = document.getElementById("showall")!;

  let custom: Record<string, Country> = {};
  try { custom = JSON.parse(localStorage.getItem("customclocks") ?? "{}"); } catch { custom = {}; }
  let ids: string[] = [];
  try { ids = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? DEFAULTS; } catch { ids = DEFAULTS; }
  ids = ids.filter(i => COUNTRIES.some(c => c.code === i) || i in custom);
  if (!ids.length) ids = [...DEFAULTS];
  let mode: "country" | "city" = "country";
  let cityResults: Country[] = [];
  let h24 = localStorage.getItem(FMT) === "1";
  const persist = () => {
    localStorage.setItem(KEY, JSON.stringify(ids));
    localStorage.setItem("customclocks", JSON.stringify(Object.fromEntries(ids.filter(i => i in custom).map(i => [i, custom[i]]))));
  };
  const byCode = (c: string) => COUNTRIES.find(x => x.code === c) ?? custom[c];

  const card = (c: Country, pinned: boolean) => `
    <div class="clock" data-code="${c.code}" data-tz="${c.tz}" data-lat="${c.lat}" data-lon="${c.lon}">
      <button class="cx" data-pin="${c.code}" aria-label="${pinned ? "Unpin" : "Pin"} ${esc(c.name)}" title="${pinned ? "Unpin" : "Pin to top"}">${pinned ? "×" : ids.includes(c.code) ? "★" : "☆"}</button>
      <span class="cf">${c.flag}</span><b>${esc(c.name)}</b>
      <span class="ct"></span><small class="cd"></small>
      <div class="cbar"><i></i></div>
    </div>`;

  const bind = (root: HTMLElement) => root.querySelectorAll<HTMLButtonElement>("[data-pin]").forEach(b => b.onclick = () => {
    const code = b.dataset.pin!;
    const found = cityResults.find(c => c.code === code);
    if (found) custom[code] = found;
    ids = ids.includes(code) ? ids.filter(i => i !== code) : [...ids, code];
    persist(); renderPinned(); if (!allWrap.hidden) renderAll();
  });
  const renderPinned = () => {
    pinnedEl.innerHTML = ids.map(i => card(byCode(i), true)).join("") || `<p class="hint">No pinned clocks. Open "All countries" and tap ☆.</p>`;
    bind(pinnedEl); tick();
  };
  let timer = 0;
  const renderAll = () => {
    const q = search.value.trim().toLowerCase();
    if (mode === "city") {
      allEl.innerHTML = cityResults.map(c => card(c, false)).join("") || `<p class="hint">${q.length < 2 ? "Type a city or region, e.g. Mumbai, Chennai, Edmonton." : "No place found."}</p>`;
    } else {
      const list = COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
      allEl.innerHTML = list.map(c => card(c, false)).join("") || `<p class="hint">No country found.</p>`;
    }
    bind(allEl); tick();
  };
  const searchCities = async () => {
    const q = search.value.trim();
    if (q.length < 2) { cityResults = []; renderAll(); return; }
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=12&language=en`);
      const j = await r.json();
      cityResults = ((j.results ?? []) as any[]).filter(x => x.timezone).map(x => ({
        code: `c:${x.latitude.toFixed(2)},${x.longitude.toFixed(2)}`,
        name: [x.name, x.admin1, x.country].filter(Boolean).join(", "),
        flag: x.country_code ? String.fromCodePoint(...[...String(x.country_code).toUpperCase()].map((ch: string) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : "🌐",
        tz: x.timezone, lat: x.latitude, lon: x.longitude,
      }));
    } catch { cityResults = []; }
    renderAll();
  };
  document.querySelectorAll<HTMLButtonElement>("#cmode button").forEach(b => b.onclick = () => {
    mode = b.dataset.m as "country" | "city";
    document.querySelectorAll("#cmode button").forEach(x => x.classList.toggle("on", x === b));
    search.placeholder = mode === "city" ? "Search city / region (Mumbai, Chennai…)" : "Search country…";
    search.value = ""; cityResults = []; renderAll();
  });

  const tick = () => {
    const now = new Date();
    const mins = (tz: string) => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
      return +p.find(x => x.type === "hour")!.value * 60 + +p.find(x => x.type === "minute")!.value;
    };
    document.querySelectorAll<HTMLElement>(".clock").forEach(el => {
      const tz = el.dataset.tz!;
      const time = new Intl.DateTimeFormat([], { timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: !h24, hourCycle: h24 ? "h23" : undefined }).format(now);
      const date = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(now);
      const off = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(now).find(x => x.type === "timeZoneName")?.value ?? "";
      const ph = phaseOf(+el.dataset.lat!, +el.dataset.lon!, now);
      el.className = `clock ${ph}`;
      el.querySelector(".ct")!.textContent = time;
      el.querySelector(".cd")!.textContent = `${PHASE_INFO[ph][0]} ${PHASE_INFO[ph][1]} · ${date} · ${off}`;
      (el.querySelector(".cbar i") as HTMLElement).style.left = `${(mins(tz) / 1440) * 100}%`;
    });
  };

  const setFmt = () => { fmtBtn.textContent = h24 ? "24h" : "12h"; localStorage.setItem(FMT, h24 ? "1" : "0"); tick(); };
  fmtBtn.onclick = () => { h24 = !h24; setFmt(); };
  allBtn.onclick = () => {
    allWrap.hidden = !allWrap.hidden;
    allBtn.textContent = allWrap.hidden ? "Search & add clocks ▾" : "Hide search ▴";
    if (!allWrap.hidden) renderAll();
  };
  allBtn.textContent = "Search & add clocks ▾";
  search.oninput = () => { if (mode === "city") { clearTimeout(timer); timer = window.setTimeout(searchCities, 300); } else renderAll(); };
  fmtBtn.textContent = h24 ? "24h" : "12h";
  renderPinned();
  setInterval(tick, 1000);
}
