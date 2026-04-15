// Modular timetable rendering function for use in app.js
// Attach to window for orchestration
export function renderTimetable(app, csvData, config) {
	// Remove any existing timetable
	const oldTable = app.querySelector('.timetable-table');
	if (oldTable) oldTable.remove();

	// Destructure config
	const {
		prayers,
		csvPrayerMap,
		defaultOffsets,
		columnOrderOptions,
		selectedColumnOrder,
		offsetToleranceNeg,
		offsetTolerancePos,
		staticIqamahOverrides
	} = config;

		// Table setup with Tailwind classes
		const table = document.createElement('table');
		table.className = [
			'min-w-full',
			'border',
			'border-gray-300',
			'rounded-lg',
			'overflow-hidden',
			'bg-white',
			'text-sm',
			'shadow',
			'dark:bg-gray-900',
			'dark:text-gray-100',
			'dark:border-gray-700'
		].join(' ');




	// Header rows

	let header1 = `<tr>
		<th rowspan='2' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700">Month</th>
		<th rowspan='2' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700">Date</th>
		<th rowspan='2' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700">Day</th>`;
	prayers.forEach((prayer, i) => {
		// Add thick right border after each prayer block
		const borderClass = i === prayers.length - 1
			? 'border-r-4 border-blue-400'
			: 'border-r-2 border-gray-300';
		header1 += `<th colspan='4' class="bg-green-700 dark:bg-green-900 text-white font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700 ${borderClass}">${prayer}</th>`;
		if (prayer === 'Fajr') {
			header1 += `<th rowspan='2' class="bg-yellow-100 dark:bg-yellow-900 font-semibold px-3 py-2 border-b border-gray-300 dark:border-gray-700 border-r-4 border-yellow-400 dark:text-yellow-300">Sunrise</th>`;
		}
	});
	header1 += `</tr>`;

	let header2 = `<tr>`;
	const colOrder = columnOrderOptions.find(opt => opt.value === selectedColumnOrder)?.order || ['Athan', 'Offset', 'Raw', 'Iqama'];
	prayers.forEach((prayer, i) => {
		colOrder.forEach((col, j) => {
			let label = col === 'Raw' ? 'Raw<br>Offset<br>Time' : col;
			// Add thick right border to last col of each block
			const borderClass = j === colOrder.length - 1
			  ? 'border-r-2 border-blue-400'
			  : '';
			header2 += `<th class="bg-gray-50 dark:bg-gray-700 font-medium px-2 py-1 border-b border-gray-200 dark:border-gray-700 ${borderClass}">${label}</th>`;
		});
		// Do NOT add extra sunrise-col header cell (fixes column shift)
	});
	header2 += `</tr>`;

	table.innerHTML = `<thead>${header1}${header2}</thead><tbody></tbody>`;
	const tbody = table.querySelector('tbody');

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
			let selectedOffset = defaultOffsets[prayer];
			let athanMins = parseInt(athanTime.split(':')[0] || 0) * 60 + parseInt(athanTime.split(':')[1] || 0);
			let rawIqamah = (!isNaN(athanMins)) ? athanMins + selectedOffset : null;
			let iqamahStr = athanTime && !isNaN(athanMins) ? athanTime : '';
			let iqamahMins = athanMins;
			let offsetVal = null;
			if (!isNaN(athanMins) && !isNaN(iqamahMins)) {
				offsetVal = iqamahMins - athanMins;
			}
			colOrder.forEach((col, j) => {
				let tdClass = 'px-2 py-1 border-b border-gray-200 dark:border-gray-700';
				if (col === 'Athan') tdClass += ' text-blue-700 dark:text-blue-300';
				else if (col === 'Raw') tdClass += ' text-gray-700 dark:text-gray-300';
				else if (col === 'Offset') tdClass += ' text-yellow-800 dark:text-yellow-200';
				else if (col === 'Iqama') tdClass += ' font-semibold text-green-700 dark:text-green-300';
				// Add thick right border to last col of each block
				if (j === colOrder.length - 1) tdClass += ' border-r-2 border-blue-400';
				// Friday row: force bg and text color on every cell
				if (dayStr === "Fri") {
				  tdClass = 'px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-green-900 text-white';
				}
				let cellContent = '';
				if (col === 'Athan') cellContent = athanTime;
				else if (col === 'Raw') cellContent = (rawIqamah !== null && !isNaN(rawIqamah) ? Math.floor(rawIqamah/60)+":"+(rawIqamah%60).toString().padStart(2,'0') : '');
				else if (col === 'Offset') cellContent = (offsetVal !== null && !isNaN(offsetVal) ? "+"+offsetVal+" min" : 'N/A');
				else if (col === 'Iqama') cellContent = iqamahStr;
				html += `<td class='${tdClass.trim()}'>${cellContent}</td>`;
			});
			if (prayer === 'Fajr') {
				if (dayStr === 'Fri') {
				  html += `<td class="bg-green-900 dark:text-yellow-300 border-b border-gray-200 dark:border-gray-700 border-r-4 border-yellow-400 font-bold" style="color: rgb(87,82,56);">${row["Sunrise"] || ""}</td>`;
				} else {
				  html += `<td class="bg-yellow-100 font-bold border-b border-gray-200 dark:border-gray-700 border-r-4 border-yellow-400 dark:text-yellow-300" style="color: rgb(87,82,56);">${row["Sunrise"] || ""}</td>`;
				}
			}
		});
		// Tailwind highlight classes
		let trClass = [
			(idx === 0 || (idx > 0 && new Date(row.Date).getDay() === 0)) ? 'border-t-4 border-blue-400' : '',
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
	// Wrap table in a scrollable container
	const tableContainer = document.createElement('div');
	tableContainer.className = 'table-container';
	tableContainer.appendChild(table);
	appContainer.appendChild(tableContainer);
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

export function createOffsetControls(app, prayers, prayerOffsets, staticIqamahOverrides, onOffsetChange, onFixedChange) {
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
			slider.style.background = staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? '#007bff' : '#ccc';
			slider.style.position = 'relative';
			slider.style.transition = 'background 0.2s';
			slider.innerHTML = `<span style="position:absolute;left:${staticIqamahOverrides[prayer] && staticIqamahOverrides[prayer]["useFixed"] ? '18px' : '2px'};top:2px;width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 1px 4px #0002;transition:left 0.2s;"></span>`;
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
		fixedWrapper.innerHTML = `<span style="color:#888;">Time</span>`;
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
// DOM/table rendering and UI helpers

// ...layout and rendering logic will be moved here...
