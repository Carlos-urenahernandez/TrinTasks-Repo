// Background service worker for TrinTasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    // Get the event details from storage
    const data = await chrome.storage.local.get(['reminders', 'reminderHistory']);
    const reminders = data.reminders || {};
    const reminderHistory = data.reminderHistory || {};
    const reminder = reminders[alarm.name];

    if (reminder) {
      // Create notification
      chrome.notifications.create(alarm.name, {
        type: 'basic',
        iconUrl: 'icon-128.png', // You'll need to add an icon
        title: '📚 Assignment Reminder',
        message: reminder.message,
        buttons: [
          { title: 'Mark Complete' },
          { title: 'Snooze 1 hour' }
        ],
        requireInteraction: true,
        priority: 2
      });

      // Remember we sent this reminder so we don't re-create it
      reminderHistory[alarm.name] = true;

      // Remove the used reminder
      delete reminders[alarm.name];
      await chrome.storage.local.set({ reminders, reminderHistory });
    }
  }
});

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('reminder_')) {
    if (buttonIndex === 0) {
      // Mark as complete
      const eventId = notificationId.replace('reminder_', '');
      const data = await chrome.storage.local.get(['completedAssignments']);
      const completedAssignments = data.completedAssignments || {};

      completedAssignments[eventId] = {
        completedDate: new Date().toISOString(),
        title: 'Completed via reminder'
      };

      await chrome.storage.local.set({ completedAssignments });
      chrome.notifications.clear(notificationId);
    } else if (buttonIndex === 1) {
      // Snooze for 1 hour
      chrome.alarms.create(notificationId, { delayInMinutes: 60 });
      chrome.notifications.clear(notificationId);
    }
  }
});

// Check for upcoming assignments periodically
chrome.alarms.create('checkUpcomingAssignments', {
  periodInMinutes: 30 // Check every 30 minutes
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkUpcomingAssignments') {
    const data = await chrome.storage.local.get(['events', 'completedAssignments', 'reminderSettings', 'reminders', 'reminderHistory']);
    const events = data.events || [];
    const completedAssignments = data.completedAssignments || {};
    const settings = data.reminderSettings || { enabled: true, hours: 24 };
    const reminders = data.reminders || {};
    const reminderHistory = data.reminderHistory || {};

    if (!settings.enabled) return;

    const now = Date.now();
    const leadHours = parseInt(settings.hours, 10) || 24;

    events.forEach(async (event) => {
      // Skip if not an assignment or already completed
      if (!event.isAssignment || event.isCompleted) return;

      const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

      // Skip if already completed
      if (completedAssignments[eventId]) return;

      // Calculate time until due
      const dueTimestamp = ICalDateToTimestamp(event.dueRaw || event.startRaw);
      const timeUntilDue = dueTimestamp - now;

      // Skip overdue
      if (timeUntilDue <= 0) return;

      const intervalMs = leadHours * 60 * 60 * 1000;
      const targetTime = dueTimestamp - intervalMs;
      const reminderId = `reminder_${eventId}_${leadHours}h`;

      if (reminderHistory[reminderId]) return;

      if (targetTime <= now) {
        // If we're already past the target but before due, trigger soon
        reminders[reminderId] = {
          eventId,
          title: event.title,
          message: `${event.title} is due in ${leadHours} hours!`,
          dueTime: event.dueTime,
          intervalHours: leadHours
        };
        reminderHistory[reminderId] = true;
        chrome.alarms.create(reminderId, { delayInMinutes: 0.1 });
        return;
      }

      if (reminders[reminderId]) return;

      const delayMinutes = Math.max((targetTime - now) / (1000 * 60), 0.1);
      reminders[reminderId] = {
        eventId,
        title: event.title,
        message: `${event.title} is due in ${leadHours} hours!`,
        dueTime: event.dueTime,
        intervalHours: leadHours
      };
      chrome.alarms.create(reminderId, { delayInMinutes: delayMinutes });
    });

    await chrome.storage.local.set({ reminders, reminderHistory });
  }
});

// Periodic calendar refresh to keep events current
chrome.alarms.create('refreshCalendar', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refreshCalendar') {
    await refreshCalendarData();
  }
});

// Also refresh on startup
refreshCalendarData();

async function refreshCalendarData() {
  try {
    const data = await chrome.storage.local.get(['icalUrl', 'events', 'completedAssignments']);
    const icalUrl = data.icalUrl;
    if (!icalUrl) return;

    const previousEvents = data.events || [];
    const completedAssignments = data.completedAssignments || {};

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
  } catch (err) {
    console.error('Failed to refresh calendar in background:', err);
  }
}

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

  static async fetchAndParse(url) {
    let fetchUrl = url;
    if (url.startsWith('webcal://')) {
      fetchUrl = url.replace('webcal://', 'https://');
    } else if (url.startsWith('webcals://')) {
      fetchUrl = url.replace('webcals://', 'https://');
    }
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const icalContent = await response.text();
    return this.parseICalContent(icalContent);
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
