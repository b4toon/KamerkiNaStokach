// Proxy do Yr.no (MET Norway) z cache na CDN Vercela.
// MET wymaga identyfikującego User-Agenta, którego przeglądarka nie może ustawić.
const UA = "KamerkiNaStokach/1.0 https://kamerki-na-stokach.vercel.app";
const PL = "Europe/Warsaw";
const SPOTS = {
  "czarny-gron": [49.84, 19.57, PL],
  "master-ski": [49.38, 20.95, PL],
  "slotwiny-arena": [49.42, 20.96, PL],
  "jaworzyna-krynicka": [49.41, 20.95, PL],
  "zieleniec": [50.33, 16.40, PL],
  "kamianna-ski": [49.50, 20.80, PL],
  "bialka-tatrzanska": [49.40, 20.10, PL],
  "male-ciche": [49.30, 19.93, PL],
  "kiczera-ski": [49.52, 20.35, PL],
  "panda-san-diego": [32.735, -117.149, "America/Los_Angeles"],
};

function icon(code) {
  if (!code) return "☁️";
  const c = code.replace(/_(day|night|polartwilight)$/, "");
  if (/thunder/.test(c)) return "⛈️";
  if (/snow/.test(c)) return "❄️";
  if (/sleet/.test(c)) return "🌨️";
  if (/rain/.test(c)) return /light/.test(c) ? "🌦️" : "🌧️";
  if (c === "fog") return "🌫️";
  if (c === "clearsky") return "☀️";
  if (c === "fair" || c === "partlycloudy") return "🌤️";
  return "☁️";
}

module.exports = async function (req, res) {
  const spot = SPOTS[req.query && req.query.k];
  if (!spot) { res.statusCode = 400; res.end("unknown spot"); return; }
  try {
    const r = await fetch(
      "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + spot[0] + "&lon=" + spot[1],
      { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error("MET " + r.status);
    const ts = (await r.json()).properties.timeseries;
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: spot[2], year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const days = {}, order = [];
    ts.forEach(function (t) {
      const p = {};
      fmt.formatToParts(new Date(t.time)).forEach(function (x) { p[x.type] = x.value; });
      const d = p.year + "-" + p.month + "-" + p.day;
      if (!days[d]) { days[d] = { tmax: -99, tmin: 99, snow: 0, sym: null, symDist: 99 }; order.push(d); }
      const o = days[d], inst = t.data.instant.details, temp = inst.air_temperature;
      o.tmax = Math.max(o.tmax, temp);
      o.tmin = Math.min(o.tmin, temp);
      const n1 = t.data.next_1_hours, n6 = t.data.next_6_hours;
      const step = n1 || n6;
      if (step && step.details && temp <= 0.5) o.snow += step.details.precipitation_amount || 0; // ok. 1 mm wody = 1 cm śniegu
      const s6 = n6 || t.data.next_12_hours;
      const dist = Math.abs(Number(p.hour) - 12);
      if (s6 && s6.summary && dist < o.symDist) { o.sym = s6.summary.symbol_code; o.symDist = dist; }
    });
    const use = order.slice(0, 5);
    const out = { source: "yr", time: use, icon: [], tmax: [], tmin: [], snow: [] };
    use.forEach(function (d) {
      out.icon.push(icon(days[d].sym));
      out.tmax.push(days[d].tmax);
      out.tmin.push(days[d].tmin);
      out.snow.push(Math.round(days[d].snow * 10) / 10);
    });
    res.setHeader("Cache-Control", "public, s-maxage=10800, stale-while-revalidate=21600");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 502;
    res.end("upstream error");
  }
};
