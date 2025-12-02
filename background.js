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
    const settings = data.reminderSettings || { enabled: true, intervals: [24, 16, 4, 1] };
    const reminders = data.reminders || {};
    const reminderHistory = data.reminderHistory || {};

    if (!settings.enabled) return;

    const now = Date.now();
    const intervals = Array.isArray(settings.intervals) && settings.intervals.length > 0
      ? settings.intervals
      : [24, 16, 4, 1];

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

      intervals.forEach(async (hrs) => {
        const intervalMs = hrs * 60 * 60 * 1000;
        const targetTime = dueTimestamp - intervalMs;
        if (targetTime <= now) {
          // If we're already past the target but before due, trigger soon unless already sent
          const reminderId = `reminder_${eventId}_${hrs}h`;
          if (reminderHistory[reminderId]) return;
          reminders[reminderId] = {
            eventId,
            title: event.title,
            message: `${event.title} is due in ${hrs} hours!`,
            dueTime: event.dueTime,
            intervalHours: hrs
          };
          reminderHistory[reminderId] = true; // Mark sent so we don't duplicate
          chrome.alarms.create(reminderId, { delayInMinutes: 0.1 });
          return;
        }

        // Future reminder - schedule if not already scheduled/sent
        const reminderId = `reminder_${eventId}_${hrs}h`;
        if (reminders[reminderId] || reminderHistory[reminderId]) return;
        const delayMinutes = Math.max((targetTime - now) / (1000 * 60), 0.1);
        reminders[reminderId] = {
          eventId,
          title: event.title,
          message: `${event.title} is due in ${hrs} hours!`,
          dueTime: event.dueTime,
          intervalHours: hrs
        };
        chrome.alarms.create(reminderId, { delayInMinutes: delayMinutes });
      });
    });

    await chrome.storage.local.set({ reminders, reminderHistory });
  }
});

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
