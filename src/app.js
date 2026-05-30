
import { getWeekNum, roundToNearest } from './timetable-calc.js';
import { parseTime, formatTime, parseCSV } from './timetable-utils.js';
import { createCSVUpload, createWeekStartSelector, createOffsetControls } from './timetable-layout.js';

// Attach utility functions to window for use in timetable-layout.js
window.getWeekNum = getWeekNum;
window.parseTime = parseTime;

// --- Debug Toggle Logic ---
const DEBUG_KEY = 'debugMode';
window.debugEnabled = localStorage.getItem(DEBUG_KEY) === 'true';
window.debugLog = (...args) => { if (window.debugEnabled) console.log(...args); };
window.debugError = (...args) => { if (window.debugEnabled) console.error(...args); };

const debugToggleBtn = document.getElementById('debug-toggle');
function updateDebugButton() {
  debugToggleBtn.textContent = window.debugEnabled ? '🐛 Debug: ON' : '🐛 Debug: OFF';
  debugToggleBtn.style.backgroundColor = window.debugEnabled ? '#10b981' : '';
  debugToggleBtn.style.color = window.debugEnabled ? '#fff' : '';
}
updateDebugButton();
debugToggleBtn.addEventListener('click', () => {
  window.debugEnabled = !window.debugEnabled;
  localStorage.setItem(DEBUG_KEY, window.debugEnabled);
  updateDebugButton();
  console.log(`Debug mode ${window.debugEnabled ? 'ENABLED' : 'DISABLED'}`);
});

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
  { label: 'Athan | Offset | Raw Offset Time | Iqamah', value: 'athan-offset-raw-iqamah', order: ['Athan', 'Offset', 'Raw', 'Iqamah'] },
  { label: 'Athan | Raw Offset Time | Offset | Iqamah', value: 'athan-raw-offset-iqamah', order: ['Athan', 'Raw', 'Offset', 'Iqamah'] },
  { label: 'Athan | Iqamah | Offset | Raw Offset Time', value: 'athan-iqamah-offset-raw', order: ['Athan', 'Iqamah', 'Offset', 'Raw'] },
  { label: 'Athan | Iqamah | Raw Offset Time | Offset', value: 'athan-iqamah-raw-offset', order: ['Athan', 'Iqamah', 'Raw', 'Offset'] },
];
let selectedColumnOrder = localStorage.getItem('selectedColumnOrder') || 'athan-offset-raw-iqamah';
let offsetToleranceNeg = Number(localStorage.getItem("offsetToleranceNeg") || 2);
let offsetTolerancePos = Number(localStorage.getItem("offsetTolerancePos") || 3);
let staticIqamahOverrides = JSON.parse(localStorage.getItem("staticIqamahOverrides") || "null") || {};

// Load CSV: localStorage first, then auto-fetch the bundled file
let csvData = null;
const uploadedCSV = localStorage.getItem("uploadedCSV");
if (uploadedCSV) {
  try { csvData = parseCSV(uploadedCSV); } catch {}
}
if (!csvData) {
  try {
    const res = await fetch('./salah_timings.csv');
    if (res.ok) {
      const text = await res.text();
      csvData = parseCSV(text);
    }
  } catch {}
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

    const weekStartDiv = document.createElement("div");
    weekStartDiv.style.marginBottom = "16px";
    const weekStartLabel = document.createElement("label");
    weekStartLabel.innerHTML = `<b>Week starts on:</b> `;
    const weekStartSel = document.createElement("select");
    ["Sunday", "Monday", "Saturday"].forEach(opt => {
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
    weekStartLabel.appendChild(weekStartSel);
    weekStartDiv.appendChild(weekStartLabel);
    app.appendChild(weekStartDiv);

    // Offset controls with per-prayer thresholds
    let prayerOffsets = JSON.parse(localStorage.getItem("iqamahPrayerOffsets") || "null") || {};
    let prayerThresholds = JSON.parse(localStorage.getItem("iqamahPrayerThresholds") || "null") || {};
    createOffsetControls(app, prayers, prayerOffsets, staticIqamahOverrides, prayerThresholds,
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
      },
      (prayer, negVal, posVal) => {
        if (!prayerThresholds[prayer]) prayerThresholds[prayer] = {};
        prayerThresholds[prayer].neg = negVal;
        prayerThresholds[prayer].pos = posVal;
        localStorage.setItem("iqamahPrayerThresholds", JSON.stringify(prayerThresholds));
        render();
      }
    );

    // Timetable rendering
    if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
      app.innerHTML += `<p class='error-message'>No timings loaded. Please upload a CSV file.</p>`;
      return;
    }

    // Call the modular timetable rendering function (implement in timetable-layout.js)
    if (typeof window.renderTimetable === 'function') {
      window.renderTimetable(app, csvData, {
        prayers,
        csvPrayerMap,
        defaultOffsets,
        prayerOffsets, // Pass user offsets
        columnOrderOptions,
        selectedColumnOrder,
        prayerThresholds, // Pass per-prayer thresholds
        staticIqamahOverrides
      });
    } else {
      app.innerHTML += `<p class='warning-message'>Timetable rendering function not implemented.</p>`;
    }

  } catch (e) {
    if (app) app.innerHTML = `<div class='error-message'>Error: ${e.message}</div>`;
    console.error(e);
  }
}

render();
