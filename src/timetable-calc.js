export function getWeekNum(dateStr, timings, weekStart) {
  const d = new Date(dateStr);
  let day = d.getDay();
  let weekStartIdx = {"Sunday":0, "Monday":1, "Saturday":6}[weekStart];
  const firstDate = new Date(timings[0].Date);
  
  // Calculate day difference using date components only (avoids DST issues)
  const dUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const firstUTC = Date.UTC(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
  let diff = Math.round((dUTC - firstUTC) / (1000*60*60*24));
  
  let firstDay = firstDate.getDay();
  let offset = (7 + day - weekStartIdx) % 7;
  let weekNum = Math.floor((diff - offset + (7 + firstDay - weekStartIdx) % 7) / 7);
  return weekNum;
}

export function roundToNearest(minutes, interval) {
  return Math.ceil(minutes / interval) * interval;
}
// Calculation and logic for offsets, iqamah, parsing, etc.


// ...more calculation logic will be moved here...
