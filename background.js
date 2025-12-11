// Background service worker for TrinTasks

// Set up periodic alarms on install/startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkUpcomingAssignments', { periodInMinutes: 30 });
  chrome.alarms.create('refreshCalendar', { periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('checkUpcomingAssignments', { periodInMinutes: 30 });
  chrome.alarms.create('refreshCalendar', { periodInMinutes: 30 });
});

// Single consolidated alarm listener for all alarm types
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm fired:', alarm.name);

  if (alarm.name === 'checkUpcomingAssignments') {
    await checkUpcomingAssignments();
  } else if (alarm.name === 'refreshCalendar') {
    await refreshCalendarData();
  } else if (alarm.name.startsWith('reminder_')) {
    await handleReminderAlarm(alarm);
  }
});

// Handle reminder alarm - show notification
async function handleReminderAlarm(alarm) {
  console.log('handleReminderAlarm called for:', alarm.name);

  try {
    const data = await chrome.storage.local.get(['reminders', 'reminderHistory']);
    const reminders = data.reminders || {};
    const reminderHistory = data.reminderHistory || {};
    const reminder = reminders[alarm.name];

    console.log('Reminder data:', reminder);

    if (reminder) {
      // Get the icon URL - try multiple approaches
      let iconUrl;
      try {
        iconUrl = chrome.runtime.getURL('icon-128.png');
        console.log('Icon URL:', iconUrl);
      } catch (e) {
        console.warn('Failed to get icon URL:', e);
        iconUrl = 'icon-128.png';
      }

      // Create notification - simplified version without buttons for better compatibility
      // Buttons have limited support on Mac OS X
      const notificationOptions = {
        type: 'basic',
        iconUrl: iconUrl,
        title: 'TrinTasks - Assignment Reminder',
        message: reminder.message || 'You have an upcoming assignment!',
        priority: 2,
        requireInteraction: true
      };

      console.log('Creating notification with options:', JSON.stringify(notificationOptions));

      // Use Promise wrapper for better error handling
      const notificationId = await new Promise((resolve, reject) => {
        chrome.notifications.create(alarm.name, notificationOptions, (id) => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.error('Notification create error:', err.message);
            reject(new Error(err.message));
          } else {
            console.log('Notification created with ID:', id);
            resolve(id);
          }
        });
      });

      // Store success result
      await chrome.storage.local.set({
        lastNotificationResult: {
          id: notificationId,
          status: 'ok',
          error: null,
          timestamp: Date.now(),
          message: 'Notification displayed successfully'
        }
      });

      // Remember we sent this reminder so we don't re-create it
      reminderHistory[alarm.name] = true;

      // Remove the used reminder
      delete reminders[alarm.name];
      await chrome.storage.local.set({ reminders, reminderHistory });

      console.log('Reminder processed successfully');
    } else {
      console.warn('No reminder data found for alarm:', alarm.name);
      await chrome.storage.local.set({
        lastNotificationResult: {
          status: 'error',
          error: 'No reminder data found for alarm: ' + alarm.name,
          timestamp: Date.now()
        }
      });
    }
  } catch (err) {
    console.error('Error handling reminder alarm:', err);
    await chrome.storage.local.set({
      lastNotificationResult: {
        status: 'error',
        error: err.message || String(err),
        timestamp: Date.now()
      }
    });
  }
}

