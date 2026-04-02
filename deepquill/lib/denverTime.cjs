/** America/Denver calendar helpers (no external deps). */

const DENVER_TZ = 'America/Denver';

function formatDenverYmd(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Smallest UTC instant where Denver local date equals dateKey (YYYY-MM-DD). */
function startOfDenverDayUtc(dateKey) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  let lo = Date.UTC(y, mo - 1, d - 2, 0, 0, 0);
  let hi = Date.UTC(y, mo - 1, d + 2, 0, 0, 0);
  let ans = hi;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const k = formatDenverYmd(new Date(mid));
    if (k < dateKey) {
      lo = mid + 1;
    } else {
      ans = mid;
      hi = mid - 1;
    }
  }
  return new Date(ans);
}

/** First UTC instant of the *next* Denver calendar day after dateKey. */
function endOfDenverDayUtc(dateKey) {
  let t = startOfDenverDayUtc(dateKey).getTime();
  while (formatDenverYmd(new Date(t)) === dateKey) {
    t += 60 * 1000;
  }
  return new Date(t);
}

/** Previous full Denver calendar day relative to `now` (for nightly job). */
function previousDenverSummaryDateKey(now = new Date()) {
  const todayKey = formatDenverYmd(now);
  const startToday = startOfDenverDayUtc(todayKey);
  const probe = new Date(startToday.getTime() - 4 * 60 * 60 * 1000);
  return formatDenverYmd(probe);
}

module.exports = {
  DENVER_TZ,
  formatDenverYmd,
  startOfDenverDayUtc,
  endOfDenverDayUtc,
  previousDenverSummaryDateKey,
};
