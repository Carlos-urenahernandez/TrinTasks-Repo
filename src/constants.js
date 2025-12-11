// Constants and configuration values

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const THEME_NAMES = ['theme-fern', 'theme-ocean', 'theme-sunset', 'theme-slate', 'theme-orchid', 'theme-midnight', 'theme-serenity'];

// Default colors for subject tags - spread out in hue to avoid similar-looking shades
export const DEFAULT_SUBJECT_COLORS = [
  '#e63946', // red
  '#f77f00', // orange
  '#e9c46a', // yellow
  '#2a9d8f', // teal
  '#118ab2', // blue
  '#8338ec', // purple
  '#ff006e', // magenta
  '#8ac926', // lime
  '#06d6a0', // mint
  '#b56576', // rose brown
  '#3d405b', // slate
  '#ffb703'  // amber
];

// Serenity theme base palettes for different times of day
export const SERENITY_PALETTES = {
  dawn: {
    pageBg: '#e9effc',
    surface: '#fdfdff',
    textMain: '#0f1b2d',
    textMuted: '#47607c',
    headerBg: '#213b63',
    headerText: '#eef3ff',
    accent: '#8cbdf5',
    accentStrong: '#5d8ed9',
    accentContrast: '#0d1a2b',
    cardBg: '#f2f6ff',
    cardBorder: '#d6e2f3',
    toastBg: '#213b63'
  },
  morning: {
    pageBg: '#eaf7f2',
    surface: '#ffffff',
    textMain: '#10303a',
    textMuted: '#4a6a6f',
    headerBg: '#1b4b5a',
    headerText: '#f1fbff',
    accent: '#5ac4b5',
    accentStrong: '#339d8f',
    accentContrast: '#072521',
    cardBg: '#f1f9f6',
    cardBorder: '#cfe7de',
    toastBg: '#1b4b5a'
  },
  day: {
    pageBg: '#eaf3fb',
    surface: '#ffffff',
    textMain: '#102a43',
    textMuted: '#48617a',
    headerBg: '#1f3b57',
    headerText: '#f1f5ff',
    accent: '#7cb7ff',
    accentStrong: '#4a90e2',
    accentContrast: '#0b1a2c',
    cardBg: '#f2f7fc',
    cardBorder: '#d7e4f2',
    toastBg: '#1f3b57'
  },
  golden: {
    pageBg: '#fff4e5',
    surface: '#fffaf4',
    textMain: '#40260a',
    textMuted: '#7c5530',
    headerBg: '#8a4b1d',
    headerText: '#fff8ec',
    accent: '#f2a65e',
    accentStrong: '#e9803a',
    accentContrast: '#1f1206',
    cardBg: '#fff1e3',
    cardBorder: '#f3d3b4',
    toastBg: '#8a4b1d'
  },
  evening: {
    pageBg: '#f3ebff',
    surface: '#fdfbff',
    textMain: '#251b33',
    textMuted: '#5a4d6f',
    headerBg: '#382a55',
    headerText: '#f4ecff',
    accent: '#b28cf6',
    accentStrong: '#8b6be2',
    accentContrast: '#150d22',
    cardBg: '#f2ecff',
    cardBorder: '#ded3f5',
    toastBg: '#382a55'
  },
  night: {
    pageBg: '#0d1222',
    surface: '#131a2b',
    textMain: '#e4ecf7',
    textMuted: '#b3c0d6',
    headerBg: '#0b162a',
    headerText: '#e4ecf7',
    accent: '#5ea4ff',
    accentStrong: '#3b7dd6',
    accentContrast: '#0b162a',
    cardBg: '#101829',
    cardBorder: '#1f2a3c',
    toastBg: '#0b162a'
  }
};

// Keywords that indicate major assignments
export const MAJOR_ASSIGNMENT_KEYWORDS = /\b(test|quiz|exam|midterm|final|essay|paper|project|presentation|lab exam|oral exam)\b/i;

// Keywords that indicate an assignment
export const ASSIGNMENT_KEYWORDS = /\b(due|assignment|homework|task|read|submit|turn in)\b/i;
