// Background service worker for TrinTasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    // Get the event details from storage
    const data = await chrome.storage.local.get(['reminders']);
    const reminders = data.reminders || {};
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

      // Remove the used reminder
      delete reminders[alarm.name];
      await chrome.storage.local.set({ reminders });
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
    const data = await chrome.storage.local.get(['events', 'completedAssignments', 'reminderSettings']);
    const events = data.events || [];
    const completedAssignments = data.completedAssignments || {};
    const settings = data.reminderSettings || { enabled: true, advanceHours: 24 };

    if (!settings.enabled) return;

    const now = Date.now();
    const advanceTime = settings.advanceHours * 60 * 60 * 1000; // Convert hours to ms

    events.forEach(async (event) => {
      // Skip if not an assignment or already completed
      if (!event.isAssignment || event.isCompleted) return;

      const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

      // Skip if already completed
      if (completedAssignments[eventId]) return;

      // Calculate time until due
      const dueTimestamp = ICalDateToTimestamp(event.dueRaw || event.startRaw);
      const timeUntilDue = dueTimestamp - now;

      // If due within the advance time and not already reminded
      if (timeUntilDue > 0 && timeUntilDue <= advanceTime) {
        const reminderId = `reminder_${eventId}_${Date.now()}`;
        const hoursUntilDue = Math.floor(timeUntilDue / (1000 * 60 * 60));

        // Store reminder details
        const reminders = data.reminders || {};
        reminders[reminderId] = {
          eventId: eventId,
          title: event.title,
          message: `${event.title} is due in ${hoursUntilDue} hours!`,
          dueTime: event.dueTime
        };
        await chrome.storage.local.set({ reminders });

        // Create alarm for immediate notification
        chrome.alarms.create(reminderId, { delayInMinutes: 0.1 });
      }
    });
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