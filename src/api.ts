export interface Place { name: string; country?: string; admin1?: string; latitude: number; longitude: number; }

export interface Forecast {
  current: { time: string; precipitation: number; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
    weather_code: number; wind_speed_10m: number; wind_direction_10m: number; pressure_msl: number; is_day: number; };
  hourly: { time: string[]; wind_speed_10m: number[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[]; };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
    precipitation_probability_max: number[]; sunrise: string[]; sunset: string[]; uv_index_max: number[]; };
  utc_offset_seconds: number;
}

export type Units = "metric" | "imperial";

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`, { signal });
  if (!r.ok) throw new Error("Search failed");
  return (await r.json()).results ?? [];
}

export async function getForecast(p: Place, units: Units): Promise<Forecast> {
  const imp = units === "imperial";
  const params = new URLSearchParams({
    latitude: String(p.latitude), longitude: String(p.longitude), timezone: "auto", forecast_days: "7",
    current: "precipitation,temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
    temperature_unit: imp ? "fahrenheit" : "celsius",
    wind_speed_unit: imp ? "mph" : "kmh",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!r.ok) throw new Error("Could not load forecast");
  return r.json();
}

export async function reverseName(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`);
    const j = await r.json();
    const a = j.address ?? {};
    return a.city || a.town || a.village || a.county || "My location";
  } catch { return "My location"; }
}

const CODES: Record<number, [string, string]> = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"], 51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"], 61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"], 71: ["Light snow", "🌨️"], 73: ["Snow", "❄️"], 75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "❄️"], 80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Snow showers", "🌨️"], 95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm, hail", "⛈️"], 99: ["Thunderstorm, hail", "⛈️"],
};
export const describe = (c: number): [string, string] => CODES[c] ?? ["Unknown", "❔"];

/** Gradient class by condition + day/night */
export function mood(code: number, isDay: boolean): string {
  if (!isDay) return "night";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 51 && code <= 82) return "rain";
  if (code >= 1 && code <= 48) return "cloudy";
  return "sunny";
}
