import type { IsoDate } from '../../domain/types';

export interface WorkCalendar {
  workingWeekdays: number[];
  nonWorkingDates: IsoDate[];
}

const DAY = 86_400_000;

export const toDay = (iso: string): number => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / DAY);
export const fromDay = (day: number): IsoDate => new Date(day * DAY).toISOString().slice(0, 10);

export const workingDayTest = (cal: WorkCalendar) => {
  const weekdays = new Set(cal.workingWeekdays);
  const holidays = new Set(cal.nonWorkingDates.map(toDay));
  return (day: number) => weekdays.has(new Date(day * DAY).getUTCDay()) && !holidays.has(day);
};

export const workingDaysBetween = (cal: WorkCalendar, startDay: number, endDay: number): number => {
  const isWorking = workingDayTest(cal);
  let n = 0;
  for (let d = startDay + 1; d <= endDay; d++) if (isWorking(d)) n++;
  return n;
};

export const addWorkingDays = (cal: WorkCalendar, startDay: number, count: number): number => {
  const isWorking = workingDayTest(cal);
  let d = startDay;
  let left = count;
  while (left > 0) {
    d++;
    if (isWorking(d)) left--;
  }
  return d;
};

export const workingDaysInWindow = (cal: WorkCalendar, endDay: number, size: number): number[] => {
  const isWorking = workingDayTest(cal);
  const days: number[] = [];
  for (let d = endDay; days.length < size && d > endDay - size * 3; d--) if (isWorking(d)) days.push(d);
  return days.reverse();
};
