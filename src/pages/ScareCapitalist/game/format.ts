// Money as idle games write it: $1,234,567 up to a million, then "$12.35 Million",
// named all the way to a centillion (10^303), and 1.23e308 past that.
const FIRST = ["Thousand", "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", "Sextillion", "Septillion", "Octillion", "Nonillion"];
const UNITS = ["", "Un", "Duo", "Tre", "Quattuor", "Quin", "Sex", "Septen", "Octo", "Novem"];
const TENS = ["", "Dec", "Vigint", "Trigint", "Quadragint", "Quinquagint", "Sexagint", "Septuagint", "Octogint", "Nonagint"];

// The name for 10^(3k)
export function illion(k: number) {
  if (k <= 10) return FIRST[k - 1];
  const n = k - 1;
  if (n === 100) return "Centillion";
  const name = UNITS[n % 10] + TENS[Math.floor(n / 10)].toLowerCase() + "illion";
  return name[0].toUpperCase() + name.slice(1);
}

export function formatNumber(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return "∞";
  if (x < 0) return `-${formatNumber(-x, digits)}`;
  if (x < 1e6) return x < 100 && x % 1 !== 0 ? x.toFixed(2) : Math.floor(x).toLocaleString("en-US");
  const k = Math.floor(Math.log10(x) / 3);
  if (k > 101) return x.toExponential(2).replace("+", "");
  let mant = x / Math.pow(10, 3 * k);
  // 999.9995 Million rounds up into the next name
  if (mant >= 999.995) return formatNumber(Math.pow(10, 3 * (k + 1)), digits);
  mant = Math.floor(mant * 1000) / 1000;
  return `${mant.toFixed(digits)} ${illion(k)}`;
}

export function formatMoney(x: number) {
  return `$${formatNumber(x)}`;
}

// A short form for tight spots: $12.3M, $4.56Qa, then e-notation
const SHORT = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function formatShort(x: number) {
  if (!Number.isFinite(x)) return "∞";
  if (x < 1000) return x < 10 && x % 1 !== 0 ? x.toFixed(1) : Math.floor(x).toString();
  const k = Math.floor(Math.log10(x) / 3);
  if (k >= SHORT.length) return x.toExponential(2).replace("+", "");
  const m = x / Math.pow(10, 3 * k);
  return `${m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2)}${SHORT[k]}`;
}

export function formatDuration(sec: number) {
  if (!Number.isFinite(sec)) return "--";
  if (sec < 1) return `${sec.toFixed(2)}s`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
