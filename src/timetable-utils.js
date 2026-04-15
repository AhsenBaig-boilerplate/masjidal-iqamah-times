// Utility functions: parseTime, formatTime, CSV parsing, etc.

export function parseTime(str) {
  if (!str || typeof str !== 'string' || !str.trim()) return NaN;
  str = str.trim();
  let [time, period] = str.split(" ");
  if (!time || !time.includes(":")) return NaN;
  let [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return NaN;
  if (period) {
    if (period.toUpperCase() === "PM" && h !== 12) h += 12;
    if (period.toUpperCase() === "AM" && h === 12) h = 0;
  }
  return h * 60 + m;
}

export function formatTime(minutes, ampm = true) {
  let h = Math.floor(minutes / 60);
  let m = minutes % 60;
  if (ampm) {
    const period = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, "0")} ${period}`;
  } else {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] ? cols[i].trim() : "");
    return obj;
  });
}
