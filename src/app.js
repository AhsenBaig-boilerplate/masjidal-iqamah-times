// Basic structure for fetching, adjusting, and displaying timings
// Support both 'Dhuhr' and 'Zuhr' as synonyms
const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const csvPrayerMap = { Fajr: ["Fajr"], Dhuhr: ["Dhuhr", "Zuhr"], Asr: ["Asr"], Maghrib: ["Maghrib"], Isha: ["Isha"] };
// User: Fajr +20, Dhuhr 1:30 PM (fixed), rest +10
const defaultOffsets = { Fajr: 20, Dhuhr: 0, Asr: 10, Maghrib: 10, Isha: 10 };
const offsetOptions = {
  Fajr: [5, 10, 15, 20, 25, 30],
  Dhuhr: [5, 10, 15, 20, 25, 30],
  Asr: [5, 10, 15, 20, 25, 30],
  Maghrib: [5, 10, 15, 20, 25, 30],
  Isha: [5, 10, 15, 20, 25, 30]
};

// Store static overrides for Iqamah times (per day/prayer)
// User-adjustable column order for prayer blocks
const columnOrderOptions = [
  { label: 'Athan | Offset | Raw Offset Time | Iqama', value: 'athan-offset-raw-iqama', order: ['Athan', 'Offset', 'Raw', 'Iqama'] },
  { label: 'Athan | Raw Offset Time | Offset | Iqama', value: 'athan-raw-offset-iqama', order: ['Athan', 'Raw', 'Offset', 'Iqama'] },
  { label: 'Athan | Iqama | Offset | Raw Offset Time', value: 'athan-iqama-offset-raw', order: ['Athan', 'Iqama', 'Offset', 'Raw'] },
  { label: 'Athan | Iqama | Raw Offset Time | Offset', value: 'athan-iqama-raw-offset', order: ['Athan', 'Iqama', 'Raw', 'Offset'] },
];
let selectedColumnOrder = localStorage.getItem('selectedColumnOrder') || 'athan-offset-raw-iqama';
// User-adjustable tolerances (in minutes) for offset rounding
let offsetToleranceNeg = Number(localStorage.getItem("offsetToleranceNeg") || 2); // for rounding down
let offsetTolerancePos = Number(localStorage.getItem("offsetTolerancePos") || 3); // for rounding up
let staticIqamahOverrides = JSON.parse(localStorage.getItem("staticIqamahOverrides") || "null") || {};

function roundToNearest(minutes, interval) {
  return Math.ceil(minutes / interval) * interval;
}


function parseTime(str) {
  // Accepts "h:mm AM/PM" or "HH:mm"
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




function createCSVUpload(app, onUpload) {
  // Remove any existing upload UI (remove ALL, not just first)
  while (true) {
    const oldUpload = app.querySelector('.csv-upload-ui');
    if (!oldUpload) break;
    oldUpload.remove();
  }
  const uploadDiv = document.createElement("div");
  uploadDiv.className = 'csv-upload-ui';
  uploadDiv.innerHTML = `<b>Upload CSV Timetable:</b> <input type="file" id="csvfile" accept=".csv">`;
  app.appendChild(uploadDiv);
  uploadDiv.querySelector("#csvfile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      onUpload(evt.target.result);
    };
    reader.readAsText(file);
  });
}

function createWeekStartSelector(app, weekStart, onChange) {
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
    onChange(e.target.value);
  });
  weekStartDiv.appendChild(weekStartSel);
  app.appendChild(weekStartDiv);
}

