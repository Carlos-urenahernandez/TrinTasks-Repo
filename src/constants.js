// Constants and configuration values

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const THEME_NAMES = ['theme-fern', 'theme-ocean', 'theme-sunset', 'theme-slate', 'theme-orchid', 'theme-midnight'];

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


// Keywords that indicate major assignments
export const MAJOR_ASSIGNMENT_KEYWORDS = /\b(test|quiz|exam|midterm|final|essay|paper|project|presentation|lab exam|oral exam)\b/i;

// Keywords that indicate an assignment
export const ASSIGNMENT_KEYWORDS = /\b(due|assignment|homework|task|read|submit|turn in)\b/i;
