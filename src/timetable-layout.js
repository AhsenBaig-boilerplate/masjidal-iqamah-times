// Modular timetable rendering function for use in app.js
// Attach to window for orchestration
export function renderTimetable(app, csvData, config) {
	// Destructure config FIRST
	const {
		prayers,
		csvPrayerMap,
		defaultOffsets,
		prayerOffsets = {},
		columnOrderOptions,
		selectedColumnOrder,
		prayerThresholds = {},
		staticIqamahOverrides
	} = config;

	// Precompute weekly Iqamah times for each prayer (dynamic, no hardcoded dates)
	const weekIqamahTimes = {};
	prayers.forEach(prayer => { weekIqamahTimes[prayer] = {}; });
	let weekStart = (typeof localStorage !== 'undefined' && localStorage.getItem('iqamahWeekStart')) ? localStorage.getItem('iqamahWeekStart') : 'Sunday';
	const weekStartIdx = {"Sunday":0, "Monday":1, "Saturday":6}[weekStart];
	window.debugLog(`[INIT] WeekStart: ${weekStart}, WeekStartIdx: ${weekStartIdx}`);
	window.debugLog(`[INIT] window.getWeekNum exists: ${typeof window.getWeekNum}`);
	window.debugLog(`[INIT] csvData length: ${csvData.length}`);
	
	if (typeof window.getWeekNum === 'function') {
		window.debugLog('[PRECOMPUTE START]');
		// First, group rows by week number and find the first day of each week
		const weekGroups = {}; // { weekNum: [rows] }
		csvData.forEach((row) => {
			let weekNum = window.getWeekNum(row.Date, csvData, weekStart);
			if (!weekGroups[weekNum]) weekGroups[weekNum] = [];
			weekGroups[weekNum].push(row);
		});
		window.debugLog(`[PRECOMPUTE] weekGroups keys: ${Object.keys(weekGroups).join(',')}, count: ${Object.keys(weekGroups).length}`);
		
		prayers.forEach(prayer => {
			Object.keys(weekGroups).forEach(weekNumStr => {
				const weekNum = Number(weekNumStr); // Convert to number for consistent keys
				const weekRows = weekGroups[weekNumStr];
				
				// DEBUG: Log all dates in this week group
				const weekDates = weekRows.map(r => r.Date).join(', ');
				window.debugLog(`[WEEK GROUP] Prayer: ${prayer}, WeekNum: ${weekNum}, Dates: ${weekDates}, Count: ${weekRows.length}`);
				
				// Find the row that is the actual first day of the week (matching weekStart)
				let firstDayRow = weekRows.find(row => {
					const d = new Date(row.Date);
					return d.getDay() === weekStartIdx;
				});
				// If no matching day (partial week), use the earliest date in the week
				if (!firstDayRow && weekRows.length > 0) {
					firstDayRow = weekRows.reduce((earliest, row) => {
						return new Date(row.Date) < new Date(earliest.Date) ? row : earliest;
					});
				}
				
				if (firstDayRow) {
					let selectedOffset = (prayerOffsets && typeof prayerOffsets[prayer] === 'number') ? prayerOffsets[prayer] : defaultOffsets[prayer];
					let tolNeg = prayerThresholds[prayer]?.neg ?? -2;
					let tolPos = prayerThresholds[prayer]?.pos ?? 3;
					
					let iqamahVal = null;
					if (staticIqamahOverrides && staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] && staticIqamahOverrides[prayer]["all"]) {
						// Fixed time override
						let fixed = staticIqamahOverrides[prayer]["all"];
						let time24 = fixed;
						if (fixed.match(/am|pm/i)) {
							let [t, period] = fixed.split(/\s+/);
							let [h, m] = t.split(":");
							h = Number(h);
							m = Number(m);
							if (/pm/i.test(period) && h < 12) h += 12;
							if (/am/i.test(period) && h === 12) h = 0;
							time24 = h.toString().padStart(2, '0') + ":" + m.toString().padStart(2, '0');
						}
						let [h, m] = time24.split(":");
						iqamahVal = Number(h) * 60 + Number(m);
					} else {
						// Get week start day's Athan time and all week's Athan times
						let weekStartAthan = "";
						for (const col of csvPrayerMap[prayer]) {
							if (firstDayRow[col]) {
								weekStartAthan = firstDayRow[col];
								break;
							} else if (firstDayRow[col?.toLowerCase()]) {
								weekStartAthan = firstDayRow[col?.toLowerCase()];
								break;
							}
						}
						let weekStartAthanMins = window.parseTime(weekStartAthan);
						
						// Get ALL Athan times in this week to calculate valid range
						let athanTimes = [];
						for (const row of weekRows) {
							let athanTime = "";
							for (const col of csvPrayerMap[prayer]) {
								if (row[col]) {
									athanTime = row[col];
									break;
								} else if (row[col?.toLowerCase()]) {
									athanTime = row[col?.toLowerCase()];
									break;
								}
							}
							let mins = window.parseTime(athanTime);
							if (!isNaN(mins)) athanTimes.push(mins);
						}
						
						// DEBUG: Show collected Athan times
						window.debugLog(`[WEEK ATHANS] Prayer: ${prayer}, WeekNum: ${weekNum}, Athan times: ${athanTimes.map(m => window.formatTime(m, true)).join(', ')}`);
						
						if (!isNaN(weekStartAthanMins) && athanTimes.length > 0) {
							// Find earliest and latest Athan in the week
							let minAthan = Math.min(...athanTimes);
							let maxAthan = Math.max(...athanTimes);
							
							// Calculate valid Iqamah range that respects boundaries for ALL days
							// For each day, offset must be in [Offset + Early, Offset + Late]
							// So for each Athan time A, Iqamah must be in [A + Offset + Early, A + Offset + Late]
							// To satisfy ALL days:
							//   Lower bound: max of all minimum requirements = maxAthan + Offset + Early
							//   Upper bound: min of all maximum requirements = minAthan + Offset + Late
							let lowerBound = maxAthan + selectedOffset + tolNeg;  // Latest Athan's minimum
							let upperBound = minAthan + selectedOffset + tolPos;  // Earliest Athan's maximum
							
							// Round to 5-min slot boundaries
							let minSlot = Math.ceil(lowerBound / 5) * 5;
							let maxSlot = Math.floor(upperBound / 5) * 5;
							
							// Calculate preferred time from week start day
							let rawTime = weekStartAthanMins + selectedOffset;
							let preferred = Math.round(rawTime / 5) * 5;
							
							// Check if valid range exists
							if (minSlot > maxSlot) {
								const rangeWidth = upperBound - lowerBound;
							window.debugLog(`[PRECOMPUTE ERROR] Prayer: ${prayer}, WeekNum: ${weekNum}, NO VALID 5-MIN SLOT! Valid Iqamah range ${window.formatTime(lowerBound, true)}-${window.formatTime(upperBound, true)} is only ${rangeWidth} min wide (Athan spread: ${maxAthan - minAthan} min). Threshold [-${Math.abs(tolNeg)},+${tolPos}] too tight. SAFETY FALLBACK: Using ${window.formatTime(minSlot, true)} to respect minimum offset (may exceed maximum by ${minSlot - upperBound} min for earliest Athan).`);
							// ALWAYS use minSlot to ensure we never violate minimum offset (safety requirement)
							// This prevents Iqamah from being too close to the latest Athan
								iqamahVal = minSlot;
							} else {
								// Clamp to valid range (ensures boundaries respected for ALL days)
								if (preferred < minSlot) preferred = minSlot;
								if (preferred > maxSlot) preferred = maxSlot;
								
								iqamahVal = preferred;
							}
							
							window.debugLog(`[PRECOMPUTE CALC] Prayer: ${prayer}, WeekNum: ${weekNum}, WeekStart: ${firstDayRow.Date}, Athan: ${weekStartAthan} (${weekStartAthanMins}), WeekRange: ${window.formatTime(minAthan, true)}-${window.formatTime(maxAthan, true)}, Offset: ${selectedOffset}, Threshold: [${tolNeg},+${tolPos}]`);
							window.debugLog(`[PRECOMPUTE ROUND] Prayer: ${prayer}, WeekNum: ${weekNum}, Raw: ${window.formatTime(rawTime, true)}, Preferred: ${window.formatTime(Math.round(rawTime / 5) * 5, true)}, ValidRange: ${window.formatTime(lowerBound, true)}-${window.formatTime(upperBound, true)}, ValidSlots: ${window.formatTime(minSlot, true)}-${window.formatTime(maxSlot, true)}, Final: ${window.formatTime(iqamahVal, true)}`);
						}
					}
					weekIqamahTimes[prayer][weekNum] = iqamahVal;
					window.debugLog(`[PRECOMPUTE] Prayer: ${prayer}, WeekNum: ${weekNum} (${typeof weekNum}), Iqamah: ${iqamahVal}, FirstDay: ${firstDayRow.Date}`);
				}
			});
		});
		window.debugLog('[PRECOMPUTE END] Summary:', JSON.stringify(Object.keys(weekIqamahTimes).reduce((acc, prayer) => { acc[prayer] = Object.keys(weekIqamahTimes[prayer]); return acc; }, {})));
	} else {
		window.debugError('[ERROR] window.getWeekNum is not a function! Type:', typeof window.getWeekNum);
	}
	// Remove any existing timetable
	const oldTable = app.querySelector('.timetable-table');
	if (oldTable) oldTable.remove();

		// Table setup with Tailwind classes
		const table = document.createElement('table');
		table.className = [
		'timetable-table',
		'min-w-full',
		'border',
		'border-gray-300',
		'rounded-lg',
			'dark:text-gray-100',
			'dark:border-gray-700'
		].join(' ');




	// Header rows

	let header1 = `<tr>
		<th rowspan='2' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700">Month</th>
		<th rowspan='2' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700">Date</th>
		<th rowspan='2' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700">Day</th>`;
	prayers.forEach((prayer, i) => {
		// Add thick border after each prayer block for clear separation
		const borderClass = 'border-r-4 border-gray-800 dark:border-gray-100';
		header1 += `<th colspan='4' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700 ${borderClass}">${prayer}</th>`;
		if (prayer === 'Fajr') {
			header1 += `<th rowspan='2' class="bg-yellow-100 dark:bg-yellow-900 font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700 border-r-4 border-gray-800 dark:border-gray-100 dark:text-yellow-300">Sunrise</th>`;
		}
	});
	header1 += `</tr>`;


	let header2 = `<tr>`;
	const colOrder = columnOrderOptions.find(opt => opt.value === selectedColumnOrder)?.order || ['Athan', 'Iqamah', 'Offset', 'Raw'];
	prayers.forEach((prayer, i) => {
		colOrder.forEach((col, j) => {
			let label = col === 'Raw' ? 'Raw<br>Offset<br>Time' : col;
			// Add thick border to last col of each prayer block
			const borderClass = j === colOrder.length - 1
				? 'border-r-4 border-gray-800 dark:border-gray-100'
				: '';
			header2 += `<th class="bg-gray-50 dark:bg-gray-700 font-medium px-2 py-1 border-b border-gray-200 dark:border-gray-700 ${borderClass}">${label}</th>`;
		});
		// Do NOT add extra sunrise-col header cell (fixes column shift)
	});
	header2 += `</tr>`;

	table.innerHTML = `<thead>${header1}${header2}</thead><tbody></tbody>`;
	const tbody = table.querySelector('tbody');

	// Precompute rowspan data for Iqamah column merging
	// rowspanData[rowIdx][prayer] = { shouldRender: bool, rowspan: number }
	const rowspanData = {};
	prayers.forEach(prayer => {
		let currentIqamahValue = null;
		let spanStartIdx = null;
		let spanCount = 0;
		
		csvData.forEach((row, idx) => {
			const weekNum = window.getWeekNum(row.Date, csvData, weekStart);
			const iqamahMins = weekIqamahTimes[prayer]?.[weekNum] ?? null;
			const iqamahStr = (iqamahMins !== null && !isNaN(iqamahMins)) ? window.formatTime(iqamahMins, true) : null;
			
			if (!rowspanData[idx]) rowspanData[idx] = {};
			
			// Check if value changed or we're at week boundary (week number changed)
			const prevWeekNum = idx > 0 ? window.getWeekNum(csvData[idx - 1].Date, csvData, weekStart) : -1;
			const isNewWeek = (weekNum !== prevWeekNum);
			
			if (iqamahStr !== currentIqamahValue || isNewWeek) {
				// Finalize previous span
				if (spanStartIdx !== null && spanCount > 0) {
					rowspanData[spanStartIdx][prayer].rowspan = spanCount;
				}
				// Start new span
				currentIqamahValue = iqamahStr;
				spanStartIdx = idx;
				spanCount = 1;
				rowspanData[idx][prayer] = { shouldRender: true, rowspan: 1 };
			} else {
				// Continue current span
				spanCount++;
				rowspanData[idx][prayer] = { shouldRender: false };
			}
		});
		
		// Finalize last span
		if (spanStartIdx !== null && spanCount > 0) {
			rowspanData[spanStartIdx][prayer].rowspan = spanCount;
		}
	});

	// Render each row
	csvData.forEach((row, idx) => {
		let dateObj = new Date(row.Date);
		const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		const dayStr = days[dateObj.getDay()];
		const monthStr = months[dateObj.getMonth()];
		let html = `<td class="px-2 py-1 border-b border-gray-200 dark:border-gray-700">${monthStr}</td><td class="px-2 py-1 border-b border-gray-200 dark:border-gray-700">${row.Date.split("/")[1]}</td><td class="px-2 py-1 border-b border-gray-200 dark:border-gray-700">${dayStr}</td>`;
		   prayers.forEach((prayer) => {
			   let athanTime = "";
			   for (const col of csvPrayerMap[prayer]) {
				   if (row[col]) {
					   athanTime = row[col];
					   break;
				   } else if (row[col?.toLowerCase()]) {
					   athanTime = row[col?.toLowerCase()];
					   break;
				   }
			   }
			   let selectedOffset = (prayerOffsets && typeof prayerOffsets[prayer] === 'number') ? prayerOffsets[prayer] : defaultOffsets[prayer];
			   let weekNum = 0;
			   if (typeof window.getWeekNum === 'function') {
				   weekNum = window.getWeekNum(row.Date, csvData, weekStart);
			   }
			   window.debugLog(`[RENDER] Date: ${row.Date}, Prayer: ${prayer}, WeekNum: ${weekNum} (${typeof weekNum}), weekStart: ${weekStart}`);
			   let athanMins = window.parseTime(athanTime);
			   let rawIqamahMins = (!isNaN(athanMins)) ? athanMins + selectedOffset : null;
			   // --- Iqamah Calculation Logic ---
			   // Use precomputed weekly Iqamah time (already handles fixed time and offset+rounding)
			   let iqamahMins = weekIqamahTimes[prayer][weekNum] !== undefined ? weekIqamahTimes[prayer][weekNum] : null;
			   window.debugLog(`[LOOKUP] Prayer: ${prayer}, WeekNum: ${weekNum}, Found: ${weekIqamahTimes[prayer][weekNum]}, AllKeys: ${Object.keys(weekIqamahTimes[prayer]).join(',')}`);
		   
		   // SAFETY CHECK: Ensure Iqamah is never before Athan (can happen with fixed times)
		   if (iqamahMins !== null && !isNaN(athanMins) && iqamahMins < athanMins) {
			   window.debugError(`[SAFETY] Prayer: ${prayer}, Date: ${row.Date}, Iqamah (${window.formatTime(iqamahMins, true)}) is BEFORE Athan (${window.formatTime(athanMins, true)}). Adjusting to Athan + 5 min.`);
			   iqamahMins = Math.ceil((athanMins + 5) / 5) * 5; // Athan + 5 min, rounded to 5-min slot
		   }
		   
		   let iqamahStr = (iqamahMins !== null && !isNaN(iqamahMins)) ? window.formatTime(iqamahMins, true) : 'N/A';
		   
		   // Calculate actual offset for THIS row (used for emoji feedback)
		   let offsetVal = null;
		   if (!isNaN(athanMins) && !isNaN(iqamahMins)) {
			   offsetVal = iqamahMins - athanMins;
		   }
		   
		   // Emoji logic for offset feedback (visual only, doesn't affect calculation)
		   // Check if ACTUAL offset is within the threshold range
		   let emoji = '';
		   let emojiTitle = '';
		   if (offsetVal !== null && !staticIqamahOverrides[prayer]?.useFixed) {
			   let tolNeg = prayerThresholds[prayer]?.neg ?? -2;
			   let tolPos = prayerThresholds[prayer]?.pos ?? 3;
			   let minAllowed = selectedOffset + tolNeg;
			   let maxAllowed = selectedOffset + tolPos;
			   if (offsetVal < minAllowed) {
				   let diff = minAllowed - offsetVal;
				   let newThreshold = tolNeg - diff;
				   let newOffset = selectedOffset + diff;
				   emoji = '⬅️';
				   emojiTitle = `Actual offset (${offsetVal} min) is ${diff} min below allowed range [${minAllowed}, ${maxAllowed}].\n💡 Fix options:\n  1) Expand threshold: Set 'Early' to ${newThreshold} (currently ${tolNeg})\n  2) Adjust offset: Set to ${newOffset} min (currently ${selectedOffset})\nRecommended: Adjust threshold to accommodate weekly variation.`;
			   } else if (offsetVal > maxAllowed) {
				   let diff = offsetVal - maxAllowed;
				   let newThreshold = tolPos + diff;
				   let newOffset = selectedOffset - diff;
				   emoji = '➡️';
				   emojiTitle = `Actual offset (${offsetVal} min) is ${diff} min above allowed range [${minAllowed}, ${maxAllowed}].\n💡 Fix options:\n  1) Expand threshold: Set 'Late' to +${newThreshold} (currently +${tolPos})\n  2) Adjust offset: Set to ${newOffset} min (currently ${selectedOffset})\nRecommended: Adjust threshold to accommodate weekly variation.`;
			   } else {
				   emoji = '✅';
				   emojiTitle = `✅ Offset (${offsetVal} min) is within range ${minAllowed}-${maxAllowed} min.\nCurrent settings: Offset=${selectedOffset}, Threshold=${tolNeg} to +${tolPos}`;
			   }
		   }
			   
			colOrder.forEach((col, j) => {
				let tdClass = 'px-2 py-1 border-b border-gray-200 dark:border-gray-700';
				if (col === 'Athan') tdClass += ' text-blue-700 dark:text-blue-300';
				else if (col === 'Raw') tdClass += ' text-gray-700 dark:text-gray-300';
				else if (col === 'Offset') tdClass += ' text-yellow-800 dark:text-yellow-200';
				else if (col === 'Iqamah') tdClass += ' font-semibold text-green-700 dark:text-green-300';
				// Add thick border to last col of each prayer block for clear separation
				if (j === colOrder.length - 1) tdClass += ' border-r-4 border-gray-800 dark:border-gray-100';
				// Friday row: force bg and text color on every cell but preserve borders
				if (dayStr === "Fri") {
				  tdClass = 'px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-green-900 text-white';
				  if (j === colOrder.length - 1) tdClass += ' border-r-4 border-gray-800 dark:border-gray-100';
				}
				   let cellContent = '';
				   // Fix Dhuhr CSV bug: if athan time is 1:00 or 1:01 and no AM/PM, assume PM
				   let athanDisplay = athanMins;
				   if (prayer === 'Dhuhr' && athanTime && !/am|pm/i.test(athanTime)) {
					   let [h, m] = athanTime.split(':');
					   if ((h === '1' || h === '01') && (m.startsWith('0') || m.startsWith('1'))) {
						   athanDisplay = 13 * 60 + Number(m);
					   }
				   }
				   if (col === 'Athan') cellContent = window.formatTime(athanDisplay, true);
				   else if (col === 'Raw') cellContent = (rawIqamahMins !== null && !isNaN(rawIqamahMins) ? window.formatTime(rawIqamahMins, true) : '');
				   else if (col === 'Offset') {
					   if (offsetVal !== null && !isNaN(offsetVal)) {
						   let sign = offsetVal > 0 ? '+' : (offsetVal < 0 ? '−' : '');
						   cellContent = `${sign}${Math.abs(offsetVal)} min`;
					   } else {
						   cellContent = 'N/A';
					   }
				   if (emoji) {
					   const escapedTitle = emojiTitle.replace(/'/g, "&apos;");
					   cellContent += ` <span title='${escapedTitle}' style='cursor:help;'>${emoji}</span>`;
				   }
				   }
				   else if (col === 'Iqamah') {
					   const renderInfo = rowspanData[idx]?.[prayer];
					   if (!renderInfo || !renderInfo.shouldRender) {
						   // Skip this cell - it's part of a rowspan from above
						   return;
					   }
					   
					   // Render with rowspan if needed
					   const rowspanAttr = renderInfo.rowspan > 1 ? ` rowspan='${renderInfo.rowspan}'` : '';
					   
					   if (iqamahStr && iqamahStr !== 'N/A') {
						   cellContent = iqamahStr;
					   } else {
						   cellContent = `N/A <span class='debug-error' title='Debug: athanMins=${athanMins}, offset=${selectedOffset}, weekIqamah=${weekIqamahTimes[prayer][weekNum]}'>[${athanMins},${selectedOffset},${weekIqamahTimes[prayer][weekNum]}]</span>`;
					   }
					   html += `<td class='${tdClass.trim()}'${rowspanAttr}>${cellContent}</td>`;
					   return; // Early return to skip the default cell rendering below
				   }
				   html += `<td class='${tdClass.trim()}'>${cellContent}</td>`;
			});
			if (prayer === 'Fajr') {
				if (dayStr === 'Fri') {
				  html += `<td class="bg-green-900 dark:text-yellow-300 border-b border-gray-200 dark:border-gray-700 border-r-4 border-gray-800 dark:border-gray-100 sunrise-text">${row["Sunrise"] || ""}</td>`;
				} else {
				  html += `<td class="bg-yellow-100 border-b border-gray-200 dark:border-gray-700 border-r-4 border-gray-800 dark:border-gray-100 dark:text-yellow-300 sunrise-text">${row["Sunrise"] || ""}</td>`;
				}
			}
		});
		// Tailwind highlight classes
		let trClass = [
			(idx === 0 || (idx > 0 && new Date(row.Date).getDay() === 0)) ? 'border-t-4 border-indigo-600 dark:border-indigo-400' : '',
			(idx % 2 === 0) ? 'even:bg-gray-50' : 'odd:bg-white'
		].filter(Boolean).join(' ');
		const tr = document.createElement('tr');
		tr.className = trClass;
		tr.innerHTML = html;
		tbody.appendChild(tr);
	});
	// Remove any existing table-container
	const appContainer = document.getElementById('app-container') || app.parentElement;
	let oldTableContainer = appContainer.querySelector('.table-container');
	if (oldTableContainer) oldTableContainer.remove();
	
	// Wrap table in a scrollable container with position: relative for sticky clone
	const tableContainer = document.createElement('div');
	tableContainer.className = 'table-container';
	tableContainer.style.position = 'relative';
	tableContainer.appendChild(table);
	appContainer.appendChild(tableContainer);
	
	// JavaScript-based sticky header (more reliable than CSS for complex tables with rowspan)
	let stickyHeaderTable = null;
	
	function createStickyHeader() {
		// Remove old sticky header if exists
		if (stickyHeaderTable) {
			stickyHeaderTable.remove();
		}
		
		// Create a new table with just the cloned header
		stickyHeaderTable = document.createElement('table');
		stickyHeaderTable.className = table.className + ' sticky-header-clone';
		const theadClone = table.querySelector('thead').cloneNode(true);
		stickyHeaderTable.appendChild(theadClone);
		
		// Style the sticky header table
		stickyHeaderTable.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			margin: 0;
			visibility: hidden;
			pointer-events: none;
			z-index: 100;
		`;
		
		tableContainer.appendChild(stickyHeaderTable);
		
		// Sync column widths
		syncHeaderWidths();
	}
	
	function syncHeaderWidths() {
		if (!stickyHeaderTable) return;
		const originalCells = table.querySelectorAll('thead th');
		const clonedCells = stickyHeaderTable.querySelectorAll('thead th');
		originalCells.forEach((cell, i) => {
			if (clonedCells[i]) {
				clonedCells[i].style.width = cell.offsetWidth + 'px';
				clonedCells[i].style.minWidth = cell.offsetWidth + 'px';
				clonedCells[i].style.maxWidth = cell.offsetWidth + 'px';
			}
		});
	}
	
	// Show/hide sticky header based on scroll
	tableContainer.addEventListener('scroll', () => {
		if (!stickyHeaderTable) return;
		const scrollTop = tableContainer.scrollTop;
		const scrollLeft = tableContainer.scrollLeft;
		
		if (scrollTop > 0) {
			stickyHeaderTable.style.visibility = 'visible';
			stickyHeaderTable.style.transform = `translate(${-scrollLeft}px, ${scrollTop}px)`;
		} else {
			stickyHeaderTable.style.visibility = 'hidden';
		}
	});
	
	// Initialize and sync on resize
	createStickyHeader();
	window.addEventListener('resize', () => {
		setTimeout(syncHeaderWidths, 50);
	});
}

// Attach to window for app.js to call
if (typeof window !== 'undefined') {
	window.renderTimetable = renderTimetable;
}
export function createCSVUpload(app, onUpload) {
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

export function createWeekStartSelector(app, weekStart, onChange) {
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

export function createOffsetControls(app, prayers, prayerOffsets, staticIqamahOverrides, prayerThresholds, onOffsetChange, onFixedChange, onThresholdChange) {
	const offsetControls = document.createElement("div");
	offsetControls.innerHTML = `<b>Set Iqamah Method:</b>`;
	
	const offsetTable = document.createElement("table");
	offsetTable.style.margin = '10px 0 20px 0';
	offsetTable.style.borderCollapse = 'collapse';
	offsetTable.style.width = 'auto';
	offsetTable.innerHTML = `<tr>
		<th style='padding:4px 12px;'>Prayer</th>
		<th style='padding:4px 12px;'>Method & Value</th>
		<th style='padding:4px 12px;'>Offset Threshold (±min)</th>
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
			<input type="checkbox" style="width:22px; height:22px; display:none;" ${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? "checked" : ""}>
			<span class="toggle-slider ${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? 'active' : ''}"></span>
		`;
		const toggleInput = methodToggle.querySelector('input[type="checkbox"]');
		const slider = methodToggle.querySelector('.toggle-slider');
		if (toggleInput && slider) {
			slider.innerHTML = `<span class="toggle-slider-handle ${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? 'active' : 'inactive'}"></span>`;
			toggleInput.addEventListener('change', () => {
				if (!staticIqamahOverrides[prayer]) staticIqamahOverrides[prayer] = {};
				staticIqamahOverrides[prayer]["useFixed"] = toggleInput.checked;
				localStorage.setItem("staticIqamahOverrides", JSON.stringify(staticIqamahOverrides));
				onFixedChange(prayer, staticIqamahOverrides[prayer]["all"]);
			});
		}
		tdMethod.appendChild(methodToggle);
		// Offset input
		const offsetWrapper = document.createElement('div');
		offsetWrapper.style.display = staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? 'none' : 'inline-flex';
		offsetWrapper.style.alignItems = 'center';
		offsetWrapper.style.gap = '6px';
		offsetWrapper.style.marginLeft = '16px';
		offsetWrapper.innerHTML = `<span class="input-label">+ min</span>`;
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
		offsetInput.value = (prayerOffsets[prayer] ?? 0);
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
		fixedWrapper.innerHTML = `<span class="input-label">Time</span>`;
		const timeInput = document.createElement('input');
		timeInput.type = 'time';
		timeInput.step = 300; // 5 min
		timeInput.style.width = '80px';
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
		ampmBtn.className = 'ampm-btn';
		ampmBtn.textContent = curPeriod;
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
		
		// Toggle visibility based on method selection
		toggleInput.addEventListener('change', () => {
			offsetWrapper.style.display = toggleInput.checked ? 'none' : 'inline-flex';
			fixedWrapper.style.display = toggleInput.checked ? 'inline-flex' : 'none';
			const sliderDot = slider.querySelector('.toggle-slider-handle');
			if (sliderDot) {
				sliderDot.classList.toggle('active', toggleInput.checked);
				sliderDot.classList.toggle('inactive', !toggleInput.checked);
			}
			slider.classList.toggle('active', toggleInput.checked);
			methodToggle.querySelector('span:first-child').textContent = toggleInput.checked ? 'Fixed Time' : 'Offset from Athan';
		});
		
		tr.appendChild(tdMethod);
		
		// Threshold controls column
		const tdThreshold = document.createElement('td');
		tdThreshold.style.padding = '4px 12px';
		
		const thresholdWrapper = document.createElement('div');
		thresholdWrapper.className = 'threshold-wrapper';
		if (staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"]) {
			thresholdWrapper.classList.add('disabled');
		}
		
		// Early threshold (negative)
		const earlyGroup = document.createElement('div');
		earlyGroup.className = 'threshold-group';
		
		const earlyLabel = document.createElement('span');
		earlyLabel.className = 'threshold-label';
		earlyLabel.textContent = 'Early';
		
		const earlyStepper = document.createElement('div');
		earlyStepper.className = 'threshold-stepper';
		
		const negDecBtn = document.createElement('button');
		negDecBtn.className = 'threshold-btn';
		negDecBtn.textContent = '−';
		negDecBtn.title = 'Decrease early threshold';
		
		const negValue = document.createElement('span');
		negValue.className = 'threshold-value';
		negValue.textContent = prayerThresholds[prayer]?.neg ?? -2;
		
		const negIncBtn = document.createElement('button');
		negIncBtn.className = 'threshold-btn';
		negIncBtn.textContent = '+';
		negIncBtn.title = 'Increase early threshold';
		
		earlyStepper.appendChild(negDecBtn);
		earlyStepper.appendChild(negValue);
		earlyStepper.appendChild(negIncBtn);
		
		earlyGroup.appendChild(earlyLabel);
		earlyGroup.appendChild(earlyStepper);
		
		// Separator
		const separator = document.createElement('span');
		separator.className = 'threshold-separator';
		separator.textContent = '→';
		
		// Late threshold (positive)
		const lateGroup = document.createElement('div');
		lateGroup.className = 'threshold-group';
		
		const lateLabel = document.createElement('span');
		lateLabel.className = 'threshold-label';
		lateLabel.textContent = 'Late';
		
		const lateStepper = document.createElement('div');
		lateStepper.className = 'threshold-stepper';
		
		const posDecBtn = document.createElement('button');
		posDecBtn.className = 'threshold-btn';
		posDecBtn.textContent = '−';
		posDecBtn.title = 'Decrease late threshold';
		
		const posValue = document.createElement('span');
		posValue.className = 'threshold-value';
		posValue.textContent = prayerThresholds[prayer]?.pos ?? 3;
		
		const posIncBtn = document.createElement('button');
		posIncBtn.className = 'threshold-btn';
		posIncBtn.textContent = '+';
		posIncBtn.title = 'Increase late threshold';
		
		lateStepper.appendChild(posDecBtn);
		lateStepper.appendChild(posValue);
		lateStepper.appendChild(posIncBtn);
		
		lateGroup.appendChild(lateLabel);
		lateGroup.appendChild(lateStepper);
		
		// Unit label
		const unitLabel = document.createElement('span');
		unitLabel.className = 'threshold-unit';
		unitLabel.textContent = 'min';
		
		// Event handlers
		negDecBtn.addEventListener('click', () => {
			let val = Math.max(-30, Number(negValue.textContent) - 1);
			negValue.textContent = val;
			onThresholdChange(prayer, val, Number(posValue.textContent));
		});
		
		negIncBtn.addEventListener('click', () => {
			let val = Math.min(0, Number(negValue.textContent) + 1);
			negValue.textContent = val;
			onThresholdChange(prayer, val, Number(posValue.textContent));
		});
		
		posDecBtn.addEventListener('click', () => {
			let val = Math.max(0, Number(posValue.textContent) - 1);
			posValue.textContent = val;
			onThresholdChange(prayer, Number(negValue.textContent), val);
		});
		
		posIncBtn.addEventListener('click', () => {
			let val = Math.min(30, Number(posValue.textContent) + 1);
			posValue.textContent = val;
			onThresholdChange(prayer, Number(negValue.textContent), val);
		});
		
		thresholdWrapper.appendChild(earlyGroup);
		thresholdWrapper.appendChild(separator);
		thresholdWrapper.appendChild(lateGroup);
		thresholdWrapper.appendChild(unitLabel);
		
		tdThreshold.appendChild(thresholdWrapper);
		
		// Update threshold visibility when method changes
		toggleInput.addEventListener('change', () => {
			if (toggleInput.checked) {
				thresholdWrapper.classList.add('disabled');
			} else {
				thresholdWrapper.classList.remove('disabled');
			}
		});
		
		tr.appendChild(tdThreshold);
		offsetTable.appendChild(tr);
	});
	offsetControls.appendChild(offsetTable);
	app.appendChild(offsetControls);
}
// DOM/table rendering and UI helpers

// ...layout and rendering logic will be moved here...
