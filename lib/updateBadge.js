const BRUSSELS_TIME_ZONE = "Europe/Brussels";
const WINDOWS = [10, 22]; // 10:00-10:59 and 22:00-22:59 local time

function getBrusselsParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRUSSELS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = {};
  for (const part of parts) {
    if (part.type !== "literal") byType[part.type] = part.value;
  }
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    second: Number(byType.second),
  };
}

function getBrusselsNowMs() {
  const p = getBrusselsParts();
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function toDateKey(brusselsMs) {
  const d = new Date(brusselsMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildWindowTimestamp(baseBrusselsMs, dayOffset, hour) {
  const d = new Date(baseBrusselsMs);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  const dateKey = toDateKey(d.getTime());
  const minuteInWindow = hashString(`${dateKey}-${hour}`) % 60;
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    hour,
    minuteInWindow,
    0
  );
}

function getLastHardUpdateMs(nowBrusselsMs) {
  const candidates = [
    buildWindowTimestamp(nowBrusselsMs, -1, WINDOWS[1]),
    buildWindowTimestamp(nowBrusselsMs, 0, WINDOWS[0]),
    buildWindowTimestamp(nowBrusselsMs, 0, WINDOWS[1]),
  ].filter((timestamp) => timestamp <= nowBrusselsMs);
  return candidates.length ? Math.max(...candidates) : nowBrusselsMs;
}

export function getHomeUpdatedBadgeText() {
  const nowBrusselsMs = getBrusselsNowMs();
  const lastHardUpdateMs = getLastHardUpdateMs(nowBrusselsMs);
  const hoursAgo = Math.max(0, Math.floor((nowBrusselsMs - lastHardUpdateMs) / (60 * 60 * 1000)));
  return `Updated ${hoursAgo} hours ago`;
}

