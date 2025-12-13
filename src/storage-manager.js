// Storage Manager - Handles Chrome local storage operations

import { ICalParser } from './ical-parser.js';

/**
 * Save events to Chrome storage
 * @param {string} url - The iCal URL
 * @param {Array} events - Array of events to save
 */
export async function saveToStorage(url, events) {
  try {
    // Load existing completed assignments
    const data = await chrome.storage.local.get(['completedAssignments']);
    const completedAssignments = data.completedAssignments || {};

    // Merge completion status with events
    events = events.map(event => {
      const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;
      if (completedAssignments[eventId]) {
        event.isCompleted = true;
        event.completedDate = completedAssignments[eventId].completedDate;
      }
      return event;
    });

    await chrome.storage.local.set({
      icalUrl: url,
      events: events,
      lastUpdated: new Date().toISOString()
    });
    console.log('Data saved to storage');
  } catch (error) {
    console.error('Failed to save to storage:', error);
  }
}

/**
 * Load saved data from Chrome storage
 * @returns {Promise<{url: string, events: Array, pinnedAssignments: Object, lastRefreshSummary: Object}|null>}
 */
export async function loadSavedData() {
  try {
    const data = await chrome.storage.local.get([
      'icalUrl',
      'events',
      'completedAssignments',
      'lastRefreshSummary',
      'pinnedAssignments'
    ]);

    if (data.icalUrl && data.events) {
      // Merge completion status with cached events
      const completedAssignments = data.completedAssignments || {};
      const cachedEvents = mergeCompletionStatus(data.events, completedAssignments);

      return {
        url: data.icalUrl,
        events: cachedEvents,
        pinnedAssignments: data.pinnedAssignments || {},
        lastRefreshSummary: data.lastRefreshSummary
      };
    }
  } catch (error) {
    console.error('Failed to load from storage:', error);
  }
  return null;
}

/**
 * Merge completion status into events array
 * @param {Array} events - Array of events
 * @param {Object} completedAssignments - Map of completed assignment IDs
 * @returns {Array} Events with completion status merged
 */
export function mergeCompletionStatus(events, completedAssignments) {
  const completed = completedAssignments || {};
  return (events || []).map(event => {
    const merged = { ...event };
    const eventId = merged.uid || `${merged.title}_${merged.dueRaw || merged.startRaw}`;
    if (completed[eventId]) {
      merged.isCompleted = true;
      merged.completedDate = completed[eventId].completedDate;
    } else {
      merged.isCompleted = false;
      merged.completedDate = null;
    }
    return merged;
  });
}

/**
 * Toggle pin status for an assignment
 * @param {Object} event - The event to pin/unpin
 * @param {Object} currentPinned - Current pinned assignments object
 * @returns {Promise<{pinnedAssignments: Object, isPinned: boolean}>}
 */
export async function togglePinAssignment(event, currentPinned) {
  const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

  // Load existing pinned assignments
  const data = await chrome.storage.local.get(['pinnedAssignments']);
  const pinnedAssignments = data.pinnedAssignments || {};

  let isPinned;
  if (pinnedAssignments[eventId]) {
    // Unpin
    delete pinnedAssignments[eventId];
    isPinned = false;
  } else {
    // Pin
    pinnedAssignments[eventId] = {
      title: event.title,
      dueRaw: event.dueRaw,
      startRaw: event.startRaw,
      dueTime: event.dueTime,
      startTime: event.startTime,
      pinnedDate: new Date().toISOString()
    };
    isPinned = true;
  }

  await chrome.storage.local.set({ pinnedAssignments });
  return { pinnedAssignments, isPinned };
}

/**
 * Toggle completion status for an assignment
 * @param {Object} event - The event to toggle
 * @returns {Promise<{isCompleted: boolean, completedDate: string|null}>}
 */
export async function toggleAssignmentComplete(event) {
  const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

  // Load existing completed assignments
  const data = await chrome.storage.local.get(['completedAssignments']);
  const completedAssignments = data.completedAssignments || {};

  let isCompleted;
  let completedDate = null;

  if (event.isCompleted) {
    // Mark as incomplete
    delete completedAssignments[eventId];
    isCompleted = false;
  } else {
    // Mark as complete
    completedDate = new Date().toISOString();
    completedAssignments[eventId] = {
      completedDate,
      title: event.title
    };
    isCompleted = true;
  }

  await chrome.storage.local.set({ completedAssignments });
  return { isCompleted, completedDate };
}

/**
 * Listen for storage changes
 * @param {Function} callback - Callback function(changes, areaName)
 */
export function listenForStorageChanges(callback) {
  chrome.storage.onChanged.addListener(callback);
}

/**
 * Refresh calendar data locally (fallback when background refresh fails)
 * @param {string} url - The iCal URL
 * @returns {Promise<{added: number, updated: number, removed: number}>}
 */
