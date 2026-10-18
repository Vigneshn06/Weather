import "./style.css";
import { initClocks } from "./clocks";
import { describe, getForecast, mood, reverseName, searchPlaces, type Forecast, type Place, type Units } from "./api";

const MAX_SAVED = 5;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const load = <T>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const save = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

let units: Units = load("units", "metric");
let saved: Place[] = load("saved", [
  { name: "Chennai", country: "India", latitude: 13.0827, longitude: 80.2707 },
  { name: "London", country: "United Kingdom", latitude: 51.5072, longitude: -0.1276 },
  { name: "New York", country: "United States", latitude: 40.7128, longitude: -74.006 },
]);
let current: Place | null = load("current", null);

const sameCity = (a: Place, b: Place) => Math.abs(a.latitude - b.latitude) < 0.05 && Math.abs(a.longitude - b.longitude) < 0.05;
const isSaved = (p: Place) => saved.some(s => sameCity(s, p));
const label = (p: Place) => [p.name, p.admin1, p.country].filter(Boolean).join(", ");

// ---------- theme / units ----------
function applyTheme() {
  const t = localStorage.getItem("theme") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = t;
}
$("theme").onclick = () => {
  localStorage.setItem("theme", document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  applyTheme();
};
$("unit").textContent = units === "metric" ? "°C" : "°F";
$("unit").onclick = () => {
  units = units === "metric" ? "imperial" : "metric";
  save("units", units);
  $("unit").textContent = units === "metric" ? "°C" : "°F";
  if (current) show(current);
};

// ---------- wishlist ----------
function renderWish() {
  const nav = $("wish");
  nav.innerHTML = saved.map((p, i) =>
    `<span class="pill ${current && sameCity(p, current) ? "on" : ""}">
       <button data-go="${i}">${esc(p.name)}</button><button class="x" data-rm="${i}" aria-label="Remove ${esc(p.name)}">×</button>
     </span>`).join("") || `<span class="hint">Star a city to save it (up to ${MAX_SAVED}).</span>`;
  nav.querySelectorAll<HTMLButtonElement>("[data-go]").forEach(b => b.onclick = () => show(saved[+b.dataset.go!]));
  nav.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach(b => b.onclick = () => {
    saved.splice(+b.dataset.rm!, 1); save("saved", saved); renderWish(); if (current) updateStar();
  });
}
function toggleSave(p: Place) {
  if (isSaved(p)) saved = saved.filter(s => !sameCity(s, p));
  else {
    if (saved.length >= MAX_SAVED) { toast(`You can save up to ${MAX_SAVED} locations. Remove one first.`); return; }
    saved.push(p);
  }
  save("saved", saved); renderWish(); updateStar();
}
function updateStar() {
  const b = document.getElementById("star");
  if (b && current) { b.textContent = isSaved(current) ? "★" : "☆"; b.classList.toggle("on", isSaved(current)); }
}

// ---------- search with autocomplete ----------
const q = $<HTMLInputElement>("q"), sug = $<HTMLUListElement>("suggest");
let timer = 0, ctrl: AbortController | null = null;
q.addEventListener("input", () => {
  clearTimeout(timer);
  const v = q.value.trim();
  if (v.length < 2) { sug.hidden = true; return; }
  timer = window.setTimeout(async () => {
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const res = await searchPlaces(v, ctrl.signal);
      sug.innerHTML = res.length ? res.map((p, i) => `<li data-i="${i}" tabindex="0">${esc(label(p))}</li>`).join("") : `<li class="none">No results</li>`;
      sug.hidden = false;
      sug.querySelectorAll<HTMLLIElement>("li[data-i]").forEach(li => {
        const pick = () => { sug.hidden = true; q.value = ""; show(res[+li.dataset.i!]); };
        li.onclick = pick; li.onkeydown = e => e.key === "Enter" && pick();
      });
    } catch (e) { if ((e as Error).name !== "AbortError") toast("Search failed. Check your connection."); }
  }, 250);
});
q.addEventListener("keydown", async e => {
  if (e.key !== "Enter") return;
  const v = q.value.trim(); if (!v) return;
  try { const r = await searchPlaces(v); if (r[0]) { sug.hidden = true; q.value = ""; show(r[0]); } else toast("City not found."); }
  catch { toast("Search failed."); }
});
document.addEventListener("click", e => { if (!(e.target as Element).closest(".searchbox")) sug.hidden = true; });

$("locate").onclick = () => {
  if (!navigator.geolocation) return toast("Geolocation not supported.");
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords;
    show({ name: await reverseName(latitude, longitude), latitude, longitude });
  }, () => toast("Location permission denied."), { timeout: 10000 });
};

