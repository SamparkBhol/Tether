const STRIPES = [
  'var(--ds-background-accent-blue-bolder, #0055cc)',
  'var(--ds-background-accent-teal-bolder, #206a83)',
  'var(--ds-background-accent-green-bolder, #1f845a)',
  'var(--ds-background-accent-orange-bolder, #a54800)',
  'var(--ds-background-accent-magenta-bolder, #943d73)',
  'var(--ds-background-accent-purple-bolder, #5e4db2)',
  'var(--ds-background-accent-lime-bolder, #4c6b1f)',
  'var(--ds-background-accent-red-bolder, #c9372c)',
  'var(--ds-background-accent-yellow-bolder, #7f5f01)',
];

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const livery = (teamId?: string | null) => STRIPES[hash(teamId ?? '') % STRIPES.length];

export type Sector = 'ahead' | 'pace' | 'tight' | 'behind' | 'none';

export const sector = (delta: number | null | undefined): Sector =>
  delta === null || delta === undefined ? 'none' : delta <= -3 ? 'ahead' : delta <= 0 ? 'pace' : delta <= 3 ? 'tight' : 'behind';

export const gapText = (delta: number | null | undefined) =>
  delta === null || delta === undefined ? '' : delta === 0 ? 'on the day' : delta > 0 ? `+${delta}d` : `${delta}d`;

export const sectorWords: Record<Sector, string> = {
  ahead: 'comfortably ahead of the promised date',
  pace: 'on pace for the promised date',
  tight: 'a few days behind the promised date',
  behind: 'well behind the promised date',
  none: 'not forecast yet',
};
