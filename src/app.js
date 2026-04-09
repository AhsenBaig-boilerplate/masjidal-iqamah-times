// Basic structure for fetching, adjusting, and displaying timings
// Support both 'Dhuhr' and 'Zuhr' as synonyms
const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const csvPrayerMap = { Fajr: ["Fajr"], Dhuhr: ["Dhuhr", "Zuhr"], Asr: ["Asr"], Maghrib: ["Maghrib"], Isha: ["Isha"] };
const defaultOffsets = { Fajr: 15, Dhuhr: 10, Asr: 10, Maghrib: 5, Isha: 10 };
const offsetOptions = {
  Fajr: [5, 10, 15, 20, 25, 30],
  Dhuhr: [5, 10, 15, 20, 25, 30],
  Asr: [5, 10, 15, 20, 25, 30],
  Maghrib: [5, 10, 15, 20, 25, 30],
  Isha: [5, 10, 15, 20, 25, 30]
};

// Store static overrides for Iqamah times (per day/prayer)
let staticIqamahOverrides = JSON.parse(localStorage.getItem("staticIqamahOverrides") || "null") || {};

function roundToNearest(minutes, interval) {
  return Math.ceil(minutes / interval) * interval;
}


function parseTime(str) {
  // Accepts "h:mm AM/PM" or "HH:mm"
  if (!str) return 0;
  str = str.trim();
  let [time, period] = str.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (period) {
    if (period.toUpperCase() === "PM" && h !== 12) h += 12;
    if (period.toUpperCase() === "AM" && h === 12) h = 0;
  }
  return h * 60 + m;
}