export async function refreshLocally(url) {
  const data = await chrome.storage.local.get(['events', 'completedAssignments']);
  const previousEvents = data.events || [];
  const completedAssignments = data.completedAssignments || {};

  const newEvents = await ICalParser.fetchAndParse(url);

  const prevMap = new Map();
  previousEvents.forEach(ev => {
    const id = ev.uid || `${ev.title}_${ev.dueRaw || ev.startRaw}`;
    prevMap.set(id, ev);
  });

  const nextEvents = [];
  let added = 0;
  let updated = 0;

  newEvents.forEach(ev => {
    const id = ev.uid || `${ev.title}_${ev.dueRaw || ev.startRaw}`;
    const prev = prevMap.get(id);
    if (!prev) {
      added++;
    } else {
      const prevClone = { ...prev };
      delete prevClone.isCompleted;
      delete prevClone.completedDate;
      const currClone = { ...ev };
      if (JSON.stringify(prevClone) !== JSON.stringify(currClone)) {
        updated++;
      }
    }
    if (completedAssignments[id]) {
      ev.isCompleted = true;
      ev.completedDate = completedAssignments[id].completedDate;
    }
    nextEvents.push(ev);
  });

  const nextIds = new Set(nextEvents.map(ev => ev.uid || `${ev.title}_${ev.dueRaw || ev.startRaw}`));
  let removed = 0;
  previousEvents.forEach(ev => {
    const id = ev.uid || `${ev.title}_${ev.dueRaw || ev.startRaw}`;
    if (!nextIds.has(id)) {
      removed++;
      delete completedAssignments[id];
    }
  });

  await chrome.storage.local.set({
    events: nextEvents,
    completedAssignments,
    lastUpdated: new Date().toISOString(),
    lastRefreshSummary: {
      added,
      updated,
      removed,
      timestamp: Date.now()
    }
  });

  return { added, updated, removed };
}

/**
 * Clear all reminder alarms
 */
export async function clearAllReminderAlarms() {
  try {
    const alarms = await new Promise(resolve => chrome.alarms.getAll(resolve));
    const reminderAlarms = alarms.filter(a => a.name && a.name.startsWith('reminder_'));

    for (const alarm of reminderAlarms) {
      await chrome.alarms.clear(alarm.name);
    }

    // Also clear stored reminders and history
    await chrome.storage.local.set({
      reminders: {},
      reminderHistory: {}
    });

    console.log(`Cleared ${reminderAlarms.length} reminder alarms`);
  } catch (err) {
    console.error('Failed to clear reminder alarms:', err);
  }
}

/**
 * Clear all stored data
 */
export async function clearAllData() {
  await chrome.storage.local.clear();
}

/**
 * Load settings from storage
 * @returns {Promise<Object>} Settings object
 */
export async function loadSettings() {
  const data = await chrome.storage.local.get([
    'autoRefresh',
    'enableReminders',
    'reminderHours',
    'reminderSettings',
    'theme',
    'uiStyle',
    'showMajorAssignmentsBar',
    'subjectTags'
  ]);

  return {
    autoRefresh: data.autoRefresh || false,
    enableReminders: data.enableReminders !== false,
    reminderHours: (data.reminderSettings && data.reminderSettings.hours) || data.reminderHours || 24,
    theme: data.theme || 'slate',
    uiStyle: data.uiStyle || 'neobrutalism',
    showMajorAssignmentsBar: data.showMajorAssignmentsBar === true,
    subjectTags: data.subjectTags || {}
  };
}

/**
 * Save settings to storage
 * @param {Object} settings - Settings to save
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({
    autoRefresh: settings.autoRefresh,
    enableReminders: settings.enableReminders,
    reminderHours: settings.reminderHours,
    theme: settings.theme,
    uiStyle: settings.uiStyle,
    reminderSettings: {
      enabled: settings.enableReminders,
      hours: settings.reminderHours
    },
    showMajorAssignmentsBar: settings.showMajorAssignmentsBar
  });
}

/**
 * Save subject tags to storage
 * @param {Object} subjectTags - Subject tags to save
 */
export async function saveSubjectTags(subjectTags) {
  await chrome.storage.local.set({ subjectTags });
}

/**
 * Save custom event order for a specific date
 * @param {string} dateKey - Date key in YYYYMMDD format
 * @param {Array} eventIds - Ordered array of event IDs
 */
export async function saveEventOrder(dateKey, eventIds) {
  const data = await chrome.storage.local.get(['eventOrder']);
  const eventOrder = data.eventOrder || {};
  eventOrder[dateKey] = eventIds;
  await chrome.storage.local.set({ eventOrder });
}

/**
 * Load custom event order for a specific date
 * @param {string} dateKey - Date key in YYYYMMDD format
 * @returns {Promise<Array|null>} Ordered array of event IDs or null
 */
export async function loadEventOrder(dateKey) {
  const data = await chrome.storage.local.get(['eventOrder']);
  const eventOrder = data.eventOrder || {};
  return eventOrder[dateKey] || null;
}
