
import { getWeekNum, roundToNearest } from './timetable-calc.js';
import { parseTime, formatTime, parseCSV } from './timetable-utils.js';
import { createCSVUpload, createWeekStartSelector, createOffsetControls } from './timetable-layout.js';

// --- Theme Toggle Logic ---
const themeToggleBtn = document.getElementById('theme-toggle');
const THEME_KEY = 'timetableTheme';
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    themeToggleBtn.classList.add('dark');
    themeToggleBtn.textContent = '🌙 Dark';
  } else if (theme === 'light') {
    themeToggleBtn.classList.remove('dark');
    themeToggleBtn.textContent = '☀️ Light';
  } else {
    themeToggleBtn.classList.remove('dark');
    themeToggleBtn.textContent = '🌗 System';
  }
}
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  let theme = localStorage.getItem(THEME_KEY) || 'system';
  if (theme === 'system') theme = getSystemTheme();
  setTheme(theme);
}
themeToggleBtn.addEventListener('click', () => {
  let current = localStorage.getItem(THEME_KEY) || 'system';
  let next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') applyTheme();
});
applyTheme();

// --- Config/state ---
const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const csvPrayerMap = { Fajr: ["Fajr"], Dhuhr: ["Dhuhr", "Zuhr"], Asr: ["Asr"], Maghrib: ["Maghrib"], Isha: ["Isha"] };
const defaultOffsets = { Fajr: 20, Dhuhr: 0, Asr: 10, Maghrib: 10, Isha: 10 };
const columnOrderOptions = [
  { label: 'Athan | Offset | Raw Offset Time | Iqama', value: 'athan-offset-raw-iqama', order: ['Athan', 'Offset', 'Raw', 'Iqama'] },
  { label: 'Athan | Raw Offset Time | Offset | Iqama', value: 'athan-raw-offset-iqama', order: ['Athan', 'Raw', 'Offset', 'Iqama'] },
  { label: 'Athan | Iqama | Offset | Raw Offset Time', value: 'athan-iqama-offset-raw', order: ['Athan', 'Iqama', 'Offset', 'Raw'] },
  { label: 'Athan | Iqama | Raw Offset Time | Offset', value: 'athan-iqama-raw-offset', order: ['Athan', 'Iqama', 'Raw', 'Offset'] },
];
let selectedColumnOrder = localStorage.getItem('selectedColumnOrder') || 'athan-offset-raw-iqama';
let offsetToleranceNeg = Number(localStorage.getItem("offsetToleranceNeg") || 2);
let offsetTolerancePos = Number(localStorage.getItem("offsetTolerancePos") || 3);
let staticIqamahOverrides = JSON.parse(localStorage.getItem("staticIqamahOverrides") || "null") || {};

// Load CSV data from localStorage if present
let csvData = null;
const uploadedCSV = localStorage.getItem("uploadedCSV");
if (uploadedCSV) {
  try { csvData = parseCSV(uploadedCSV); } catch {}
}


async function render() {
  const app = document.getElementById("app");
  if (!app) return;
  try {
    app.innerHTML = `<h2>Athan & Iqamah Timings Adjuster</h2>`;

    // CSV Upload UI
    createCSVUpload(app, (csv) => {
      localStorage.setItem("uploadedCSV", csv);
      csvData = parseCSV(csv);
      render();
    });

    // Week start selector
    let weekStart = localStorage.getItem("iqamahWeekStart") || "Sunday";
    createWeekStartSelector(app, weekStart, (val) => {
      localStorage.setItem("iqamahWeekStart", val);
      render();
    });

    // Offset controls
    let prayerOffsets = JSON.parse(localStorage.getItem("iqamahPrayerOffsets") || "null") || {};
    createOffsetControls(app, prayers, prayerOffsets, staticIqamahOverrides,
      (prayer, value) => {
        prayerOffsets[prayer] = value;
        localStorage.setItem("iqamahPrayerOffsets", JSON.stringify(prayerOffsets));
        render();
      },
      (prayer, value) => {
        if (!staticIqamahOverrides[prayer]) staticIqamahOverrides[prayer] = {};
        staticIqamahOverrides[prayer]["all"] = value;
        localStorage.setItem("staticIqamahOverrides", JSON.stringify(staticIqamahOverrides));
        render();
      }
    );

    // Timetable rendering
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      app.innerHTML += `<p style='color:red'>No timings loaded. Please upload a CSV file.</p>`;
      return;
    }

    // Call the modular timetable rendering function (implement in timetable-layout.js)
    if (typeof window.renderTimetable === 'function') {
      window.renderTimetable(app, csvData, {
        prayers,
        csvPrayerMap,
        defaultOffsets,
        columnOrderOptions,
        selectedColumnOrder,
        offsetToleranceNeg,
        offsetTolerancePos,
        staticIqamahOverrides
      });
    } else {
      app.innerHTML += `<p style='color:orange'>Timetable rendering function not implemented.</p>`;
    }

  } catch (e) {
    if (app) app.innerHTML = `<div style='color:red'>Error: ${e.message}</div>`;
    console.error(e);
  }
}

render();