async function render() {
  const timings = await fetchAthanMonth();
  // If no timings, prompt for upload
  const app = document.getElementById("app");
  app.innerHTML = `<h2>Athan & Iqamah Timings Adjuster</h2>`;

  // CSV upload (always visible)
  const uploadDiv = document.createElement("div");
  uploadDiv.innerHTML = `<b>Upload CSV Timetable:</b> <input type="file" id="csvfile" accept=".csv">`;
  app.appendChild(uploadDiv);
  uploadDiv.querySelector("#csvfile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      localStorage.setItem("uploadedCSV", evt.target.result);
      csvData = parseCSV(evt.target.result);
      render();
    };
    reader.readAsText(file);
  });

  if (!timings.length) {
    app.innerHTML += `<p style='color:red'>No timings loaded. Please upload a CSV file.</p>`;
    return;
  }



  // Week start selector
  let weekStart = localStorage.getItem("iqamahWeekStart") || "Sunday";
  const weekStartOptions = ["Sunday", "Monday", "Saturday"];
  const weekStartDiv = document.createElement("div");
  weekStartDiv.innerHTML = `<b>Week starts on:</b> `;
  const weekStartSel = document.createElement("select");
  weekStartOptions.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (weekStart === opt) o.selected = true;
    weekStartSel.appendChild(o);
  });
  weekStartSel.addEventListener("change", e => {
    localStorage.setItem("iqamahWeekStart", e.target.value);
    render();
  });
  weekStartDiv.appendChild(weekStartSel);
  app.appendChild(weekStartDiv);

  // Per-prayer offset storage (single offset per prayer)
  let prayerOffsets = JSON.parse(localStorage.getItem("iqamahPrayerOffsets") || "null") || {};

  // Helper to get week number for a date
  function getWeekNum(dateStr) {
    const d = new Date(dateStr);
    let day = d.getDay(); // 0=Sun, 1=Mon, ...
    let weekStartIdx = {"Sunday":0, "Monday":1, "Saturday":6}[weekStart];
    // Find the first date in the CSV
    const firstDate = new Date(timings[0].Date);
    let diff = (d - firstDate) / (1000*60*60*24);
    let firstDay = firstDate.getDay();
    let offset = (7 + day - weekStartIdx) % 7;
    let weekNum = Math.floor((diff - offset + (7 + firstDay - weekStartIdx) % 7) / 7);
    return weekNum;
  }

  // Render per-prayer offset controls (one dropdown per prayer)
  const offsetControls = document.createElement("div");
  offsetControls.innerHTML = `<b>Set Iqamah Offsets:</b> `;
  prayers.forEach(prayer => {
    offsetControls.appendChild(document.createTextNode(prayer + ': '));
    const sel = document.createElement("select");
    sel.dataset.prayer = prayer;
    offsetOptions[prayer].forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = `+${opt} min`;
      if ((prayerOffsets[prayer] ?? defaultOffsets[prayer]) === opt) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", e => {
      prayerOffsets[prayer] = Number(e.target.value);
      localStorage.setItem("iqamahPrayerOffsets", JSON.stringify(prayerOffsets));
      render();
    });
    offsetControls.appendChild(sel);
    // Static time override input
    const timeInput = document.createElement("input");
    timeInput.type = "text";
    timeInput.placeholder = "or set time (e.g. 1:30 PM)";
    timeInput.style.width = "110px";
    timeInput.value = (staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["all"] ? staticIqamahOverrides[prayer]["all"] : "");
    timeInput.addEventListener("change", e => {
      if (!staticIqamahOverrides[prayer]) staticIqamahOverrides[prayer] = {};
      staticIqamahOverrides[prayer]["all"] = e.target.value.trim();
      localStorage.setItem("staticIqamahOverrides", JSON.stringify(staticIqamahOverrides));
      render();
    });
    offsetControls.appendChild(timeInput);
    offsetControls.appendChild(document.createTextNode(' '));
  });
  app.appendChild(offsetControls);

  // Table for the whole month with grouped headers and merged Iqamah cells
  const table = document.createElement("table");
  table.className = "table";
  // Header row 1: Add an Offset column after each Iqamah
  let header1 = `<tr><th rowspan='2'>Month</th><th rowspan='2'>Date</th><th rowspan='2'>Day</th><th colspan='3'>Fajr</th><th rowspan='2'>Sunrise</th><th colspan='3'>Dhuhr</th><th colspan='3'>Asr</th><th colspan='3'>Maghrib</th><th colspan='3'>Isha</th></tr>`;
  // Header row 2: Athan/Iqamah/Offset for each prayer (no cell for Sunrise)
  let header2 = `<tr>`;
  for (let i = 0; i < prayers.length; ++i) {
    header2 += `<th>Athan</th><th class='iqamah-col'>Iqamah</th><th>Offset</th>`;
    if (i === 0) header2 += ``; // After Fajr, Sunrise comes next
  }
  header2 += `</tr>`;
  table.innerHTML = header1 + header2;

  // Precompute weekly Iqamah times: for each week, use earliest Athan + offset (rounded), assign to all days in that week
  const iqamahTimesByPrayer = {};
  prayers.forEach(prayer => {
    // Map: weekNum -> earliest Athan (in minutes)
    const weekEarliestAthan = {};
    timings.forEach((t, idx) => {
      const weekNum = getWeekNum(t.Date);
      let athanTime = "";
      for (const col of csvPrayerMap[prayer]) {
        if (t[col]) { athanTime = t[col]; break; }
      }
      const athanMins = parseTime(athanTime);
      if (!isNaN(athanMins) && athanTime) {
        if (!(weekNum in weekEarliestAthan) || athanMins < weekEarliestAthan[weekNum]) {
          weekEarliestAthan[weekNum] = athanMins;
        }
      }
    });
    // Map: weekNum -> computed Iqamah time (string)
    const weekIqamah = {};
    Object.keys(weekEarliestAthan).forEach(weekNum => {
      const offset = Math.max(prayerOffsets[prayer] ?? defaultOffsets[prayer], 10); // Enforce minimum 10 min
      const iqamahMins = roundToNearest(weekEarliestAthan[weekNum] + offset, 5);
      weekIqamah[weekNum] = !isNaN(iqamahMins) ? formatTime(iqamahMins, true) : '';
    });
    iqamahTimesByPrayer[prayer] = timings.map((t, idx) => {
      if (staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["all"] && staticIqamahOverrides[prayer]["all"].length > 0) {
        return staticIqamahOverrides[prayer]["all"];
      } else {
        const weekNum = getWeekNum(t.Date);
        return weekIqamah[weekNum] || '';
      }
    });
  });

  // Compute rowspans for Iqamah cells (break at week boundaries)
  const iqamahRowspans = {};
  prayers.forEach(prayer => {
    iqamahRowspans[prayer] = Array(timings.length).fill(0);
    let last = null, start = 0, lastWeek = null;
    for (let i = 0; i <= timings.length; ++i) {
      const curr = iqamahTimesByPrayer[prayer][i];
      const currWeek = i < timings.length ? getWeekNum(timings[i].Date) : null;
      if (i === timings.length || curr !== last || currWeek !== lastWeek) {
        if (last !== null) {
          iqamahRowspans[prayer][start] = i - start;
        }
        start = i;
        last = curr;
        lastWeek = currWeek;
      }
    }
  });

  // Render table rows
  // Group rows by week number
  let currentWeek = getWeekNum(timings[0].Date);
  let weekRows = [];
  let weekStartIdx = 0;
  for (let rowIdx = 0; rowIdx < timings.length; ++rowIdx) {
    const t = timings[rowIdx];
    const row = document.createElement("tr");
    let dateObj = new Date(t.Date);
    if (isNaN(dateObj)) {
      const parts = t.Date.split("/");
      if (parts.length === 3) {
        dateObj = new Date(parts[2], parts[0] - 1, parts[1]);
      }
    }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayStr = days[dateObj.getDay()];
    const monthStr = months[dateObj.getMonth()];
    let html = `<td>${monthStr}</td><td>${t.Date.split("/")[1]}</td><td>${dayStr}</td>`;
    // For each prayer, render Athan, Iqamah, Offset
    for (let i = 0; i < prayers.length; ++i) {
      let prayer = prayers[i];
      let athanTime = "";
      for (const col of csvPrayerMap[prayer]) { if (t[col]) { athanTime = t[col]; break; } }
      html += `<td>${athanTime}</td>`;
      if (iqamahRowspans[prayer][rowIdx] > 0) {
        html += `<td class='iqamah-col' rowspan='${iqamahRowspans[prayer][rowIdx]}'>${iqamahTimesByPrayer[prayer][rowIdx]}</td>`;
      } else {
        html += `<td class='iqamah-col' style='display:none'></td>`;
      }
      // Offset column (always present, never merged)
      let athanMins = parseTime(athanTime);
      let iqamahMins = parseTime(iqamahTimesByPrayer[prayer][rowIdx]);
      let offsetVal = (!isNaN(athanMins) && !isNaN(iqamahMins) && athanTime && iqamahTimesByPrayer[prayer][rowIdx]) ? (iqamahMins - athanMins) : "";
      // Only show offset if valid, positive, and at least 10 min
      if (offsetVal !== "" && offsetVal >= 10) {
        html += `<td>+${offsetVal} min</td>`;
      } else {
        html += `<td></td>`;
      }
      // After Fajr, insert Sunrise column
      if (i === 0) html += `<td>${t["Sunrise"] || ""}</td>`;
    }
    row.innerHTML = html;
    if (dayStr === "Sun") {
      row.style.fontWeight = "bold";
    }
    if (dayStr === "Fri") {
      row.style.fontWeight = "bold";
      row.style.fontStyle = "italic";
    }
    table.appendChild(row);
  }

  // Helper: average offset (in minutes) for a week/prayer
  function averageIqamahTime(startIdx, endIdx, prayer) {
    // Always use the selected offset for this week, not merged/overridden cells
    let athanMins = [];
    for (let i = startIdx; i <= endIdx; ++i) {
      let athanTime = "";
      for (const col of csvPrayerMap[prayer]) {
        if (timings[i][col]) { athanTime = timings[i][col]; break; }
      }
      if (athanTime) {
        athanMins.push(parseTime(athanTime));
      }
    }
    if (!athanMins.length) return "";
    let avgAthan = Math.round(athanMins.reduce((a, b) => a + b, 0) / athanMins.length);
    // Use the selected offset for this week
    const weekNum = getWeekNum(timings[startIdx].Date);
    const offset = weekOffsets[prayer]?.[weekNum] ?? defaultOffsets[prayer];
    let avgIqamah = roundToNearest(avgAthan + offset, 5);
    return formatTime(avgIqamah, true);
  }
  app.appendChild(table);
  // Add style for iqamah columns
  const style = document.createElement('style');
  style.textContent = `.iqamah-col { background: #e6ffe6; font-weight: bold; vertical-align: middle; }`;
  document.head.appendChild(style);
}

// Utility: Parse CSV
let csvData = null;
function formatTime(minutes, ampm = true) {
  // Converts minutes since midnight to "h:mm AM/PM" or "HH:mm"
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

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] ? cols[i].trim() : "");
    return obj;
  });
}

// Utility: Load CSV from file or localStorage
async function fetchAthanMonth() {
  if (csvData) return csvData;
  // Try to fetch salah_timings.csv from the project directory
  try {
    const res = await fetch('salah_timings.csv');
    if (res.ok) {
      const text = await res.text();
      csvData = parseCSV(text);
      return csvData;
    }
  } catch (e) {}
  // fallback: try to load from localStorage
  const stored = localStorage.getItem("uploadedCSV");
  if (stored) {
    csvData = parseCSV(stored);
    return csvData;
  }
  // fallback: empty
  return [];
}

render();