// Check for upcoming assignments and schedule reminders
async function checkUpcomingAssignments() {
  try {
    const data = await chrome.storage.local.get(['events', 'completedAssignments', 'reminderSettings', 'reminders', 'reminderHistory']);
    const events = data.events || [];
    const completedAssignments = data.completedAssignments || {};
    const settings = data.reminderSettings || { enabled: true, hours: 24 };
    const reminders = data.reminders || {};
    const reminderHistory = data.reminderHistory || {};

    if (!settings.enabled) {
      console.log('Reminders disabled, skipping check');
      return;
    }

    const now = Date.now();
    const leadHours = parseInt(settings.hours, 10) || 24;
    let scheduledCount = 0;

    // Use for...of loop instead of forEach to properly handle async
    for (const event of events) {
      // Skip if not an assignment or already completed
      if (!event.isAssignment || event.isCompleted) continue;

      const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

      // Skip if already completed
      if (completedAssignments[eventId]) continue;

      // Calculate time until due
      const dueTimestamp = ICalDateToTimestamp(event.dueRaw || event.startRaw);
      const timeUntilDue = dueTimestamp - now;

      // Skip overdue
      if (timeUntilDue <= 0) continue;

      const intervalMs = leadHours * 60 * 60 * 1000;
      const targetTime = dueTimestamp - intervalMs;
      const reminderId = `reminder_${eventId}_${leadHours}h`;

      // Skip if already reminded
      if (reminderHistory[reminderId]) continue;

      // Skip if already scheduled
      if (reminders[reminderId]) continue;

      if (targetTime <= now) {
        // If we're already past the target but before due, trigger soon
        // Chrome requires minimum 0.5 minutes for alarms
        reminders[reminderId] = {
          eventId,
          title: event.title,
          message: `${event.title} is due in ${leadHours} hours!`,
          dueTime: event.dueTime,
          intervalHours: leadHours
        };
        reminderHistory[reminderId] = true;
        chrome.alarms.create(reminderId, { delayInMinutes: 0.5 });
        scheduledCount++;
        console.log('Scheduled immediate reminder for:', event.title);
      } else {
        // Schedule for the future (minimum 0.5 minutes)
        const delayMinutes = Math.max((targetTime - now) / (1000 * 60), 0.5);
        reminders[reminderId] = {
          eventId,
          title: event.title,
          message: `${event.title} is due in ${leadHours} hours!`,
          dueTime: event.dueTime,
          intervalHours: leadHours
        };
        chrome.alarms.create(reminderId, { delayInMinutes: delayMinutes });
        scheduledCount++;
        console.log('Scheduled future reminder for:', event.title, 'in', Math.round(delayMinutes), 'minutes');
      }
    }

    await chrome.storage.local.set({ reminders, reminderHistory });
    console.log('checkUpcomingAssignments complete. Scheduled:', scheduledCount, 'reminders');
  } catch (err) {
    console.error('Error in checkUpcomingAssignments:', err);
  }
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  console.log('Notification button clicked:', notificationId, 'button:', buttonIndex);

  if (notificationId.startsWith('reminder_')) {
    // Extract the actual eventId from the reminder ID format: reminder_${eventId}_${leadHours}h
    // We need to remove 'reminder_' prefix AND the '_XXh' suffix
    const withoutPrefix = notificationId.replace('reminder_', '');
    const lastUnderscoreIdx = withoutPrefix.lastIndexOf('_');
    const eventId = lastUnderscoreIdx > 0 ? withoutPrefix.substring(0, lastUnderscoreIdx) : withoutPrefix;

    if (buttonIndex === 0) {
      // Mark as complete
      const data = await chrome.storage.local.get(['completedAssignments', 'reminders']);
      const completedAssignments = data.completedAssignments || {};
      const reminders = data.reminders || {};
      const reminder = reminders[notificationId];

      completedAssignments[eventId] = {
        completedDate: new Date().toISOString(),
        title: reminder ? reminder.title : 'Completed via reminder'
      };

      await chrome.storage.local.set({ completedAssignments });
      chrome.notifications.clear(notificationId);
      console.log('Marked complete:', eventId);
    } else if (buttonIndex === 1) {
      // Snooze for 1 hour - reload reminder data first
      const data = await chrome.storage.local.get(['reminders']);
      const reminders = data.reminders || {};
      const originalReminder = reminders[notificationId];

      // Create a new snooze reminder
      const snoozeId = `${notificationId}_snooze_${Date.now()}`;
      if (originalReminder) {
        reminders[snoozeId] = {
          ...originalReminder,
          message: `SNOOZED: ${originalReminder.title} - reminder snoozed 1 hour`
        };
      } else {
        reminders[snoozeId] = {
          eventId,
          title: 'Snoozed Reminder',
          message: 'Assignment reminder (snoozed)',
          intervalHours: 1
        };
      }

      await chrome.storage.local.set({ reminders });
      chrome.alarms.create(snoozeId, { delayInMinutes: 60 });
      chrome.notifications.clear(notificationId);
      console.log('Snoozed reminder for 1 hour:', snoozeId);
    }
  }
});

// Also handle notification click (not just buttons)
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Notification clicked:', notificationId);
  // Just clear the notification when clicked
  chrome.notifications.clear(notificationId);
});

