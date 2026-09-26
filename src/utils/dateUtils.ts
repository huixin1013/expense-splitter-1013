/**
 * Date and Week utilities for weekly expense tracking
 */

export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentDateISO(): string {
  return toISODate(new Date());
}

/**
 * Returns Monday (start of week) and Sunday (end of week) for a given date
 */
export function getWeekStartAndEnd(dateInput: Date | string): { start: Date; end: Date } {
  const date = typeof dateInput === 'string' ? parseISODate(dateInput) : new Date(dateInput);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday, etc.
  
  // Calculate distance to Monday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Returns a unique sortable key for the week, e.g. "2026-W38"
 */
export function getWeekKey(dateInput: Date | string): string {
  const { start } = getWeekStartAndEnd(dateInput);
  const year = start.getFullYear();
  
  // ISO week calculation
  const firstJan = new Date(year, 0, 1);
  const daysOffset = Math.floor((start.getTime() - firstJan.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((daysOffset + firstJan.getDay() + 1) / 7);
  
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

export function formatMonthDay(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export function formatWeekLabel(dateInput: Date | string): { label: string; isCurrentWeek: boolean } {
  const { start, end } = getWeekStartAndEnd(dateInput);
  const now = new Date();
  const currentWeek = getWeekStartAndEnd(now);
  
  const isCurrentWeek = toISODate(start) === toISODate(currentWeek.start);
  
  // Check if previous week
  const prevWeekMonday = new Date(currentWeek.start);
  prevWeekMonday.setDate(prevWeekMonday.getDate() - 7);
  const isLastWeek = toISODate(start) === toISODate(prevWeekMonday);

  const rangeStr = `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
  
  if (isCurrentWeek) {
    return { label: `This Week (${rangeStr})`, isCurrentWeek: true };
  } else if (isLastWeek) {
    return { label: `Last Week (${rangeStr})`, isCurrentWeek: false };
  }
  
  return { label: rangeStr, isCurrentWeek: false };
}

export function formatDisplayDate(dateStr: string): string {
  const date = parseISODate(dateStr);
  const today = new Date();
  const todayStr = toISODate(today);
  
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = toISODate(yesterday);

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]}, ${formatMonthDay(date)}`;
}