// ---------- hourly chart (SVG, no dependencies) ----------
function initChart(f: Forecast, start: number, speedUnit: string) {
  const n = Math.min(168, f.hourly.time.length - start);
  const times = f.hourly.time.slice(start, start + n);
  const series = {
    temp: { v: f.hourly.temperature_2m.slice(start, start + n), fmt: (x: number) => `${Math.round(x)}°`, bars: false, color: "#fbbf24" },
    rain: { v: f.hourly.precipitation_probability.slice(start, start + n).map(x => x ?? 0), fmt: (x: number) => `${Math.round(x)}%`, bars: true, color: "#38bdf8" },
    wind: { v: f.hourly.wind_speed_10m.slice(start, start + n), fmt: (x: number) => `${Math.round(x)} ${speedUnit}`, bars: false, color: "#a78bfa" },
  };
  const host = $("chart");
  const draw = (m: keyof typeof series) => {
    const { v, fmt, bars, color } = series[m];
    const step = 26, H = 170, padT = 28, padB = 30, W = n * step;
    const min = bars ? 0 : Math.min(...v), max = bars ? 100 : Math.max(...v), span = max - min || 1;
    const X = (i: number) => i * step + step / 2, Y = (x: number) => padT + (1 - (x - min) / span) * (H - padT - padB);
    let svg = `<svg width="${W}" height="${H}" role="img" aria-label="Hourly chart">`;
    if (bars) svg += v.map((x, i) => `<rect x="${X(i) - 8}" y="${Y(x)}" width="16" height="${H - padB - Y(x)}" rx="4" fill="${color}" opacity=".8"/>`).join("");
    else {
      const pts = v.map((x, i) => `${X(i)},${Y(x)}`);
      svg += `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
        <polygon points="${X(0)},${H - padB} ${pts.join(" ")} ${X(n - 1)},${H - padB}" fill="url(#g)"/>
        <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    for (let i = 0; i < n; i++) {
      const d = new Date(times[i]), h = d.getHours();
      if (h === 0) svg += `<line x1="${i * step}" x2="${i * step}" y1="${padT - 10}" y2="${H - padB}" stroke="currentColor" opacity=".25" stroke-dasharray="3 3"/>
        <text x="${i * step + 4}" y="12" class="dl">${d.toLocaleDateString([], { weekday: "short" })}</text>`;
      if (h % 3 === 0) svg += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="tl">${d.toLocaleTimeString([], { hour: "numeric" }).toLowerCase()}</text>`;
      if (i % 3 === 0) svg += `<text x="${X(i)}" y="${Y(v[i]) - 8}" text-anchor="middle" class="vl">${fmt(v[i]).replace(" " + speedUnit, "")}</text>`;
    }
    host.innerHTML = svg + "</svg>";
  };
  let mode: keyof typeof series = "temp";
  draw(mode);
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#tabs button").forEach(x => x.classList.remove("on")); b.classList.add("on");
    mode = b.dataset.m as keyof typeof series; draw(mode); host.scrollLeft = 0;
  });
}

// ---------- render ----------
const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (iso: string, i: number) => i === 0 ? "Today" : new Date(iso + "T00:00").toLocaleDateString([], { weekday: "short" });
const compass = (d: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];
const t = (n: number) => `${Math.round(n)}°`;

function uvLabel(u: number) { return u < 3 ? "Low" : u < 6 ? "Moderate" : u < 8 ? "High" : u < 11 ? "Very high" : "Extreme"; }