async function refreshCalendarData(overrideUrl, isManualRefresh = false) {
  try {
    const data = await chrome.storage.local.get(['icalUrl', 'events', 'completedAssignments']);
    const icalUrl = overrideUrl || data.icalUrl;
    if (!icalUrl) {
      console.log('No iCal URL configured, skipping refresh');
      return null;
    }

    const previousEvents = data.events || [];
    const completedAssignments = data.completedAssignments || {};

    console.log('Refreshing calendar from:', icalUrl);
    const newEvents = await ICalParser.fetchAndParse(icalUrl);

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
        // Detect meaningful changes ignoring completion fields
        const prevClone = { ...prev };
        delete prevClone.isCompleted;
        delete prevClone.completedDate;
        const currClone = { ...ev };
        if (JSON.stringify(prevClone) !== JSON.stringify(currClone)) {
          updated++;
        }
      }
      // Preserve completion if present
      if (completedAssignments[id]) {
        ev.isCompleted = true;
        ev.completedDate = completedAssignments[id].completedDate;
      }
      nextEvents.push(ev);
    });

    // Removed events: present before but not now
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
    console.log(`Calendar refreshed: +${added}, updated ${updated}, removed ${removed}`);
    return { added, updated, removed, timestamp: Date.now() };
  } catch (err) {
    console.error('Failed to refresh calendar in background:', err.message);
    // Store error info for debugging
    await chrome.storage.local.set({
      lastRefreshError: {
        message: err.message,
        timestamp: Date.now()
      }
    });
    // Only throw for manual refreshes so user sees the error
    // For automatic background refreshes, fail silently
    if (isManualRefresh) {
      throw err;
    }
    return null;
  }
}

// Allow popup to request an immediate refresh when opened
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.action === 'refreshCalendarNow') {
    const overrideUrl = message.icalUrl || null;
    if (overrideUrl) {
      chrome.storage.local.set({ icalUrl: overrideUrl });
    }
    // Manual refresh from popup - pass true to throw errors
    refreshCalendarData(overrideUrl, true)
      .then(summary => sendResponse({ success: true, summary }))
      .catch(error => sendResponse({ success: false, error: error?.message || 'Unknown error' }));
    return true; // keep the message channel open for async response
  }

  if (message && message.action === 'triggerTestReminder') {
    const leadHours = parseInt(message.leadHours, 10) || 24;
    const reminderId = `reminder_test_${Date.now()}`;
    // Chrome requires minimum 0.5 minutes (30 seconds) for alarms
    const delayMinutes = 0.5;
    const fireAt = Date.now() + (delayMinutes * 60 * 1000);
    console.log('triggerTestReminder received', { leadHours, reminderId, delayMinutes, fireAt });

    chrome.storage.local.get(['reminders', 'reminderHistory']).then(data => {
      const reminders = data.reminders || {};
      const reminderHistory = data.reminderHistory || {};

      reminders[reminderId] = {
        eventId: 'test',
        title: 'Test Reminder',
        message: `If you see this notification, reminders are working. Lead time setting: ${leadHours}h.`,
        dueTime: new Date(Date.now() + leadHours * 60 * 60 * 1000).toLocaleString(),
        intervalHours: leadHours
      };

      // Ensure test reminders are allowed to fire even if run multiple times
      delete reminderHistory[reminderId];

      const scheduledInfo = {
        status: 'scheduled',
        message: `Test reminder scheduled for ~30 seconds from now`,
        alarm: reminderId,
        timestamp: Date.now()
      };

      chrome.storage.local.set({ reminders, reminderHistory, lastNotificationResult: scheduledInfo }).then(() => {
        // Use delayInMinutes which is more reliable than absolute 'when'
        chrome.alarms.create(reminderId, { delayInMinutes: delayMinutes });
        console.log('Test alarm created:', reminderId);
        sendResponse({ success: true, alarm: reminderId, when: fireAt });
      }).catch(err => {
        console.error('Failed to save test reminder:', err);
        sendResponse({ success: false, error: err?.message || 'Failed to save test reminder' });
      });
    }).catch(err => {
      console.error('Failed to get storage for test reminder:', err);
      sendResponse({ success: false, error: err?.message || 'Failed to create test reminder' });
    });
    return true; // keep channel open
  }
});

// Minimal iCal parser (based on popup logic) for background refresh
class ICalParser {
  static parseICalContent(icalContent) {
    const events = [];
    const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let eventMatch;
    while ((eventMatch = eventRegex.exec(icalContent)) !== null) {
      const eventData = eventMatch[1];
      const event = this.parseEvent(eventData);
      if (event) events.push(event);
    }
    return events;
  }

