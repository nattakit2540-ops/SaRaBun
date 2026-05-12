import { appSettings } from "./firebase-config.js";

const COUNTER_KEY = "esaraban.counters";

export const workGroups = {
  bot: { code: "บท", name: "บริหารทั่วไป" },
  academic: { code: "วช", name: "วิชาการ" },
  budget: { code: "งบ", name: "งบประมาณ/การเงิน", fiscal: true },
  supply: { code: "พส", name: "พัสดุ", fiscal: true },
  hr: { code: "บค", name: "บุคคล" },
  student: { code: "กน", name: "กิจการนักเรียน" }
};

export function buddhistYear(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return date.getFullYear() + 543;
}

export function padRunning(value) {
  return String(value).padStart(3, "0");
}

function readCounters() {
  try {
    return JSON.parse(localStorage.getItem(COUNTER_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCounters(counters) {
  localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
}

export function counterKey(type, year, scope = "general") {
  return `${type}:${year}:${scope}`;
}

export function getNextLocalNumber(type, dateValue, scope = "general") {
  const year = buddhistYear(dateValue);
  const counters = readCounters();
  const key = counterKey(type, year, scope);
  counters[key] = (counters[key] || 0) + 1;
  writeCounters(counters);
  return { year, running: counters[key] };
}

export function formatOrderNumber(year, running) {
  return `คส.${year}/${padRunning(running)}`;
}

export function formatMemoNumber(groupKey, year, running, fiscalYearCode = "") {
  const group = workGroups[groupKey] || workGroups.bot;
  const base = `${group.code} ${padRunning(running)}/${year}`;
  return group.fiscal && fiscalYearCode ? `${base} · ${appSettings.fiscalYearCodePrefix}${fiscalYearCode}` : base;
}

export function formatOutgoingNumber(running) {
  return `ที่ ${appSettings.outgoingPrefix}/${padRunning(running)}`;
}

export function createKeywords(...parts) {
  return parts
    .join(" ")
    .toLowerCase()
    .split(/[\s,./·:;()]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}