function render(p: Place, f: Forecast) {
  const c = f.current, [desc, icon] = describe(c.weather_code);
  document.body.className = mood(c.weather_code, !!c.is_day);
  const speed = units === "metric" ? "km/h" : "mph";

  // API times are already local to the place; current.time is the place's local "now"
  let start = f.hourly.time.findIndex(x => x >= c.time.slice(0, 13) + ":00");
  if (start < 0) start = 0;
  const hours = f.hourly.time.slice(start, start + 24).map((x, k) => {
    const i = start + k, [, ic] = describe(f.hourly.weather_code[i]);
    return `<div class="hr"><span>${k === 0 ? "Now" : fmtHour(x)}</span><span class="ic" title="${describe(f.hourly.weather_code[i])[0]}">${ic}</span><b>${t(f.hourly.temperature_2m[i])}</b><small>💧${f.hourly.precipitation_probability[i] ?? 0}%</small></div>`;
  }).join("");
  const rainNow = f.hourly.precipitation_probability[start] ?? 0;
  const when = new Date(c.time).toLocaleString([], { weekday: "long", hour: "numeric", minute: "2-digit" });

  const lo = Math.min(...f.daily.temperature_2m_min), hi = Math.max(...f.daily.temperature_2m_max);
  const days = f.daily.time.map((d, i) => {
    const l = f.daily.temperature_2m_min[i], h = f.daily.temperature_2m_max[i];
    const left = ((l - lo) / (hi - lo || 1)) * 100, width = ((h - l) / (hi - lo || 1)) * 100;
    return `<div class="day"><span class="dn">${day(d, i)}</span><span class="ic" title="${describe(f.daily.weather_code[i])[0]}">${describe(f.daily.weather_code[i])[1]}</span>
      <small>💧${f.daily.precipitation_probability_max[i] ?? 0}%</small><span class="lo">${t(l)}</span>
      <div class="bar"><i style="left:${left}%;width:${Math.max(width, 6)}%"></i></div><span class="hi">${t(h)}</span></div>`;
  }).join("");

  $("main").innerHTML = `
    <section class="card hero">
      <div class="place"><h2>${esc(label(p))}</h2>
        <div><button id="star" class="chip" aria-label="Save location"></button><button id="share" class="chip" aria-label="Share">🔗</button></div></div>
      <div class="big"><span class="ic xl">${icon}</span><span class="deg">${t(c.temperature_2m)}</span></div>
      <p class="desc">${desc} · Feels like ${t(c.apparent_temperature)}</p>
      <p class="hl">${when} (local time) · 💧 ${rainNow}% · 💨 ${Math.round(c.wind_speed_10m)} ${speed}</p>
      <p class="hl">H ${t(f.daily.temperature_2m_max[0])} · L ${t(f.daily.temperature_2m_min[0])}</p>
    </section>
    <section class="grid">
      <div class="card stat"><small>Humidity</small><b>${c.relative_humidity_2m}%</b></div>
      <div class="card stat"><small>Wind</small><b>${Math.round(c.wind_speed_10m)} ${speed} ${compass(c.wind_direction_10m)}</b></div>
      <div class="card stat"><small>Pressure</small><b>${Math.round(c.pressure_msl)} hPa</b></div>
      <div class="card stat"><small>UV index</small><b>${Math.round(f.daily.uv_index_max[0])} · ${uvLabel(f.daily.uv_index_max[0])}</b></div>
      <div class="card stat"><small>Sunrise</small><b>🌅 ${fmtTime(f.daily.sunrise[0])}</b></div>
      <div class="card stat"><small>Sunset</small><b>🌇 ${fmtTime(f.daily.sunset[0])}</b></div>
    </section>
    <section class="card"><div class="tabs" id="tabs"><button data-m="temp" class="on">Temperature</button><button data-m="rain">Precipitation</button><button data-m="wind">Wind</button></div>
      <div id="chart" class="chart"></div></section>
    <section class="card"><h3>Next 24 hours</h3><div class="hours">${hours}</div></section>
    <section class="card"><h3>7-day forecast</h3>${days}</section>`;

  initChart(f, start, units === "metric" ? "km/h" : "mph");
  updateStar();
  $("star").onclick = () => toggleSave(p);
  $("share").onclick = () => share(p);
}

async function show(p: Place) {
  current = p; save("current", p); renderWish();
  $("main").innerHTML = `<div class="skeleton"></div><div class="skeleton s2"></div>`;
  try { render(p, await getForecast(p, units)); }
  catch (e) {
    console.error("Forecast failed:", e);
    const why = e instanceof Error ? e.message : "Unknown error";
    $("main").innerHTML = `<p class="hint">⚠️ Couldn't load the forecast for ${esc(p.name)}.<br><small>${esc(why)}</small><br><button class="chip" id="retry">Retry</button></p>`;
    $("retry").onclick = () => show(p);
  }
  const u = new URL(location.href);
  u.search = `?lat=${p.latitude.toFixed(3)}&lon=${p.longitude.toFixed(3)}&name=${encodeURIComponent(p.name)}`;
  history.replaceState(null, "", u);
}

async function share(p: Place) {
  const url = location.href, text = `Weather in ${p.name}`;
  if (navigator.share) { try { await navigator.share({ title: "Weather", text, url }); } catch { /* cancelled */ } }
  else { await navigator.clipboard.writeText(url); toast("Link copied!"); }
}

function toast(msg: string) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 3000);
}

// ---------- boot ----------
applyTheme();
initClocks();
renderWish();
const qs = new URLSearchParams(location.search);
const lat = parseFloat(qs.get("lat") ?? ""), lon = parseFloat(qs.get("lon") ?? "");
if (!isNaN(lat) && !isNaN(lon)) show({ name: qs.get("name") || "Shared location", latitude: lat, longitude: lon });
else if (qs.get("city")) { // backwards compatible with old ?city= links
  searchPlaces(qs.get("city")!).then(r => r[0] && show(r[0])).catch(() => toast("City not found."));
} else if (current) show(current);
else if (saved[0]) show(saved[0]);

if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