  static parseEvent(eventData) {
    const event = {};

    let match = eventData.match(/SUMMARY:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      let title = match[1].replace(/\r?\n[ \t]/g, '');
      title = title.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
      title = title.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
      title = title.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&quot;/g, '"')
                   .replace(/&#39;/g, "'")
                   .replace(/&nbsp;/g, ' ')
                   .replace(/&ndash;/g, '–')
                   .replace(/&mdash;/g, '—')
                   .replace(/&ldquo;/g, '"')
                   .replace(/&rdquo;/g, '"')
                   .replace(/&lsquo;/g, "'")
                   .replace(/&rsquo;/g, "'");
      event.title = this.decodeText(title.trim());
    } else {
      event.title = 'Untitled Event';
    }

    const hasKeywords = /\b(due|assignment|homework|test|quiz|exam|project|paper|lab|presentation|read|watch|complete|finish|study)\b/i.test(event.title);
    const hasClassPrefix = /^(?:ADV\.\s+)?[A-Z][A-Z0-9\s:\/]+-\s*[A-Z0-9]+:/i.test(event.title);
    event.isAssignment = hasKeywords || hasClassPrefix;

    if (event.isAssignment && event.title) {
      const timeMatch = event.title.match(/(\d{1,2}:\d{2}\s*[ap]\.?m\.?|\d{1,2}\s*[ap]\.?m\.?)/i);
      if (timeMatch) event.extractedTime = timeMatch[1];
    }

    match = eventData.match(/DESCRIPTION:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      let description = match[1].replace(/\r?\n[ \t]/g, '');
      description = description.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
      description = description.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
      description = description.replace(/&amp;/g, '&')
                              .replace(/&lt;/g, '<')
                              .replace(/&gt;/g, '>')
                              .replace(/&quot;/g, '"')
                              .replace(/&#39;/g, "'")
                              .replace(/&nbsp;/g, ' ')
                              .replace(/&ndash;/g, '–')
                              .replace(/&mdash;/g, '—')
                              .replace(/&ldquo;/g, '"')
                              .replace(/&rdquo;/g, '"')
                              .replace(/&lsquo;/g, "'")
                              .replace(/&rsquo;/g, "'");
      event.description = this.decodeText(description.trim());
    }

    match = eventData.match(/LOCATION:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      let location = match[1].replace(/\r?\n[ \t]/g, '');
      event.location = this.decodeText(location.trim());
    } else {
      event.location = null;
    }

    match = eventData.match(/DTSTART(?:;TZID=[^:]*)?(?:;VALUE=DATE)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawStart = match[1].trim();
      event.startRaw = rawStart;
      event.startTime = this.formatDateTime(rawStart);
    }

    match = eventData.match(/(?:DUE|DTDUE)(?:;TZID=[^:]*)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawDue = match[1].trim();
      event.dueRaw = rawDue;
      event.dueTime = this.formatDateTime(rawDue);
    } else if (event.isAssignment && event.startRaw) {
      event.dueRaw = event.startRaw;
      if (event.extractedTime) {
        const dateStr = event.startRaw.replace(/[^\d]/g, '').substring(0, 8);
        event.dueTime = this.formatDateTimeWithExtractedTime(dateStr, event.extractedTime);
      } else {
        event.dueTime = event.startTime;
      }
      event.trinityFormat = true;
    }

    match = eventData.match(/DTEND(?:;TZID=[^:]*)?(?:;VALUE=DATE)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawEnd = match[1].trim();
      event.endRaw = rawEnd;
      event.endTime = this.formatDateTime(rawEnd);
    }

    match = eventData.match(/UID:(.+?)(?:\r?\n|$)/);
    event.uid = match ? match[1].trim() : null;

    match = eventData.match(/STATUS:(.+?)(?:\r?\n|$)/);
    event.status = match ? match[1].trim() : null;

    match = eventData.match(/PRIORITY:(.+?)(?:\r?\n|$)/);
    if (match) event.priority = parseInt(match[1].trim(), 10);

    match = eventData.match(/PERCENT-COMPLETE:(.+?)(?:\r?\n|$)/);
    if (match) event.percentComplete = parseInt(match[1].trim(), 10);

    match = eventData.match(/RRULE:(.+?)(?:\r?\n|$)/);
    event.rrule = match ? match[1].trim() : null;

    return event;
  }

  static formatDateTimeWithExtractedTime(dateStr, timeStr) {
    if (!dateStr || dateStr.length < 8) return null;
    try {
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1;
      const day = parseInt(dateStr.substring(6, 8), 10);
      const normalizedTime = timeStr.toLowerCase().replace(/\s/g, '').replace('.', '');
      const isPM = normalizedTime.includes('pm');
      const isAM = normalizedTime.includes('am');
      const timeMatch = normalizedTime.match(/(\d{1,2}):?(\d{2})?/);
      if (!timeMatch) {
        const date = new Date(year, month, day);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      if (isPM && hours !== 12) hours += 12;
      else if (isAM && hours === 12) hours = 0;
      const date = new Date(year, month, day, hours, minutes);
      return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}-${month}-${day} ${timeStr}`;
    }
  }

  static formatDateTime(dateTime) {
    if (!dateTime) return null;
    const isDateTime = dateTime.includes('T');
    if (!isDateTime) {
      const year = dateTime.substring(0, 4);
      const month = dateTime.substring(4, 6);
      const day = dateTime.substring(6, 8);
      return `${year}-${month}-${day}`;
    }
    const year = dateTime.substring(0, 4);
    const month = dateTime.substring(4, 6);
    const day = dateTime.substring(6, 8);
    const hour = dateTime.substring(9, 11);
    const minute = dateTime.substring(11, 13);
    const second = dateTime.substring(13, 15);
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  static decodeText(text) {
    return text
      .replace(/\\\\/g, '\u0000BACKSLASH\u0000')
      .replace(/\\[nN]/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\:/g, ':')
      .replace(/<[^>]*>/g, '')
      .replace(/\u0000BACKSLASH\u0000/g, '\\')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static async fetchAndParse(url, retries = 3) {
    let fetchUrl = url;
    if (url.startsWith('webcal://')) {
      fetchUrl = url.replace('webcal://', 'https://');
    } else if (url.startsWith('webcals://')) {
      fetchUrl = url.replace('webcals://', 'https://');
    }

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(fetchUrl, {
          signal: controller.signal,
          cache: 'no-cache',
          headers: {
            'Accept': 'text/calendar, text/plain, */*'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const icalContent = await response.text();
        return this.parseICalContent(icalContent);
      } catch (err) {
        lastError = err;
        console.warn(`Fetch attempt ${attempt}/${retries} failed:`, err.message);

        // Don't retry on abort (timeout) or if it's the last attempt
        if (err.name === 'AbortError') {
          lastError = new Error('Request timed out after 30 seconds');
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Failed to fetch calendar data');
  }
}

// Helper function to convert iCal date to timestamp
function ICalDateToTimestamp(dateTime) {
  if (!dateTime) return 0;

  try {
    // DateTime with time: YYYYMMDDTHHMMSS (optionally ending with Z)
    if (dateTime.includes('T')) {
      const year = parseInt(dateTime.substring(0, 4), 10);
      const month = parseInt(dateTime.substring(4, 6), 10) - 1;
      const day = parseInt(dateTime.substring(6, 8), 10);
      const hour = parseInt(dateTime.substring(9, 11) || '0', 10);
      const minute = parseInt(dateTime.substring(11, 13) || '0', 10);
      const second = parseInt(dateTime.substring(13, 15) || '0', 10);

      if (dateTime.endsWith('Z')) {
        return Date.UTC(year, month, day, hour, minute, second);
      }

      return new Date(year, month, day, hour, minute, second).getTime();
    }

    // Date only: YYYYMMDD
    if (dateTime.length >= 8) {
      const year = parseInt(dateTime.substring(0, 4), 10);
      const month = parseInt(dateTime.substring(4, 6), 10) - 1;
      const day = parseInt(dateTime.substring(6, 8), 10);
      return new Date(year, month, day).getTime();
    }
  } catch (e) {
    return 0;
  }

  return 0;
}

// Initialize on service worker startup (after helpers are defined to avoid TDZ errors)
(async function initializeServiceWorker() {
  console.log('TrinTasks service worker initializing...');

  // Ensure periodic alarms exist
  const existingAlarms = await chrome.alarms.getAll();
  const alarmNames = existingAlarms.map(a => a.name);

  if (!alarmNames.includes('checkUpcomingAssignments')) {
    chrome.alarms.create('checkUpcomingAssignments', { periodInMinutes: 30 });
    console.log('Created checkUpcomingAssignments alarm');
  }

  if (!alarmNames.includes('refreshCalendar')) {
    chrome.alarms.create('refreshCalendar', { periodInMinutes: 30 });
    console.log('Created refreshCalendar alarm');
  }

  // Refresh calendar data
  try {
    await refreshCalendarData();
    console.log('Calendar data refreshed on startup');
  } catch (err) {
    console.warn('Failed to refresh calendar on startup:', err);
  }

  // Check for upcoming assignments and schedule reminders
  try {
    await checkUpcomingAssignments();
    console.log('Checked upcoming assignments on startup');
  } catch (err) {
    console.warn('Failed to check assignments on startup:', err);
  }

  console.log('TrinTasks service worker initialized');
})();
