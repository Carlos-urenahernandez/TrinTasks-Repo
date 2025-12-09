// iCal Parser functionality
class ICalParser {
  /**
   * Parse iCal content from a string
   * @param {string} icalContent - The iCal file content
   * @returns {Array} Array of event objects
   */
  static parseICalContent(icalContent) {
    const events = [];
    
    // Split by VEVENT
    const eventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let eventMatch;

    while ((eventMatch = eventRegex.exec(icalContent)) !== null) {
      const eventData = eventMatch[1];
      const event = this.parseEvent(eventData);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Parse individual event data
   * @param {string} eventData - The event data block
   * @returns {Object} Parsed event object
   */
  static parseEvent(eventData) {
    const event = {};

    // Extract SUMMARY (title) - handle folded lines (lines that start with a space are continuations)
    let match = eventData.match(/SUMMARY:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      // Handle folded lines (lines that start with a space or tab are continuations)
      let title = match[1].replace(/\r?\n[ \t]/g, '');
      // Decode HTML entities in titles (including numeric entities for accented chars)
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
      event.title = event.title.replace(/\s+\d+$/, '').trim(); // Trim trailing numeric suffixes
    } else {
      event.title = 'Untitled Event';
    }

    // Check if this is an assignment based on:
    // 1. Keywords in the title
    // 2. Has a class prefix pattern (e.g., "ADV. BIOLOGY - B:" or "ENGLISH 11/Fa - C2:")
    // 3. Has high priority (PRIORITY:3 or lower in iCal = high priority)
    const hasKeywords = /\b(due|assignment|homework|test|quiz|exam|project|paper|lab|presentation|read|watch|complete|finish|study)\b/i.test(event.title);
    const hasClassPrefix = /^(?:ADV\.\s+)?[A-Z][A-Z0-9\s:\/]+-\s*[A-Z0-9]+:/i.test(event.title);
    event.isAssignment = hasKeywords || hasClassPrefix;

    // Try to extract time from the title if it contains "due" info
    if (event.isAssignment && event.title) {
      // Look for time patterns like "8:55 a.m.", "11:59 PM", "9am", etc.
      const timeMatch = event.title.match(/(\d{1,2}:\d{2}\s*[ap]\.?m\.?|\d{1,2}\s*[ap]\.?m\.?)/i);
      if (timeMatch) {
        event.extractedTime = timeMatch[1];
      }
    }

    // Extract DESCRIPTION - handle multi-line descriptions properly
    match = eventData.match(/DESCRIPTION:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      // Handle folded lines (lines that start with a space or tab are continuations)
      let description = match[1].replace(/\r?\n[ \t]/g, '');
      // Decode HTML entities (including numeric entities for accented chars)
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

    // Extract LOCATION - handle folded lines
    match = eventData.match(/LOCATION:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      let location = match[1].replace(/\r?\n[ \t]/g, '');
      event.location = this.decodeText(location.trim());
    } else {
      event.location = null;
    }

    // Extract DTSTART (start time)
    match = eventData.match(/DTSTART(?:;TZID=[^:]*)?(?:;VALUE=DATE)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawStart = match[1].trim();
      event.startRaw = rawStart; // keep raw value for sorting
      event.startTime = this.formatDateTime(rawStart);
    } else {
      event.startRaw = null;
      event.startTime = null;
    }

    // Extract DUE date (for tasks/todos) - check both DUE and DTDUE
    match = eventData.match(/(?:DUE|DTDUE)(?:;TZID=[^:]*)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawDue = match[1].trim();
      event.dueRaw = rawDue; // keep raw value for sorting
      event.dueTime = this.formatDateTime(rawDue);
    } else {
      // For Trinity School format: if this is an assignment, use DTSTART as the due date
      if (event.isAssignment && event.startRaw) {
        event.dueRaw = event.startRaw;

        // If we extracted a time from the title, try to combine it with the date
        if (event.extractedTime && event.startRaw) {
          // Handle date-only format (YYYYMMDD) and add the extracted time
          const dateStr = event.startRaw.replace(/[^\d]/g, '').substring(0, 8);
          event.dueTime = this.formatDateTimeWithExtractedTime(dateStr, event.extractedTime);
        } else {
          event.dueTime = event.startTime;
        }

        // Mark that this is a Trinity-style assignment
        event.trinityFormat = true;
      } else {
        event.dueRaw = null;
        event.dueTime = null;
      }
    }

    // Extract DTEND (end time)
    match = eventData.match(/DTEND(?:;TZID=[^:]*)?(?:;VALUE=DATE)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawEnd = match[1].trim();
      event.endRaw = rawEnd;
      event.endTime = this.formatDateTime(rawEnd);
    } else {
      event.endRaw = null;
      event.endTime = null;
    }

    // Extract UID (unique identifier)
    match = eventData.match(/UID:(.+?)(?:\r?\n|$)/);
    event.uid = match ? match[1].trim() : null;

    // Extract COMPLETED date (for completed tasks)
    match = eventData.match(/COMPLETED(?:;TZID=[^:]*)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawCompleted = match[1].trim();
      event.completedRaw = rawCompleted;
      event.completedTime = this.formatDateTime(rawCompleted);
    }

    // Extract STATUS (for task status)
    match = eventData.match(/STATUS:(.+?)(?:\r?\n|$)/);
    event.status = match ? match[1].trim() : null;

    // Extract PRIORITY (for task priority)
    match = eventData.match(/PRIORITY:(.+?)(?:\r?\n|$)/);
    if (match) {
      event.priority = parseInt(match[1].trim(), 10);
    }

    // Extract PERCENT-COMPLETE (for task progress)
    match = eventData.match(/PERCENT-COMPLETE:(.+?)(?:\r?\n|$)/);
    if (match) {
      event.percentComplete = parseInt(match[1].trim(), 10);
    }

    // Extract RRULE (recurrence rule)
    match = eventData.match(/RRULE:(.+?)(?:\r?\n|$)/);
    event.rrule = match ? match[1].trim() : null;

    // Extract ORGANIZER
    match = eventData.match(/ORGANIZER(?:;[^:]*)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      event.organizer = this.extractEmail(match[1].trim());
    }

    // Extract ATTENDEE
    const attendeeRegex = /ATTENDEE(?:;[^:]*)?:(.+?)(?:\r?\n)/g;
    const attendees = [];
    while ((match = attendeeRegex.exec(eventData)) !== null) {
      attendees.push(this.extractEmail(match[1].trim()));
    }
    if (attendees.length > 0) {
      event.attendees = attendees;
    }

    return event;
  }

  /**
   * Convert an iCal date/time string to a timestamp (ms since epoch)
   * Accepts YYYYMMDD or YYYYMMDDTHHMMSS or with trailing Z
   * @param {string} dateTime
   * @returns {number} timestamp in ms
   */
  static iCalDateToTimestamp(dateTime) {
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

  /**
   * Format date/time with extracted time from SUMMARY
   * @param {string} dateStr - The date string in YYYYMMDD format
   * @param {string} timeStr - The extracted time string (e.g., "8:55 a.m.", "11:59 PM")
   * @returns {string} Formatted date/time
   */
  static formatDateTimeWithExtractedTime(dateStr, timeStr) {
    if (!dateStr || dateStr.length < 8) return null;

    try {
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1;
      const day = parseInt(dateStr.substring(6, 8), 10);

      // Parse the time string
      const normalizedTime = timeStr.toLowerCase().replace(/\s/g, '').replace('.', '');
      const isPM = normalizedTime.includes('pm');
      const isAM = normalizedTime.includes('am');

      // Extract hours and minutes
      const timeMatch = normalizedTime.match(/(\d{1,2}):?(\d{2})?/);
      if (!timeMatch) {
        // If we can't parse the time, just return the date
        const date = new Date(year, month, day);
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }

      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;

      // Convert to 24-hour format
      if (isPM && hours !== 12) {
        hours += 12;
      } else if (isAM && hours === 12) {
        hours = 0;
      }

      const date = new Date(year, month, day, hours, minutes);

      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      // If parsing fails, just return the date part
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}-${month}-${day} ${timeStr}`;
    }
  }

  /**
   * Format date/time from iCal format
   * @param {string} dateTime - The date/time string (e.g., "20230315T100000Z" or "20230315")
   * @returns {string} Formatted date/time
   */
  static formatDateTime(dateTime) {
    if (!dateTime) return null;

    // Handle different iCal date/time formats
    // Format: YYYYMMDDTHHMMSSZ or YYYYMMDD or YYYYMMDDTHHMMSS
    
    const isDateTime = dateTime.includes('T');
    
    if (!isDateTime) {
      // Date only (YYYYMMDD)
      const year = dateTime.substring(0, 4);
      const month = dateTime.substring(4, 6);
      const day = dateTime.substring(6, 8);
      return `${year}-${month}-${day}`;
    }

    // DateTime format
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

  /**
   * Decode iCal text (handle escaped characters)
   * @param {string} text - The text to decode
   * @returns {string} Decoded text
   */
  static decodeText(text) {
    return text
      // Handle escaped backslash first (before other replacements)
      .replace(/\\\\/g, '\u0000BACKSLASH\u0000')
      // Handle newlines (both lowercase and uppercase)
      .replace(/\\[nN]/g, '\n')
      .replace(/\\r/g, '\r')
      // Handle escaped punctuation
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\:/g, ':')
      // Strip HTML tags
      .replace(/<[^>]*>/g, '')
      // Restore backslashes
      .replace(/\u0000BACKSLASH\u0000/g, '\\')
      // Clean up multiple consecutive newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Extract email from organizer/attendee field
   * @param {string} field - The organizer/attendee field
   * @returns {string} Extracted email or original field
   */
  static extractEmail(field) {
    const emailMatch = field.match(/mailto:(.+?)(?:$|[\s;])/);
    return emailMatch ? emailMatch[1] : field;
  }

  /**
   * Fetch and parse iCal from URL
   * @param {string} url - The URL to the iCal file (supports webcal://, http://, https://)
   * @returns {Promise<Array>} Array of parsed events
   */
  static async fetchAndParse(url) {
    try {
      // Convert webcal:// to https://
      let fetchUrl = url;
      if (url.startsWith('webcal://')) {
        fetchUrl = url.replace('webcal://', 'https://');
      } else if (url.startsWith('webcals://')) {
        fetchUrl = url.replace('webcals://', 'https://');
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const icalContent = await response.text();
      return this.parseICalContent(icalContent);
    } catch (error) {
      throw new Error(`Failed to fetch or parse iCal: ${error.message}`);
    }
  }
}

// UI Controller
class UIController {
  constructor() {
    console.log('UIController constructor called');
    this.parseBtn = document.getElementById('parseBtn');
    console.log('parseBtn:', this.parseBtn);
    this.icalLinkInput = document.getElementById('icalLink');
    this.inputSection = document.querySelector('.input-section');
    this.loadingSpinner = document.getElementById('loadingSpinner');
    this.errorMessage = document.getElementById('errorMessage');
    this.mainContent = document.getElementById('mainContent');
    this.eventsList = document.getElementById('eventsList');
    this.eventsContainer = document.getElementById('eventsContainer');
    this.noData = document.getElementById('noData');
    this.filterSelect = document.getElementById('filterSelect');
    this.filterCurrent = document.getElementById('filterCurrent');
    this.filterOptions = document.getElementById('filterOptions');

    // Week view elements
    this.weekView = document.getElementById('weekView');
    this.weekTitle = document.getElementById('weekTitle');
    this.weekDays = document.getElementById('weekDays');
    this.prevWeekBtn = document.getElementById('prevWeek');
    this.nextWeekBtn = document.getElementById('nextWeek');
    this.selectedDayTitle = document.getElementById('selectedDayTitle');

    // Header elements
    this.headerTitle = document.getElementById('headerTitle');
    this.settingsBtn = document.getElementById('settingsBtn');

    // View elements
    this.mainView = document.getElementById('mainView');
    this.settingsView = document.getElementById('settingsView');

    // Settings elements
    this.settingsIcalLink = document.getElementById('settingsIcalLink');
    this.refreshCalendarBtn = document.getElementById('refreshCalendarBtn');
    this.clearDataBtn = document.getElementById('clearDataBtn');
    this.autoRefreshCheckbox = document.getElementById('autoRefresh');
    this.enableRemindersCheckbox = document.getElementById('enableReminders');
    this.reminderHoursSelect = document.getElementById('reminderHours');
    this.themeOptions = document.getElementById('themeOptions');

    // Subject tags elements
    this.subjectTagsDiv = document.getElementById('subjectTags');

    this.events = [];
    this.subjectTags = {};
    this.currentTheme = 'fern';
    this.isSettingsView = false;
    this.filterMode = 'all';

    // Week view state
    this.currentWeekStart = this.getWeekStart(new Date());
    this.selectedDate = new Date();

    this.setupEventListeners();
    const loadPromise = this.loadSavedData();
    this.loadSettings();
    this.loadSubjectTags();
    this.listenForStorageChanges();
    // Kick off a background refresh as soon as cached data is present
    loadPromise.then(hasData => {
      if (hasData) {
        this.requestBackgroundRefresh();
      }
    });
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  setupEventListeners() {
    this.parseBtn.addEventListener('click', () => this.handleParse());
    this.icalLinkInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleParse();
      }
    });
    this.prevWeekBtn.addEventListener('click', () => this.navigateWeek(-1));
    this.nextWeekBtn.addEventListener('click', () => this.navigateWeek(1));

    // Settings event listeners
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.headerTitle.addEventListener('click', () => {
      if (this.isSettingsView) {
        this.closeSettings();
      }
    });
    if (this.refreshCalendarBtn) {
      this.refreshCalendarBtn.addEventListener('click', () => this.handleManualRefresh());
    }
    this.clearDataBtn.addEventListener('click', () => this.clearAllData());

    // Auto-save on settings change
    if (this.autoRefreshCheckbox) {
      this.autoRefreshCheckbox.addEventListener('change', () => this.saveSettings());
    }
    this.enableRemindersCheckbox.addEventListener('change', () => this.saveSettings());
    this.reminderHoursSelect.addEventListener('change', () => this.saveSettings());

    // Filter selector click
    if (this.filterOptions) {
      this.filterOptions.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          this.setFilterMode(mode);
        });
      });
    }

    // Theme selection
    if (this.themeOptions) {
      this.themeOptions.querySelectorAll('.theme-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.getAttribute('data-theme-option');
          if (theme) {
            this.applyTheme(theme);
            this.saveSettings(); // persist theme choice
          }
        });
      });
    }
  }

  async handleParse() {
    console.log('handleParse called');
    const url = this.icalLinkInput.value.trim();
    console.log('URL:', url);

    if (!url) {
      this.showError('Please enter a valid URL');
      return;
    }

    // Validate URL format (support webcal://, webcals://, http://, https://)
    try {
      if (url.startsWith('webcal://') || url.startsWith('webcals://')) {
        // For webcal URLs, just do basic validation
        if (url.length < 12) {
          throw new Error('Invalid webcal URL');
        }
      } else {
        // For http(s) URLs, use URL constructor
        new URL(url);
      }
    } catch {
      this.showError('Please enter a valid URL (webcal://, http://, or https://)');
      return;
    }

    this.showLoading(true);
    this.clearError();

    try {
      console.log('Fetching and parsing...');
      const events = await ICalParser.fetchAndParse(url);
      console.log('Parsed events:', events.length);
      this.displayEvents(events);
      // Save to chrome storage
      await this.saveToStorage(url, events);
    } catch (error) {
      console.error('Parse error:', error);
      this.showError(error.message);
      this.hideEventsList();
    } finally {
      this.showLoading(false);
    }
  }

  displayEvents(events) {
    if (!events || events.length === 0) {
      this.showError('No events found in the iCal file');
      return;
    }

    // Store events
    this.events = events;
    // Build subject tags from the full set up front so Settings shows them immediately
    this.ensureSubjectTags(events);

    // Hide input section and show main content
    this.inputSection.classList.add('hidden');
    this.noData.classList.add('hidden');
    this.mainContent.classList.remove('hidden');

    // Show week view and events for selected day (today by default)
    this.renderWeekView();
    this.showEventsForSelectedDay();
  }

  createEventElement(event) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event';
    if (event.isCompleted) {
      eventDiv.classList.add('completed');
    }

    // Apply subject color if available; also extract full course name for display
    const subjectTag = this.getSubjectFromTitle(event.title);
    const courseFullName = this.getCourseName(event.title) || (subjectTag ? subjectTag.name : '');
    if (subjectTag) {
      eventDiv.style.borderLeftWidth = '4px';
      eventDiv.style.borderLeftColor = subjectTag.color;
      eventDiv.setAttribute('data-subject', subjectTag.name);
    }

    // Create header with checkbox for assignments
    const headerDiv = document.createElement('div');
    headerDiv.className = 'event-header';

    // Get clean title without class prefix early to help infer assignmentness
    const cleanTitle = this.getCleanTitle(event.title);
    // Infer assignment status if parsing didn't mark it (useful for varied title formats)
    const inferredIsAssignment = !!(
      event.isAssignment ||
      (cleanTitle && cleanTitle !== (event.title || '').trim()) ||
      /\b(due|assignment|homework|task|read|submit|turn in)\b/i.test(event.title || '')
    );

    if (inferredIsAssignment) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'event-checkbox';
      checkbox.checked = event.isCompleted || false;
      checkbox.addEventListener('change', () => this.toggleAssignmentComplete(event, eventDiv));
      headerDiv.appendChild(checkbox);
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';

    let titleHtml = this.escapeHtml(cleanTitle);

    // Add progress indicator if available
    if (event.percentComplete !== undefined && event.percentComplete < 100 && !event.isCompleted) {
      titleHtml += ` <span style="font-size: 11px; color: #6b7280;">(${event.percentComplete}%)</span>`;
    }

    titleDiv.innerHTML = `<span class="title-text">${titleHtml}</span>`;
    if (event.isCompleted) {
      titleDiv.classList.add('title-completed');
    }
    headerDiv.appendChild(titleDiv);
    eventDiv.appendChild(headerDiv);

    let html = '<div class="event-details">';

    // Show DUE date if available (for tasks/todos)
    if (event.dueTime) {
      const isOverdue = !event.isCompleted && event.dueRaw &&
                       ICalParser.iCalDateToTimestamp(event.dueRaw) < Date.now();
      const dueStyle = isOverdue ? 'color: #dc2626; font-weight: 700;' : 'color: #dc2626; font-weight: 600;';
      const dueLabel = isOverdue ? '⚠️ OVERDUE:' : 'Due:';

      html += `<div class="event-detail">
        <span class="event-detail-label">${dueLabel}</span>
        <span class="event-detail-value" style="${dueStyle}">${event.dueTime}</span>
      </div>`;
    }

    // Show class (full course name) instead of start/end rows
    if (courseFullName) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Class:</span>
        <span class="event-detail-value">${this.escapeHtml(courseFullName)}</span>
      </div>`;
    }

    // Show completed date if available
    if (event.isCompleted && event.completedDate) {
      const completedDate = new Date(event.completedDate);
      const formattedDate = completedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      html += `<div class="event-detail">
        <span class="event-detail-label">Completed:</span>
        <span class="event-detail-value" style="color: #10b981;">✓ ${formattedDate}</span>
      </div>`;
    }

    if (event.location) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Location:</span>
        <span class="event-detail-value">${this.escapeHtml(event.location)}</span>
      </div>`;
    }

    if (event.organizer) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Organizer:</span>
        <span class="event-detail-value">${this.escapeHtml(event.organizer)}</span>
      </div>`;
    }

    if (event.attendees && event.attendees.length > 0) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Attendees:</span>
        <span class="event-detail-value">${event.attendees.map(a => this.escapeHtml(a)).join(', ')}</span>
      </div>`;
    }

    if (event.rrule) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Recurrence:</span>
        <span class="event-detail-value">${this.escapeHtml(event.rrule)}</span>
      </div>`;
    }

    html += '</div>';

    if (event.description) {
      html += `<div class="event-description">${this.escapeHtml(event.description)}</div>`;
    }

    // Add the details HTML to the eventDiv
    const detailsContainer = document.createElement('div');
    detailsContainer.innerHTML = html;
    eventDiv.appendChild(detailsContainer);

    return eventDiv;
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  showLoading(show) {
    if (show) {
      this.loadingSpinner.classList.remove('hidden');
    } else {
      this.loadingSpinner.classList.add('hidden');
    }
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove('hidden');
  }

  clearError() {
    this.errorMessage.classList.add('hidden');
    this.errorMessage.textContent = '';
  }

  hideEventsList() {
    this.mainContent.classList.add('hidden');
  }

  navigateWeek(direction) {
    const newDate = new Date(this.currentWeekStart);
    newDate.setDate(newDate.getDate() + (direction * 7));
    this.currentWeekStart = newDate;
    this.renderWeekView();
  }

  renderWeekView() {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Calculate week end date
    const weekEnd = new Date(this.currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Update week title
    const startMonth = monthNames[this.currentWeekStart.getMonth()];
    const endMonth = monthNames[weekEnd.getMonth()];
    const startDay = this.currentWeekStart.getDate();
    const endDay = weekEnd.getDate();

    if (startMonth === endMonth) {
      this.weekTitle.textContent = `${startMonth} ${startDay} - ${endDay}`;
    } else {
      this.weekTitle.textContent = `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }

    // Clear and rebuild week days
    this.weekDays.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart);
      date.setDate(date.getDate() + i);

      const dayDiv = document.createElement('div');
      dayDiv.className = 'week-day';

      // Check if this is today
      const isToday = date.getTime() === today.getTime();
      if (isToday) dayDiv.classList.add('today');

      // Check if this is the selected day
      const selectedDateNorm = new Date(this.selectedDate);
      selectedDateNorm.setHours(0, 0, 0, 0);
      if (date.getTime() === selectedDateNorm.getTime()) {
        dayDiv.classList.add('selected');
      }

      // Get events for this day
      const eventsForDay = this.getEventsForDate(date);
      const pendingCount = eventsForDay.filter(e => !e.isCompleted).length;

      // Day name
      const dayName = document.createElement('div');
      dayName.className = 'week-day-name';
      dayName.textContent = dayNames[i];
      dayDiv.appendChild(dayName);

      // Day number
      const dayNumber = document.createElement('div');
      dayNumber.className = 'week-day-number';
      dayNumber.textContent = date.getDate();
      dayDiv.appendChild(dayNumber);

      // Event count indicator
      if (pendingCount > 0) {
        const eventDot = document.createElement('div');
        eventDot.className = 'week-day-events';
        eventDot.textContent = pendingCount;
        dayDiv.appendChild(eventDot);
        dayDiv.classList.add('has-events');
      }

      // Click handler to select day
      dayDiv.addEventListener('click', () => {
        this.selectedDate = date;
        this.renderWeekView();
        this.showEventsForSelectedDay();
      });

      this.weekDays.appendChild(dayDiv);
    }
  }

  showEventsForSelectedDay() {
    let eventsForDay = this.getEventsForDate(this.selectedDate);
    eventsForDay = this.applyFilter(eventsForDay);

    // Update title
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedNorm = new Date(this.selectedDate);
    selectedNorm.setHours(0, 0, 0, 0);

    if (selectedNorm.getTime() === today.getTime()) {
      this.selectedDayTitle.textContent = "Today's Assignments";
    } else {
      this.selectedDayTitle.textContent = this.selectedDate.toLocaleDateString('en-US', options);
    }

    // Clear and populate events
    this.eventsContainer.innerHTML = '';

    if (eventsForDay.length === 0) {
      const noEventsMsg = document.createElement('div');
      noEventsMsg.className = 'no-events-message';
      noEventsMsg.textContent = 'No assignments for this day';
      this.eventsContainer.appendChild(noEventsMsg);
    } else {
      // Sort by completion status (incomplete first), then by due/start time
      eventsForDay.sort((a, b) => {
        if (a.isCompleted && !b.isCompleted) return 1;
        if (!a.isCompleted && b.isCompleted) return -1;
        const ta = ICalParser.iCalDateToTimestamp(a.dueRaw || a.startRaw);
        const tb = ICalParser.iCalDateToTimestamp(b.dueRaw || b.startRaw);
        return ta - tb;
      });

      eventsForDay.forEach(event => {
        const eventElement = this.createEventElement(event);
        this.eventsContainer.appendChild(eventElement);
      });
    }
  }

  formatTimeForDisplay(timeStr) {
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

  getEventsForDate(date) {
    // Create date string in local timezone (YYYY-MM-DD)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    console.log(`Looking for events on ${year}-${month}-${day} (${dateStr}), total events: ${this.events.length}`);

    const matchingEvents = this.events.filter(event => {
      // Check for DUE date first (for tasks/todos), then fall back to START date
      const eventDateRaw = event.dueRaw || event.startRaw;

      if (!eventDateRaw) {
        console.log('  Event has no date:', event);
        return false;
      }

      // Extract just the date part (YYYYMMDD or YYYYMMDDTHHMMSS)
      const eventDatePart = eventDateRaw.split('T')[0];

      // Remove any non-digit characters
      const eventDateStr = eventDatePart.replace(/\D/g, '').substring(0, 8);

      const matches = eventDateStr === dateStr;
      if (matches) {
        const dateType = event.dueRaw ? 'DUE' : 'START';
        console.log(`  ✓ Match found: "${event.title}" with ${dateType} date=${eventDateRaw} -> ${eventDateStr}`);
      } else {
        // Log first few mismatches for debugging
        if (Math.random() < 0.1) {
          console.log(`  ✗ No match: "${event.title}" ${eventDateStr} !== ${dateStr}`);
        }
      }

      return matches;
    });

    console.log(`  Found ${matchingEvents.length} matching events`);
    return matchingEvents;
  }

  async saveToStorage(url, events) {
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

  async toggleAssignmentComplete(event, eventElement) {
    const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

    // Load existing completed assignments
    const data = await chrome.storage.local.get(['completedAssignments']);
    const completedAssignments = data.completedAssignments || {};

    if (event.isCompleted) {
      // Mark as incomplete
      delete completedAssignments[eventId];
      event.isCompleted = false;
      event.completedDate = null;
      if (eventElement) {
        eventElement.classList.remove('completing');
        const cb = eventElement.querySelector('.event-checkbox');
        if (cb) cb.classList.remove('checked-anim');
      }
    } else {
      // Mark as complete
      completedAssignments[eventId] = {
        completedDate: new Date().toISOString(),
        title: event.title
      };
      event.isCompleted = true;
      event.completedDate = new Date().toISOString();
    }

    // Quick celebration confetti when marking complete
    if (event.isCompleted && eventElement) {
      this.animateCompletion(eventElement);
      setTimeout(async () => {
        await chrome.storage.local.set({ completedAssignments });
        this.renderWeekView();
        this.showEventsForSelectedDay();
      }, 1200);
    } else {
      await chrome.storage.local.set({ completedAssignments });
      // Re-render week view and events
      this.renderWeekView();
      this.showEventsForSelectedDay();
    }
  }

  async loadSavedData() {
    try {
      const data = await chrome.storage.local.get(['icalUrl', 'events', 'completedAssignments', 'lastRefreshSummary']);

      if (data.icalUrl && data.events) {
        this.icalLinkInput.value = data.icalUrl;
        this.settingsIcalLink.value = data.icalUrl;

        // Merge completion status with cached events
        const completedAssignments = data.completedAssignments || {};
        const cachedEvents = this.mergeCompletionStatus(data.events, completedAssignments);

        this.displayEvents(cachedEvents);

        // Show last refresh summary (from background refresh)
        if (data.lastRefreshSummary) {
          this.showRefreshToast(data.lastRefreshSummary);
        }

        console.log('Loaded cached data from storage');
        return true;
      } else {
        // No data found; show setup instructions
        this.showSetupInstructions();
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
      // On error, show setup instructions as fallback
      this.showSetupInstructions();
    }
    return false;
  }

  showSetupInstructions() {
    this.inputSection.classList.remove('hidden');
    this.noData.classList.remove('hidden');
    this.mainContent.classList.add('hidden');
  }

  mergeCompletionStatus(events, completedAssignments) {
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

  applyTheme(theme) {
    const themeClass = `theme-${theme || 'fern'}`;
    const themes = ['theme-fern', 'theme-ocean', 'theme-sunset', 'theme-slate', 'theme-orchid', 'theme-midnight'];
    themes.forEach(t => document.body.classList.remove(t));
    // enable a short transition class
    document.body.classList.add('theme-animating');
    setTimeout(() => document.body.classList.remove('theme-animating'), 400);

    if (themes.includes(themeClass)) {
      document.body.classList.add(themeClass);
      this.currentTheme = theme || 'fern';
    } else {
      document.body.classList.add('theme-fern');
      this.currentTheme = 'fern';
    }

    if (this.themeOptions) {
      this.themeOptions.querySelectorAll('.theme-pill').forEach(btn => {
        const val = btn.getAttribute('data-theme-option');
        btn.classList.toggle('selected', val === this.currentTheme);
      });
    }
  }

  listenForStorageChanges() {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== 'local') return;

      const eventsChanged = changes.events || changes.completedAssignments || changes.icalUrl;
      if (eventsChanged) {
        await this.updateEventsFromStorage();
      }

      if (changes.lastRefreshSummary && changes.lastRefreshSummary.newValue) {
        this.showRefreshToast(changes.lastRefreshSummary.newValue);
      }

      if (changes.theme && changes.theme.newValue) {
        this.applyTheme(changes.theme.newValue);
      }
    });
  }

  async requestBackgroundRefresh() {
    const currentUrl = this.icalLinkInput.value.trim() || this.settingsIcalLink.value.trim();
    if (!currentUrl) {
      this.showError('Please add an iCal link first');
      return;
    }
    await chrome.storage.local.set({ icalUrl: currentUrl });

    const response = await new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action: 'refreshCalendarNow', icalUrl: currentUrl }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(resp);
          }
        });
      } catch (err) {
        resolve({ success: false, error: err?.message || 'Unable to contact background' });
      }
    });

    if (!response || !response.success) {
      console.warn('Background refresh failed or no response', response && response.error);
      try {
        await this.refreshLocally(currentUrl);
        await this.updateEventsFromStorage();
      } catch (err) {
        this.showError(response && response.error ? response.error : 'Could not refresh calendar. Please try again.');
        return;
      }
    } else {
      await this.updateEventsFromStorage();
    }
  }

  async refreshLocally(url) {
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
  }

  async handleManualRefresh() {
    try {
      if (this.refreshCalendarBtn) {
        this.refreshCalendarBtn.disabled = true;
        this.refreshCalendarBtn.textContent = 'Refreshing...';
      }
      this.showLoading(true);
      await this.requestBackgroundRefresh();
    } finally {
      this.showLoading(false);
      if (this.refreshCalendarBtn) {
        this.refreshCalendarBtn.disabled = false;
        this.refreshCalendarBtn.textContent = 'Refresh Calendar';
      }
    }
  }

  async updateEventsFromStorage() {
    try {
      const data = await chrome.storage.local.get(['events', 'completedAssignments', 'icalUrl']);
      if (data.icalUrl) {
        this.icalLinkInput.value = data.icalUrl;
        this.settingsIcalLink.value = data.icalUrl;
      }
      const merged = this.mergeCompletionStatus(data.events || [], data.completedAssignments);
      if (merged.length > 0) {
        this.displayEvents(merged);
      }
    } catch (error) {
      console.error('Failed to update events from storage:', error);
    }
  }

  getTimeAgo(date) {
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

  // Settings methods
  openSettings() {
    // Load current settings
    this.settingsIcalLink.value = this.icalLinkInput.value;
    this.displaySubjectTags();

    // Switch to settings view
    this.mainView.classList.add('hidden');
    this.settingsView.classList.remove('hidden');
    this.headerTitle.textContent = '← Settings';
    this.headerTitle.style.cursor = 'pointer';
    this.settingsBtn.style.display = 'none';
    this.isSettingsView = true;
  }

  closeSettings() {
    // Apply any pending iCal link change
    const newUrl = this.settingsIcalLink.value.trim();
    if (newUrl && newUrl !== this.icalLinkInput.value) {
      this.icalLinkInput.value = newUrl;
      this.handleParse();
    }

    // Switch to main view
    this.settingsView.classList.add('hidden');
    this.mainView.classList.remove('hidden');
    this.headerTitle.textContent = 'TrinTasks';
    this.headerTitle.style.cursor = 'default';
    this.settingsBtn.style.display = 'block';
    this.isSettingsView = false;
  }

  setFilterMode(mode) {
    if (!mode) return;
    this.filterMode = mode;
    const label = mode === 'active' ? 'Uncompleted' : mode === 'completed' ? 'Completed' : 'All';
    if (this.filterCurrent) this.filterCurrent.textContent = label;
    this.showEventsForSelectedDay();
  }

  applyFilter(events) {
    if (this.filterMode === 'completed') {
      return events.filter(e => e.isCompleted);
    }
    if (this.filterMode === 'active') {
      return events.filter(e => !e.isCompleted);
    }
    return events;
  }

  async saveSettings() {
    // Save all settings
    const autoRefresh = this.autoRefreshCheckbox ? this.autoRefreshCheckbox.checked : false;
    const enableReminders = this.enableRemindersCheckbox.checked;
    const reminderHours = parseInt(this.reminderHoursSelect.value, 10) || 24;
    const theme = this.currentTheme || 'fern';

    await chrome.storage.local.set({
      autoRefresh,
      enableReminders,
      reminderHours,
      theme,
      reminderSettings: {
        enabled: enableReminders,
        hours: reminderHours
      }
    });

    // Setup auto-refresh if enabled
    if (autoRefresh) {
      this.setupAutoRefresh();
    } else if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  async clearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      await chrome.storage.local.clear();
      this.events = [];
      this.subjectTags = {};
      this.icalLinkInput.value = '';
      this.settingsIcalLink.value = '';
      this.mainContent.classList.add('hidden');
      this.inputSection.classList.remove('hidden');
      this.noData.classList.remove('hidden');
      if (this.autoRefreshCheckbox) this.autoRefreshCheckbox.checked = false;
      this.enableRemindersCheckbox.checked = true;
      this.reminderHoursSelect.value = '24';
      this.loadSubjectTags();
      this.applyTheme('fern');
      this.closeSettings();
    }
  }

  async loadSettings() {
    const data = await chrome.storage.local.get(['autoRefresh', 'enableReminders', 'reminderHours', 'reminderSettings', 'theme']);

    // Load reminder settings (default to enabled)
    this.enableRemindersCheckbox.checked = data.enableReminders !== false;

    // Load reminder hours (default to 24)
    const hrs = (data.reminderSettings && data.reminderSettings.hours) || data.reminderHours || 24;
    this.reminderHoursSelect.value = String(hrs);

    // Load theme
    this.applyTheme(data.theme || 'fern');
  }

  setupAutoRefresh() {
    // Set up periodic refresh (every hour)
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval(() => {
      if (this.icalLinkInput.value) {
        this.handleParse();
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  // Subject tag methods
  async loadSubjectTags() {
    const data = await chrome.storage.local.get(['subjectTags']);
    // Start with empty tags - colors will be dynamically generated
    this.subjectTags = data.subjectTags || {};
    this.displaySubjectTags();
  }

  displaySubjectTags() {
    this.subjectTagsDiv.innerHTML = '';

    const tags = Object.entries(this.subjectTags);
    if (tags.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.cssText = 'color: #9ca3af; font-size: 12px; margin: 0;';
      emptyMsg.textContent = 'Subject colors will appear here after loading your calendar';
      this.subjectTagsDiv.appendChild(emptyMsg);
      return;
    }

    tags.forEach(([name, color]) => {
      const tagDiv = document.createElement('div');
      tagDiv.className = 'subject-tag-item';

      // Create a hidden color input
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = color;
      colorInput.className = 'tag-color-input';
      colorInput.addEventListener('input', (e) => {
        this.updateSubjectTagColor(name, e.target.value);
        colorIndicator.style.backgroundColor = e.target.value;
      });

      const colorIndicator = document.createElement('div');
      colorIndicator.className = 'tag-color-indicator';
      colorIndicator.style.backgroundColor = color;
      colorIndicator.title = 'Click to change color';
      // Custom mini palette anchored to the indicator
      const popover = this.buildColorPopover(name, colorInput, colorIndicator);
      colorIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.color-popover').forEach(p => p.classList.add('hidden'));
        popover.classList.toggle('hidden');
      });
      document.addEventListener('click', () => popover.classList.add('hidden'));

      const tagName = document.createElement('span');
      tagName.className = 'tag-name';
      tagName.textContent = name;

      tagDiv.appendChild(colorInput);
      tagDiv.appendChild(colorIndicator);
      tagDiv.appendChild(popover);
      tagDiv.appendChild(tagName);
      this.subjectTagsDiv.appendChild(tagDiv);
    });
  }

  async updateSubjectTagColor(name, color) {
    this.subjectTags[name] = color;
    await chrome.storage.local.set({ subjectTags: this.subjectTags });
  }

  getSubjectFromTitle(title) {
    // Extract subject from title
    // Handles formats like:
    // - "ADV. BIOLOGY - B:" -> "BIOLOGY"
    // - "ADV. COMPUTER SCIENCE: SOFTWARE ENGINEERING/Fa - D:" -> "COMPUTER SCIENCE"
    // - "ENGLISH 11/Fa - C2:" -> "ENGLISH"
    // - "UNITED STATES HISTORY - E:" -> "UNITED STATES HISTORY"

    // Pattern: optional "ADV. ", then class name (letters, spaces, numbers),
    // optional subtitle/semester, then " - SECTION:"
    const subjectMatch = title.match(/^(?:ADV\.\s+)?([A-Z][A-Z\s]*[A-Z])(?:[\s:\/]|[0-9]|$)/);
    if (subjectMatch) {
      let subject = subjectMatch[1].trim();
      // Remove trailing numbers (like "ENGLISH 11" -> "ENGLISH")
      subject = subject.replace(/\s+\d+$/, '');

      // Check if we have a tag for this subject
      for (const tag in this.subjectTags) {
        if (subject.includes(tag) || tag.includes(subject)) {
          return { name: tag, color: this.subjectTags[tag] };
        }
      }

      // If no existing tag, create one with a default color and save it
      const color = this.getDefaultColorForSubject(subject);
      this.subjectTags[subject] = color;
      // Save asynchronously (don't await to avoid blocking)
      chrome.storage.local.set({ subjectTags: this.subjectTags });
      return { name: subject, color: color };
    }
    return null;
  }

  getCourseName(title) {
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

  ensureSubjectTags(events) {
    if (!events) return;
    events.forEach(ev => this.getSubjectFromTitle(ev.title || ''));
    this.displaySubjectTags();
  }

  getDefaultColorForSubject(subject) {
    // Generate a consistent color based on subject name using a spread-out palette
    // Colors are intentionally far apart in hue to avoid similar-looking shades
    const colors = [
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
    let hash = 0;
    for (let i = 0; i < subject.length; i++) {
      hash = subject.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getCleanTitle(title) {
    // Remove class prefix from title
    // Handles formats like:
    // - "ADV. BIOLOGY - B: Assignment" -> "Assignment"
    // - "ADV. COMPUTER SCIENCE: SOFTWARE ENGINEERING/Fa - D: Task" -> "Task"
    // - "ENGLISH 11/Fa - C2: Read chapter" -> "Read chapter"
    // - "UNITED STATES HISTORY - E: No homework" -> "No homework"

    // Pattern: optional "ADV. ", class name with optional subtitle/semester, " - SECTION: ", then content
    if (!title) return '';
    const cleanMatch = title.match(/^(?:ADV\.\s+)?[A-Z][A-Z0-9\s:\/]+-\s*[A-Z0-9]+:\s*(.+)$/i);
    if (cleanMatch) {
      return cleanMatch[1].trim().replace(/\s+\d+$/, '').trim();
    }

    // Fallback: split on last colon to handle titles that have multiple colons
    const lastColon = title.lastIndexOf(':');
    if (lastColon !== -1 && lastColon < title.length - 1) {
      const after = title.substring(lastColon + 1).trim();
      return after.replace(/\s+\d+$/, '').trim();
    }

    // Another fallback: split on the first ' - ' occurrence
    const dashIdx = title.indexOf(' - ');
    if (dashIdx !== -1 && dashIdx < title.length - 1) {
      const after = title.substring(dashIdx + 3).trim();
      return after.replace(/\s+\d+$/, '').trim();
    }

    // Final fallback: trim trailing numeric suffixes
    return title.replace(/\s+\d+$/, '').trim();
  }

  buildColorPopover(subjectName, colorInput, indicator) {
    const popover = document.createElement('div');
    popover.className = 'color-popover hidden';
    const palette = this.getThemePaletteColors();

    palette.forEach(hex => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'color-swatch-btn';
      sw.style.backgroundColor = hex;
      sw.addEventListener('click', async () => {
        indicator.style.backgroundColor = hex;
        colorInput.value = hex;
        await this.updateSubjectTagColor(subjectName, hex);
        popover.classList.add('hidden');
      });
      popover.appendChild(sw);
    });

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = 'color-swatch-btn custom';
    customBtn.textContent = 'Custom';
    customBtn.addEventListener('click', () => {
      colorInput.click();
      popover.classList.add('hidden');
    });
    popover.appendChild(customBtn);

    return popover;
  }

  getThemePaletteColors() {
    const style = getComputedStyle(document.body);
    const accent = style.getPropertyValue('--accent').trim() || '#3b82f6';
    const accentStrong = style.getPropertyValue('--accent-strong').trim() || accent;
    const header = style.getPropertyValue('--header-bg').trim() || accent;
    const surface = style.getPropertyValue('--surface').trim() || '#ffffff';
    const mix = (a, bColor, t = 0.5) => {
      const toRGB = (hex) => {
        let clean = (hex || '').replace('#', '');
        if (/^[0-9a-fA-F]{3}$/.test(clean)) {
          clean = clean.split('').map(ch => ch + ch).join('');
        }
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];
        return [
          parseInt(clean.substring(0, 2), 16),
          parseInt(clean.substring(2, 4), 16),
          parseInt(clean.substring(4, 6), 16)
        ];
      };
      const [r1, g1, b1] = toRGB(a);
      const [r2, g2, b2] = toRGB(bColor);
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `#${r.toString(16).padStart(2, '0')}${g
        .toString(16)
        .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    return [
      accent,
      accentStrong,
      header,
      mix(accent, surface, 0.25),
      mix(accentStrong, surface, 0.5),
      mix(header, surface, 0.35)
    ];
  }

  showRefreshToast(summary) {
    const toast = document.getElementById('refreshToast');
    if (!toast || !summary) return;

    const { added = 0, updated = 0, removed = 0, timestamp } = summary;
    toast.textContent = `Calendar refreshed: +${added} added, ${updated} updated, ${removed} removed${timestamp ? ` · ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`;
    toast.classList.remove('hidden');
    toast.classList.add('visible');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 5000);
  }

  animateCompletion(target) {
    if (!target) return;
    target.classList.add('completing');
    const cb = target.querySelector('.event-checkbox');
    if (cb) {
      cb.classList.add('checked-anim');
    }
    // Nudge the card slightly before it moves
    target.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    target.style.transform = 'scale(0.99)';
    target.style.opacity = '0.9';
    setTimeout(() => {
      target.style.transform = '';
      target.style.opacity = '';
      target.classList.add('moving-down');
    }, 900); // match original flow for confetti + slide
    this.launchConfetti(target);
  }

  launchConfetti(target) {
    if (!target) return;
    const container = document.createElement('div');
    container.className = 'confetti-container';
    const themeColors = this.getThemeConfettiColors();
    const colors = themeColors.length ? themeColors : ['#e63946', '#f77f00', '#2a9d8f', '#118ab2', '#8338ec', '#ff006e', '#8ac926'];

    for (let i = 0; i < 14; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.2}s`;
      piece.style.setProperty('--confetti-rotation', `${Math.random() * 360}deg`);
      container.appendChild(piece);
    }

    target.appendChild(container);
    setTimeout(() => {
      container.remove();
    }, 1200);
  }

  getThemeConfettiColors() {
    try {
      const style = getComputedStyle(document.body);
      const accent = style.getPropertyValue('--accent').trim() || '#3b82f6';
      const accentStrong = style.getPropertyValue('--accent-strong').trim() || accent;
      const header = style.getPropertyValue('--header-bg').trim() || accent;
      const contrast = style.getPropertyValue('--accent-contrast').trim() || '#ffffff';
      const lighten = (hex, amt) => {
        const clean = hex.replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
        const num = parseInt(clean, 16);
        const r = Math.min(255, Math.max(0, (num >> 16) + amt));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
        const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
        return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
      };
      return [
        accent,
        accentStrong,
        header,
        contrast,
        lighten(accent.replace('#', ''), 30),
        lighten(accentStrong.replace('#', ''), 45)
      ];
    } catch (e) {
      return [];
    }
  }
}

// Initialize the UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing UIController...');
  try {
    new UIController();
    console.log('UIController initialized successfully');
    requestAnimationFrame(() => {
      document.body.classList.add('popup-ready');
    });
  } catch (error) {
    console.error('Failed to initialize UIController:', error);
  }
});
