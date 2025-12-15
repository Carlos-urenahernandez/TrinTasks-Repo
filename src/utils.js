// Utility helper functions

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - The text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Convert URLs in text to clickable links
 * @param {string} text - The text to process
 * @returns {string} Text with URLs converted to anchor tags
 */
export function linkifyText(text) {
  if (!text) return '';
  // First escape HTML
  const escaped = escapeHtml(text);
  // URL regex pattern - matches http(s), www, and common domains
  const urlPattern = /(\bhttps?:\/\/[^\s<>"{}|\\^`[\]]+|\bwww\.[^\s<>"{}|\\^`[\]]+)/gi;
  return escaped.replace(urlPattern, (url) => {
    let href = url;
    // Add protocol if missing (for www. links)
    if (url.toLowerCase().startsWith('www.')) {
      href = 'https://' + url;
    }
    // Truncate display text if too long
    let displayUrl = url;
    if (displayUrl.length > 50) {
      displayUrl = displayUrl.substring(0, 47) + '...';
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="event-link">${displayUrl}</a>`;
  });
}

/**
 * Remove class prefix from title to get clean assignment name
 * @param {string} title - The full title with class prefix
 * @returns {string} Clean title without prefix
 */
export function getCleanTitle(title) {
  if (!title) return '';

  // Helper to clean trailing standalone numbers (like page numbers "Assignment 123")
  // but NOT numbers in a list/sequence (like "59, 60, 61" or "Problems 1-5")
  const cleanTrailingNumber = (str) => {
    // Only remove if it's a standalone number at the end (not preceded by comma, dash, or another digit)
    // This preserves: "59, 60, 61", "1-5", "Chapter 3"
    // But removes: "Assignment 12345" (5+ digit numbers likely to be IDs)
    return str.replace(/\s+\d{5,}$/, '').trim();
  };

  // Pattern: optional "ADV. ", class name with optional subtitle/semester, " - SECTION: ", then content
  const cleanMatch = title.match(/^(?:ADV\.\s+)?[A-Z][A-Z0-9\s:\/]+-\s*[A-Z0-9]+:\s*(.+)$/i);
  if (cleanMatch) {
    return cleanTrailingNumber(cleanMatch[1].trim());
  }

  // Fallback: split on last colon to handle titles that have multiple colons
  const lastColon = title.lastIndexOf(':');
  if (lastColon !== -1 && lastColon < title.length - 1) {
    const after = title.substring(lastColon + 1).trim();
    return cleanTrailingNumber(after);
  }

  // Another fallback: split on the first ' - ' occurrence
  const dashIdx = title.indexOf(' - ');
  if (dashIdx !== -1 && dashIdx < title.length - 1) {
    const after = title.substring(dashIdx + 3).trim();
    return cleanTrailingNumber(after);
  }

  // Final fallback: only remove very long trailing numbers (likely IDs)
  return cleanTrailingNumber(title);
}

/**
 * Get human-readable time ago string
 * @param {Date} date - The date to compare
 * @returns {string} Human-readable time difference
 */
export function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;

  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

/**
 * Format time string for display
 * @param {string} timeStr - The time string to format
 * @returns {string} Formatted time string
 */
export function formatTimeForDisplay(timeStr) {
  // If it's already nicely formatted, return as is
  if (!timeStr || timeStr.includes(',')) {
    return timeStr;
  }

  // For simple date format YYYY-MM-DD
  if (timeStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = timeStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  return timeStr;
}

/**
 * Get the start of the week (Sunday) for a given date
 * @param {Date} date - The date to get week start for
 * @returns {Date} Start of the week
 */
export function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Extract course name from title
 * @param {string} title - The full title
 * @returns {string} Course name
 */
export function getCourseName(title) {
  if (!title) return '';
  // Find last colon which typically separates course info from the assignment title
  const lastColon = title.lastIndexOf(':');
  if (lastColon === -1) {
    // No colon found; fallback to entire title minus trailing numbers
    return title.replace(/\s+\d+$/, '').trim();
  }
  const coursePart = title.substring(0, lastColon).trim();
  // Trim any trailing separators
  return coursePart.replace(/[\-:;\|\/]\s*$/, '').trim();
}
