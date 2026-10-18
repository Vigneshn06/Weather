export interface Zone { id: string; label: string; flag: string; tz: string; }

// One representative timezone per country (large countries list main zones separately)
export const ZONES: Zone[] = [
  { id: "in", label: "India", flag: "🇮🇳", tz: "Asia/Kolkata" },
  { id: "ca-t", label: "Canada (Toronto)", flag: "🇨🇦", tz: "America/Toronto" },
  { id: "ca-v", label: "Canada (Vancouver)", flag: "🇨🇦", tz: "America/Vancouver" },
  { id: "us-e", label: "USA (New York)", flag: "🇺🇸", tz: "America/New_York" },
  { id: "us-c", label: "USA (Chicago)", flag: "🇺🇸", tz: "America/Chicago" },
  { id: "us-p", label: "USA (Los Angeles)", flag: "🇺🇸", tz: "America/Los_Angeles" },
  { id: "gb", label: "United Kingdom", flag: "🇬🇧", tz: "Europe/London" },
  { id: "de", label: "Germany", flag: "🇩🇪", tz: "Europe/Berlin" },
  { id: "fr", label: "France", flag: "🇫🇷", tz: "Europe/Paris" },
  { id: "ae", label: "UAE", flag: "🇦🇪", tz: "Asia/Dubai" },
  { id: "sg", label: "Singapore", flag: "🇸🇬", tz: "Asia/Singapore" },
  { id: "jp", label: "Japan", flag: "🇯🇵", tz: "Asia/Tokyo" },
  { id: "cn", label: "China", flag: "🇨🇳", tz: "Asia/Shanghai" },
  { id: "au", label: "Australia (Sydney)", flag: "🇦🇺", tz: "Australia/Sydney" },
  { id: "nz", label: "New Zealand", flag: "🇳🇿", tz: "Pacific/Auckland" },
  { id: "br", label: "Brazil", flag: "🇧🇷", tz: "America/Sao_Paulo" },
  { id: "za", label: "South Africa", flag: "🇿🇦", tz: "Africa/Johannesburg" },
];

const DEFAULTS = ["in", "ca-t", "us-e"];
const KEY = "clocks";

export function initClocks() {
  const grid = document.getElementById("clocks")!;
  const sel = document.getElementById("addclock") as HTMLSelectElement;
  let ids: string[] = [];
  try { ids = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? DEFAULTS; } catch { ids = DEFAULTS; }
  ids = ids.filter(i => ZONES.some(z => z.id === i));

  const persist = () => localStorage.setItem(KEY, JSON.stringify(ids));
  const fill = () => {
    sel.innerHTML = `<option value="">+ Add country</option>` +
      ZONES.filter(z => !ids.includes(z.id)).map(z => `<option value="${z.id}">${z.flag} ${z.label}</option>`).join("");
  };

  const parts = (tz: string, d: Date) => {
    const time = new Intl.DateTimeFormat([], { timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit" }).format(d);
    const date = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d);
    const h = +new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(d) % 24;
    return { time, date, night: h < 6 || h >= 19 };
  };

  const build = () => {
    grid.innerHTML = ids.map(id => {
      const z = ZONES.find(x => x.id === id)!;
      return `<div class="clock" data-id="${id}"><button class="cx" data-rm="${id}" aria-label="Remove ${z.label}">×</button>
        <span class="cf">${z.flag}</span><b>${z.label}</b><span class="ct" data-tz="${z.tz}"></span><small class="cd" data-dz="${z.tz}"></small></div>`;
    }).join("");
    grid.querySelectorAll<HTMLButtonElement>("[data-rm]").forEach(b => b.onclick = () => {
      ids = ids.filter(i => i !== b.dataset.rm); persist(); build(); fill();
    });
    tick();
  };

  const tick = () => {
    const now = new Date();
    grid.querySelectorAll<HTMLElement>(".ct").forEach(el => {
      const p = parts(el.dataset.tz!, now);
      el.textContent = p.time;
      el.parentElement!.classList.toggle("night", p.night);
      (el.nextElementSibling as HTMLElement).textContent = `${p.night ? "🌙" : "☀️"} ${p.date}`;
    });
  };

  sel.onchange = () => { if (sel.value) { ids.push(sel.value); persist(); build(); fill(); } };
  fill(); build();
  setInterval(tick, 1000);
}