function createOffsetControls(app, prayers, prayerOffsets, staticIqamahOverrides, onOffsetChange, onFixedChange) {
  const offsetControls = document.createElement("div");
  offsetControls.innerHTML = `<b>Set Iqamah Method:</b>`;
  const offsetTable = document.createElement("table");
  offsetTable.style.margin = '10px 0 20px 0';
  offsetTable.style.borderCollapse = 'collapse';
  offsetTable.style.width = 'auto';
  offsetTable.innerHTML = `<tr>
    <th style='padding:4px 12px;'>Prayer</th>
    <th style='padding:4px 12px;'>Method & Value</th>
  </tr>`;
  prayers.forEach(prayer => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style='padding:4px 12px; font-weight:bold;'>${prayer}</td>`;
    const tdMethod = document.createElement('td');
    tdMethod.style.padding = '4px 12px';
    // Modern toggle switch
    const methodToggle = document.createElement('label');
    methodToggle.style.display = 'inline-flex';
    methodToggle.style.alignItems = 'center';
    methodToggle.style.gap = '10px';
    methodToggle.style.cursor = 'pointer';
    methodToggle.innerHTML = `
      <span style="font-weight:500;">${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? "Fixed Time" : "Offset from Athan"}</span>
      <input type="checkbox" style="accent-color:#007bff; width:22px; height:22px;" ${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? "checked" : ""}>
      <span class="slider" style="width:36px;height:20px;background:#ccc;border-radius:10px;position:relative;display:inline-block;vertical-align:middle;transition:background 0.2s;"></span>
    `;
    const toggleInput = methodToggle.querySelector('input[type="checkbox"]');
    const slider = methodToggle.querySelector('.slider');
    if (toggleInput && slider) {
      // Style the slider
      slider.style.background = staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? '#007bff' : '#ccc';
      slider.style.position = 'relative';
      slider.style.transition = 'background 0.2s';
      slider.innerHTML = `<span style="position:absolute;left:${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? '18px' : '2px'};top:2px;width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 1px 4px #0002;transition:left 0.2s;"></span>`;
      toggleInput.addEventListener('change', () => {
        if (!staticIqamahOverrides[prayer]) staticIqamahOverrides[prayer] = {};
        staticIqamahOverrides[prayer]["useFixed"] = toggleInput.checked;
        localStorage.setItem("staticIqamahOverrides", JSON.stringify(staticIqamahOverrides));
        render();
      });
    }
    tdMethod.appendChild(methodToggle);
    // Offset input
    const offsetWrapper = document.createElement('div');
    offsetWrapper.style.display = staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? 'none' : 'inline-flex';
    offsetWrapper.style.alignItems = 'center';
    offsetWrapper.style.gap = '6px';
    offsetWrapper.style.marginLeft = '16px';
    offsetWrapper.innerHTML = `<span style="color:#888;">+ min</span>`;
    const minusBtn = document.createElement('button');
    minusBtn.textContent = '-';
    minusBtn.style.width = '28px';
    minusBtn.style.height = '28px';
    minusBtn.style.fontSize = '18px';
    minusBtn.style.marginRight = '4px';
    const plusBtn = document.createElement('button');
    plusBtn.textContent = '+';
    plusBtn.style.width = '28px';
    plusBtn.style.height = '28px';
    plusBtn.style.fontSize = '18px';
    plusBtn.style.marginLeft = '4px';
    const offsetInput = document.createElement('input');
    offsetInput.type = 'number';
    offsetInput.min = 0;
    offsetInput.max = 60;
    offsetInput.step = 5;
    offsetInput.value = (prayerOffsets[prayer] ?? defaultOffsets[prayer]);
    offsetInput.style.width = '48px';
    offsetInput.style.textAlign = 'center';
    offsetInput.addEventListener('change', e => {
      let val = Math.max(0, Math.min(60, Math.round(Number(offsetInput.value) / 5) * 5));
      offsetInput.value = val;
      onOffsetChange(prayer, val);
    });
    minusBtn.addEventListener('click', () => {
      let val = Math.max(0, Math.min(60, Math.round(Number(offsetInput.value) / 5) * 5 - 5));
      offsetInput.value = val;
      onOffsetChange(prayer, val);
    });
    plusBtn.addEventListener('click', () => {
      let val = Math.max(0, Math.min(60, Math.round(Number(offsetInput.value) / 5) * 5 + 5));
      offsetInput.value = val;
      onOffsetChange(prayer, val);
    });
    offsetWrapper.appendChild(minusBtn);
    offsetWrapper.appendChild(offsetInput);
    offsetWrapper.appendChild(plusBtn);
    tdMethod.appendChild(offsetWrapper);
    // Fixed time UI
    const fixedWrapper = document.createElement('div');
    fixedWrapper.style.display = staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? 'inline-flex' : 'none';
    fixedWrapper.style.alignItems = 'center';
    fixedWrapper.style.gap = '6px';
    fixedWrapper.style.marginLeft = '16px';
    fixedWrapper.innerHTML = `<span style="color:#888;">Time</span>`;
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.step = 300; // 5 min
    timeInput.style.width = '80px';
    // Default fixed time: Fajr 5:00 AM, Dhuhr 1:30 PM, rest 5:00 PM
    let defaultFixed = "5:00 PM";
    if (prayer === "Fajr") defaultFixed = "5:00 AM";
    if (prayer === "Dhuhr") defaultFixed = "1:30 PM";
    let curVal = staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["all"] ? staticIqamahOverrides[prayer]["all"] : defaultFixed;
    let [curTime, curPeriod] = curVal.split(' ');
    if (!curTime) {
      if (prayer === "Fajr") curTime = "05:00";
      else if (prayer === "Dhuhr") curTime = "13:30";
      else curTime = "17:00";
    }
    // Always default to AM/PM for all prayers
    if (!curPeriod) {
      if (prayer === "Fajr") curPeriod = "AM";
      else curPeriod = "PM";
    }
    let [h, m] = curTime.split(':');
    let hour = Number(h);
    let minute = Number(m);
    if (curPeriod && curPeriod.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (curPeriod && curPeriod.toUpperCase() === "AM" && hour === 12) hour = 0;
    timeInput.value = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const ampmBtn = document.createElement('button');
    ampmBtn.textContent = curPeriod;
    ampmBtn.style.marginLeft = '6px';
    ampmBtn.style.width = '40px';
    ampmBtn.style.height = '28px';
    ampmBtn.style.fontWeight = 'bold';
    ampmBtn.addEventListener('click', () => {
      ampmBtn.textContent = ampmBtn.textContent === 'AM' ? 'PM' : 'AM';
      updateFixed();
    });
    function updateFixed() {
      let [h, m] = timeInput.value.split(':');
      let hour = Number(h);
      let minute = Number(m);
      let period = ampmBtn.textContent;
      let displayHour = hour;
      if (period === 'PM' && hour > 12) displayHour = hour - 12;
      if (period === 'AM' && hour === 0) displayHour = 12;
      if (period === 'PM' && hour === 0) displayHour = 12;
      if (period === 'AM' && hour > 12) displayHour = hour - 12;
      let val = `${displayHour}:${m} ${period}`;
      onFixedChange(prayer, val);
    }
    timeInput.addEventListener('change', updateFixed);
    fixedWrapper.appendChild(timeInput);
    fixedWrapper.appendChild(ampmBtn);
    tdMethod.appendChild(fixedWrapper);
    tr.appendChild(tdMethod);
    offsetTable.appendChild(tr);
  });
  offsetControls.appendChild(offsetTable);
  app.appendChild(offsetControls);
}

async function render() {
  const app = document.getElementById("app");
  if (!app) return;
  try {
    app.innerHTML = `<h2>Athan & Iqamah Timings Adjuster</h2>`;
    // Column order UI (move to top, clearer label)
    const colOrderDiv = document.createElement('div');
    colOrderDiv.style.margin = '16px 0 8px 0';
    colOrderDiv.innerHTML = `<label for="colOrderSel"><b>Prayer columns order (all blocks):</b></label> <select id="colOrderSel">${columnOrderOptions.map(opt => `<option value="${opt.value}"${selectedColumnOrder === opt.value ? ' selected' : ''}>${opt.label}</option>`).join('')}</select>`;
    // Try to insert after the heading, else append
    const h2 = app.querySelector('h2');
    if (h2 && h2.nextSibling) {
      app.insertBefore(colOrderDiv, h2.nextSibling);
    } else {
      app.appendChild(colOrderDiv);
    }
    const colOrderSel = colOrderDiv.querySelector('#colOrderSel');
    if (colOrderSel) {
      colOrderSel.addEventListener('change', e => {
        selectedColumnOrder = e.target.value;
        localStorage.setItem('selectedColumnOrder', selectedColumnOrder);
        render();
      });
    }
    // Offset tolerance control UI (separate for negative and positive)
    const toleranceDiv = document.createElement("div");
    toleranceDiv.style.margin = "8px 0";
    toleranceDiv.innerHTML = `
      <b>Offset rounding tolerance:</b>
      <span style="margin-left:8px;">- (down):</span>
      <input type="number" id="offsetToleranceNegInput" min="0" max="10" step="1" value="${offsetToleranceNeg}" style="width:40px; text-align:center;">
      <span style="margin-left:8px;">+ (up):</span>
      <input type="number" id="offsetTolerancePosInput" min="0" max="10" step="1" value="${offsetTolerancePos}" style="width:40px; text-align:center;">
      <span style="color:#888; margin-left:8px;">(down: how close to round down, up: how close to round up)</span>
    `;
    app.appendChild(toleranceDiv);
    const tolNegInput = toleranceDiv.querySelector("#offsetToleranceNegInput");
    const tolPosInput = toleranceDiv.querySelector("#offsetTolerancePosInput");
    if (tolNegInput) {
      tolNegInput.addEventListener("change", e => {
        offsetToleranceNeg = Math.max(0, Math.min(10, Number(e.target.value)));
        localStorage.setItem("offsetToleranceNeg", offsetToleranceNeg);
        render();
      });
    }
    if (tolPosInput) {
      tolPosInput.addEventListener("change", e => {
        offsetTolerancePos = Math.max(0, Math.min(10, Number(e.target.value)));
        localStorage.setItem("offsetTolerancePos", offsetTolerancePos);
        render();
      });
    }
    const timings = await fetchAthanMonth();


    createCSVUpload(app, (csv) => {
      localStorage.setItem("uploadedCSV", csv);
      csvData = parseCSV(csv);
      render();
    });

    if (!timings || !Array.isArray(timings) || !timings.length) {
      app.innerHTML += `<p style='color:red'>No timings loaded. Please upload a CSV file.</p>`;
      return;
    }

    let weekStart = localStorage.getItem("iqamahWeekStart") || "Sunday";
    createWeekStartSelector(app, weekStart, (val) => {
      localStorage.setItem("iqamahWeekStart", val);
      render();
    });

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

  // Debug info toggle
    let showIqamahDebug = localStorage.getItem('showIqamahDebug') === 'true';
    const debugToggleDiv = document.createElement('div');
    debugToggleDiv.style.margin = '10px 0 0 0';
    const debugToggle = document.createElement('input');
    debugToggle.type = 'checkbox';
    debugToggle.id = 'toggleIqamahDebug';
    debugToggle.checked = showIqamahDebug;
    debugToggle.addEventListener('change', e => {
      localStorage.setItem('showIqamahDebug', debugToggle.checked);
      render();
    });
    debugToggleDiv.appendChild(debugToggle);
    const debugLabel = document.createElement('label');
    debugLabel.htmlFor = 'toggleIqamahDebug';
    debugLabel.textContent = ' Show Iqamah debug info (avg, offset, mins)';
    debugToggleDiv.appendChild(debugLabel);
    app.appendChild(debugToggleDiv);

  // Table for the whole month with grouped headers and merged Iqamah cells
    const table = document.createElement("table");
    table.className = "table";
  // Header row 1: Add an Offset column after each Iqamah
  let header1 = `<tr>
    <th rowspan='2'>Month</th>
    <th rowspan='2'>Date</th>
    <th rowspan='2'>Day</th>
    <th colspan='4' style='border-left:2px solid #888;border-right:2px solid #888;'>Fajr</th>
    <th rowspan='2' style='background:#f8f8f8;border-right:2px solid #888;'>Sunrise</th>
    <th colspan='4' style='border-right:2px solid #888;'>Dhuhr</th>
    <th colspan='4' style='border-right:2px solid #888;'>Asr</th>
    <th colspan='4' style='border-right:2px solid #888;'>Maghrib</th>
    <th colspan='4' style='border-right:2px solid #888;'>Isha</th>
  </tr>`;
  let header2 = `<tr>`;
  const colOrder = columnOrderOptions.find(opt => opt.value === selectedColumnOrder)?.order || ['Athan', 'Offset', 'Raw', 'Iqama'];
  for (let i = 0; i < prayers.length; ++i) {
    colOrder.forEach((col, j) => {
      let thStyle = '';
      if (i === 0 && j === 0) thStyle += 'border-left:2px solid #888;';
      // Apply thick right border to the last column of every prayer block
      if (j === colOrder.length - 1) {
        thStyle += 'border-right:2px solid #888;';
      } else {
        thStyle += 'border-right:1px solid #ccc;';
      }
      let thClass = col === 'Iqama' ? ' class="iqamah-col"' : '';
      let label = col === 'Raw' ? 'Raw Offset Time' : col;
      header2 += `<th${thClass} style='${thStyle}'>${label}</th>`;
    });
    // Do NOT insert Sunrise dynamically here
  }
  // Remove any extra Sunrise column at the end (if present)
  // (No code needed here if not explicitly added elsewhere)
  header2 += `</tr>`;
  table.innerHTML = header1 + header2;

  // Precompute weekly Iqamah times: for each week, use earliest Athan + offset (rounded), assign to all days in that week
  const iqamahTimesByPrayer = {};
  prayers.forEach(prayer => {
    // Restore weekly average Athan calculation for Iqamah
    if (!window.weekAthanListGlobal) window.weekAthanListGlobal = {};
    const weekAthanList = {};
    timings.forEach((t, idx) => {
      const weekNum = getWeekNum(t.Date);
      let athanTime = "";
      for (const col of csvPrayerMap[prayer]) {
        if (t[col]) {
          athanTime = t[col];
          break;
        } else if (t[col?.toLowerCase()]) {
          athanTime = t[col?.toLowerCase()];
          break;
        }
      }
      const athanMins = parseTime(athanTime);
      if (!isNaN(athanMins) && athanTime) {
        if (!(weekNum in weekAthanList)) weekAthanList[weekNum] = [];
        weekAthanList[weekNum].push(athanMins);
      }
    });
    window.weekAthanListGlobal[prayer] = weekAthanList;
    // Map: weekNum -> computed Iqamah time (string)
    const weekIqamah = {};
    Object.keys(weekAthanList).forEach(weekNum => {
      const athanArr = weekAthanList[weekNum];
      if (!athanArr || athanArr.length === 0) return;
      // Use the maximum (Athan + offset) for the week
      let selectedOffset = prayerOffsets[prayer] ?? defaultOffsets[prayer];
      let maxAthanPlusOffset = Math.max(...athanArr.map(a => a + selectedOffset));
      let iqamahMins = maxAthanPlusOffset;
      // Tolerance-based rounding: only round up if next multiple of 5 is within positive tolerance, else round down
      let mod = iqamahMins % 5;
      if (mod !== 0) {
        if (mod <= offsetToleranceNeg) {
          iqamahMins -= mod; // round down
        } else if ((5 - mod) <= offsetTolerancePos) {
          iqamahMins += (5 - mod); // round up to next 5-min
        } else {
          iqamahMins -= mod; // round down if not within positive tolerance
        }
      }
      weekIqamah[weekNum] = !isNaN(iqamahMins) ? formatTime(iqamahMins, true) : '';
    });
    iqamahTimesByPrayer[prayer] = timings.map((t, idx) => {
      // Fixed time override
      if (staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"]) {
        let override = staticIqamahOverrides[prayer]["all"];
        // If override is empty or not set, fall back to offset method
        if (!override || override.trim() === "") {
          const weekNum = getWeekNum(t.Date);
          return weekIqamah[weekNum] || '';
        }
        // Always require explicit AM/PM for all prayers
        if (!/AM|PM/i.test(override)) {
          if (prayer === "Fajr") override = override.trim() + " AM";
          else override = override.trim() + " PM";
        }
        return override;
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
    // Highlight the first row of each week
    const thisWeek = getWeekNum(t.Date);
    const prevWeek = rowIdx > 0 ? getWeekNum(timings[rowIdx - 1].Date) : null;
    if (rowIdx === 0 || thisWeek !== prevWeek) {
      row.style.background = '#ffeeba';
      row.style.boxShadow = '0 2px 8px 0 #e0c96a44';
      row.style.borderTop = '3px solid #bfa52a';
    }
    // For each prayer, render Athan, Iqamah, Offset
    let prayerCells = [];
    for (let i = 0; i < prayers.length; ++i) {
      let prayer = prayers[i];
      let athanTime = "";
      for (const col of csvPrayerMap[prayer]) {
        if (t[col]) {
          athanTime = t[col];
          break;
        } else if (t[col?.toLowerCase()]) {
          athanTime = t[col?.toLowerCase()];
          break;
        }
      }
      let selectedOffset = prayerOffsets[prayer] ?? defaultOffsets[prayer];
      let athanMins = parseTime(athanTime);
      let rawIqamah = (!isNaN(athanMins)) ? athanMins + selectedOffset : null;
      let iqamahStr = iqamahTimesByPrayer[prayer][rowIdx];
      let iqamahMins = parseTime(iqamahStr);
      let offsetVal = null;
      if (!isNaN(athanMins) && !isNaN(iqamahMins)) {
        offsetVal = iqamahMins - athanMins;
      }
      // Render columns in selected order
      colOrder.forEach((col, j) => {
        let tdStyle = '';
        if (i === 0 && j === 0) tdStyle += 'border-left:2px solid #888;';
        // Apply thick right border to the last column of every prayer block
        if (j === colOrder.length - 1) {
          tdStyle += 'border-right:2px solid #888;';
        } else {
          tdStyle += 'border-right:1px solid #ccc;';
        }
        if (col === 'Athan') {
          prayerCells.push(`<td style='${tdStyle}'>${athanTime}</td>`);
        } else if (col === 'Raw') {
          prayerCells.push(`<td style='${tdStyle}'>${rawIqamah !== null && !isNaN(rawIqamah) ? formatTime(Math.round(rawIqamah)) : ''}</td>`);
        } else if (col === 'Offset') {
          if (
            athanTime === '' || iqamahStr === '' ||
            isNaN(athanMins) || isNaN(iqamahMins) ||
            offsetVal === null || isNaN(offsetVal) || offsetVal < 0 || offsetVal > 120
          ) {
            prayerCells.push(`<td style='color:#b00;font-weight:bold;${tdStyle}'>N/A</td>`);
          } else {
            prayerCells.push(`<td style='${tdStyle}'>+${offsetVal} min</td>`);
          }
        } else if (col === 'Iqama') {
          if (iqamahRowspans[prayer][rowIdx] > 0) {
            prayerCells.push(`<td class='iqamah-col' rowspan='${iqamahRowspans[prayer][rowIdx]}' style='${tdStyle}'>${iqamahTimesByPrayer[prayer][rowIdx]}</td>`);
          } else {
            prayerCells.push(`<td class='iqamah-col' style='display:none;${tdStyle}'></td>`);
          }
        }
      });
    }
    // Insert Sunrise column only once, after Fajr block (first 4 cells)
    html += prayerCells.slice(0, 4).join('');
    html += `<td style='background:#f8f8f8;border-right:2px solid #888;'>${t["Sunrise"] || ""}</td>`;
    html += prayerCells.slice(4).join('');
    // Do NOT add any extra Sunrise column at the end
    // Remove any extra Sunrise column at the end (if present)
    row.innerHTML = html;
    // No bold for Sunday; highlight is enough
    if (dayStr === "Fri") {
      row.style.background = '#d6eaff'; // Light blue highlight for Friday
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
        if (timings[i][col]) {
          athanTime = timings[i][col];
          break;
        } else if (timings[i][col?.toLowerCase()]) {
          athanTime = timings[i][col?.toLowerCase()];
          break;
        }
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
  // Wrap table in a scrollable container
  const tableContainer = document.createElement('div');
  tableContainer.className = 'table-container';
  tableContainer.style.width = '100%';
  tableContainer.style.maxWidth = '100vw';
  tableContainer.style.margin = '0 auto';
  tableContainer.style.background = '#fff';
  tableContainer.appendChild(table);
    app.appendChild(tableContainer);
    // Add style for iqamah columns and center all table cells
    const style = document.createElement('style');
    style.textContent = `
      #app { width: 100vw !important; max-width: 100vw !important; box-sizing: border-box; }
      .iqamah-col { background: #e6ffe6; font-weight: bold; vertical-align: middle; }
      table.table td, table.table th { text-align: center; vertical-align: middle; }
      .table-container { width: 100%; max-width: 100vw; margin: 0 auto; overflow-x: auto; background: #fff; }
      table.table { width: 100%; min-width: 1600px; margin: 0 auto; border-collapse: collapse; }
      body { overflow-x: auto; }
    `;
    document.head.appendChild(style);
  } catch (err) {
    if (app) {
      app.innerHTML += `<div style='color:red; font-weight:bold;'>An error occurred: ${err.message}</div>`;
    }
    // Optionally log error to console
    console.error('Render error:', err);
  }
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
