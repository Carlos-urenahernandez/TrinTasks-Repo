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

    // Major assignments sidebar elements
    this.majorAssignmentsBar = document.getElementById('majorAssignmentsBar');
    this.majorListDiv = document.getElementById('majorList');
    this.showMajorAssignmentsCheckbox = document.getElementById('showMajorAssignments');

    this.events = [];
    this.subjectTags = {};
    this.currentTheme = 'fern';
    this.serenityWeatherCache = null;
    this.serenityRefreshTimer = null;
    this.serenityApplying = false;
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

    if (this.showMajorAssignmentsCheckbox) {
      this.showMajorAssignmentsCheckbox.addEventListener('change', () => {
        this.toggleMajorBarVisibility(this.showMajorAssignmentsCheckbox.checked);
        this.saveSettings();
      });
    }

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
    // Populate major assignments sidebar (if enabled)
    this.updateMajorAssignmentsBar();
  }

  toggleMajorBarVisibility(show) {
    if (!this.majorAssignmentsBar) return;
    if (show) {
      this.majorAssignmentsBar.classList.remove('hidden');
    } else {
      this.majorAssignmentsBar.classList.add('hidden');
    }
  }

  isMajorAssignment(event) {
    if (!event) return false;
    const text = `${event.title || ''} ${event.description || ''}`;
    // Keywords that indicate major assignments
    const re = /\b(test|quiz|exam|midterm|final|essay|paper|project|presentation|lab exam|oral exam)\b/i;
    return re.test(text);
  }

  updateMajorAssignmentsBar() {
    if (!this.majorListDiv || !this.majorAssignmentsBar) return;

    // Respect settings checkbox if present
    const showSetting = this.showMajorAssignmentsCheckbox ? this.showMajorAssignmentsCheckbox.checked : false;
    if (!showSetting) {
      this.majorAssignmentsBar.classList.add('hidden');
      return;
    }

    // Build list of major assignments that fall within the next 14 days, sorted by due date ascending
    const now = Date.now();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const majors = (this.events || []).filter(e => {
      if (!this.isMajorAssignment(e)) return false;
      const ts = ICalParser.iCalDateToTimestamp(e.dueRaw || e.startRaw) || 0;
      return ts >= now && ts <= (now + twoWeeksMs);
    });
    majors.sort((a, b) => {
      const ta = ICalParser.iCalDateToTimestamp(a.dueRaw || a.startRaw) || 0;
      const tb = ICalParser.iCalDateToTimestamp(b.dueRaw || b.startRaw) || 0;
      return ta - tb;
    });

    this.majorListDiv.innerHTML = '';
    if (majors.length === 0) {
      const p = document.createElement('div');
      p.className = 'major-empty';
      p.style.color = 'var(--text-muted)';
      p.style.fontSize = '13px';
      p.textContent = 'No major assignments found';
      this.majorListDiv.appendChild(p);
      return;
    }

    majors.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'major-item';
      const title = document.createElement('div');
      title.className = 'major-title';
      title.textContent = this.getCleanTitle(ev.title || ev.summary || 'Untitled');
      const meta = document.createElement('div');
      meta.className = 'major-meta';
      const when = ev.dueTime || ev.startTime || '';
      meta.textContent = when;
      item.appendChild(title);
      item.appendChild(meta);
      // clicking focuses the date/day in the main view
      item.addEventListener('click', () => {
        if (ev.dueRaw || ev.startRaw) {
          const raw = ev.dueRaw || ev.startRaw;
          const datePart = (raw.split('T')[0] || raw).replace(/\D/g, '').substring(0,8);
          if (datePart.length === 8) {
            const y = parseInt(datePart.substring(0,4),10);
            const m = parseInt(datePart.substring(4,6),10)-1;
            const d = parseInt(datePart.substring(6,8),10);
            this.selectedDate = new Date(y,m,d);
            this.renderWeekView();
            this.showEventsForSelectedDay();
          }
        }
      });
      this.majorListDiv.appendChild(item);
    });
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
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
    return false;
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
    const selectedTheme = theme || 'fern';
    const themeClass = `theme-${selectedTheme}`;
    const themes = ['theme-fern', 'theme-ocean', 'theme-sunset', 'theme-slate', 'theme-orchid', 'theme-midnight', 'theme-serenity'];
    themes.forEach(t => document.body.classList.remove(t));

    // Clear dynamic serenity overrides when leaving the mode
    if (selectedTheme !== 'serenity') {
      this.clearSerenityOverrides();
    }

    // enable a short transition class
    document.body.classList.add('theme-animating');
    setTimeout(() => document.body.classList.remove('theme-animating'), 400);

    if (!themes.includes(themeClass)) {
      document.body.classList.add('theme-fern');
      this.currentTheme = 'fern';
    } else if (themeClass === 'theme-serenity') {
      document.body.classList.add('theme-serenity');
      this.currentTheme = 'serenity';
      this.applySerenityTheme();
    } else {
      document.body.classList.add(themeClass);
      this.currentTheme = selectedTheme;
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
      ,
      showMajorAssignmentsBar: this.showMajorAssignmentsCheckbox ? !!this.showMajorAssignmentsCheckbox.checked : false
    });

    // If reminders are disabled, clear all scheduled reminder alarms
    if (!enableReminders) {
      await this.clearAllReminderAlarms();
    }

    // Setup auto-refresh if enabled
    if (autoRefresh) {
      this.setupAutoRefresh();
    } else if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
    // Update sidebar to reflect any setting change
    this.updateMajorAssignmentsBar();
  }

  async clearAllReminderAlarms() {
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
      if (this.showMajorAssignmentsCheckbox) {
        this.showMajorAssignmentsCheckbox.checked = false;
      }
      if (this.majorAssignmentsBar) {
        this.majorAssignmentsBar.classList.add('hidden');
      }
      this.loadSubjectTags();
      this.applyTheme('fern');
      this.closeSettings();
    }
  }

  async loadSettings() {
    const data = await chrome.storage.local.get(['autoRefresh', 'enableReminders', 'reminderHours', 'reminderSettings', 'theme', 'showMajorAssignmentsBar']);

    // Load reminder settings (default to enabled)
    this.enableRemindersCheckbox.checked = data.enableReminders !== false;

    // Load reminder hours (default to 24)
    const hrs = (data.reminderSettings && data.reminderSettings.hours) || data.reminderHours || 24;
    this.reminderHoursSelect.value = String(hrs);

    // Load theme
    this.applyTheme(data.theme || 'fern');

    // Load major assignments sidebar setting
    const showMajor = data.showMajorAssignmentsBar === true;
    if (this.showMajorAssignmentsCheckbox) {
      this.showMajorAssignmentsCheckbox.checked = showMajor;
    }
    this.toggleMajorBarVisibility(showMajor);
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

  async applySerenityTheme(forceWeatherRefresh = false) {
    if (this.serenityApplying || this.currentTheme !== 'serenity') return;
    this.serenityApplying = true;
    try {
      const now = new Date();
      const phase = this.getSerenityPhase(now);
      const weather = await this.getSerenityWeather(forceWeatherRefresh);
      const palette = this.buildSerenityPalette(phase, weather);
      this.setSerenityVariables(palette);
      this.scheduleSerenityRefresh(now);
    } catch (err) {
      console.warn('Serenity theme failed; falling back to static palette.', err);
    } finally {
      this.serenityApplying = false;
    }
  }

  getSerenityPhase(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 16) return 'day';
    if (hour >= 16 && hour < 19) return 'golden';
    if (hour >= 19 && hour < 22) return 'evening';
    return 'night';
  }

  async getSerenityWeather(forceRefresh = false) {
    if (!forceRefresh && this.serenityWeatherCache && Date.now() - this.serenityWeatherCache.timestamp < 30 * 60 * 1000) {
      return this.serenityWeatherCache;
    }

    if (!navigator.geolocation) {
      const fallback = { condition: 'clear', source: 'time-only', timestamp: Date.now() };
      this.serenityWeatherCache = fallback;
      return fallback;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 7000, maximumAge: 20 * 60 * 1000 });
      });
      const { latitude, longitude } = position.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,temperature_2m&timezone=auto`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Weather fetch failed: ${resp.status}`);
      }
      const data = await resp.json();
      const code = data?.current?.weather_code;
      const condition = this.mapWeatherCodeToCondition(code);
      const snapshot = { condition, code, timestamp: Date.now(), source: 'open-meteo' };
      this.serenityWeatherCache = snapshot;
      return snapshot;
    } catch (err) {
      console.warn('Serenity weather lookup failed; using clear fallback.', err);
      const fallback = { condition: 'clear', source: 'fallback', timestamp: Date.now() };
      this.serenityWeatherCache = fallback;
      return fallback;
    }
  }

  mapWeatherCodeToCondition(code) {
    if (code === 0) return 'clear';
    if ([1, 2, 3].includes(code)) return 'clouds';
    if ([45, 48].includes(code)) return 'fog';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain';
    if ([66, 67, 77].includes(code)) return 'sleet';
    if ([71, 73, 75, 85, 86].includes(code)) return 'snow';
    if ([95, 96, 99].includes(code)) return 'storm';
    return 'clear';
  }

  buildSerenityPalette(phase, weather = {}) {
    const basePalettes = {
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

    const palette = { ...(basePalettes[phase] || basePalettes.day) };
    const condition = weather.condition || 'clear';

    const blend = (hex1, hex2, t = 0.5) => {
      const toRGB = (hex) => {
        const clean = hex.replace('#', '');
        const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
        const val = parseInt(full || '000000', 16);
        return {
          r: (val >> 16) & 255,
          g: (val >> 8) & 255,
          b: val & 255
        };
      };
      const a = toRGB(hex1);
      const b = toRGB(hex2);
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bCh = Math.round(a.b + (b.b - a.b) * t);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bCh.toString(16).padStart(2, '0')}`;
    };

    const applyDarkness = (factor) => {
      if (factor <= 0) return;
      const clamp = Math.min(Math.max(factor, 0), 0.7);
      palette.pageBg = blend(palette.pageBg, '#0b1222', clamp);
      palette.surface = blend(palette.surface, '#0f1628', clamp * 0.9);
      palette.cardBg = blend(palette.cardBg, '#0f182a', clamp * 0.8);
      palette.cardBorder = blend(palette.cardBorder, '#1f2a3c', clamp * 0.7);
      palette.headerBg = blend(palette.headerBg, '#0b162a', clamp * 0.9);
      palette.toastBg = palette.headerBg;
      palette.textMain = blend(palette.textMain, '#f6f8fb', clamp * 0.6);
      palette.textMuted = blend(palette.textMuted, '#c7d2e2', clamp * 0.6);
    };

    if (condition === 'rain' || condition === 'sleet') {
      palette.accent = blend(palette.accent, '#4ba3f5', 0.55);
      palette.accentStrong = blend(palette.accentStrong, '#2563eb', 0.6);
      palette.pageBg = blend(palette.pageBg, '#e6f1fb', 0.5);
      palette.cardBg = blend(palette.cardBg, '#e9f2fc', 0.5);
    } else if (condition === 'storm') {
      palette.accent = blend(palette.accent, '#6366f1', 0.6);
      palette.accentStrong = blend(palette.accentStrong, '#4338ca', 0.65);
      palette.headerBg = blend(palette.headerBg, '#111827', 0.6);
      palette.toastBg = palette.headerBg;
    } else if (condition === 'snow') {
      palette.pageBg = blend(palette.pageBg, '#f7fbff', 0.7);
      palette.surface = blend(palette.surface, '#ffffff', 0.6);
      palette.cardBg = blend(palette.cardBg, '#f8fbff', 0.65);
      palette.accent = blend(palette.accent, '#9ccff7', 0.4);
      palette.textMuted = blend(palette.textMuted, '#5f7186', 0.6);
    } else if (condition === 'clouds' || condition === 'fog') {
      palette.accent = blend(palette.accent, '#7da0c9', 0.45);
      palette.accentStrong = blend(palette.accentStrong, '#4d6b9f', 0.45);
      palette.cardBg = blend(palette.cardBg, '#eef2f7', 0.5);
      palette.textMuted = blend(palette.textMuted, '#5b6675', 0.5);
    }

    // Darken in naturally darker or gloomy situations so Serenity matches the mood
    let darkness = 0;
    if (phase === 'night') darkness = 0.6;
    else if (phase === 'evening') darkness = 0.35;
    else if (phase === 'golden') darkness = 0.2;
    else if (phase === 'dawn') darkness = 0.15;

    if (['storm', 'rain', 'sleet', 'snow', 'clouds', 'fog'].includes(condition)) {
      darkness = Math.min(0.65, darkness + 0.15);
    }

    applyDarkness(darkness);

    return palette;
  }

  setSerenityVariables(palette) {
    const root = document.documentElement;
    const vars = {
      '--page-bg': palette.pageBg,
      '--surface': palette.surface,
      '--text-main': palette.textMain,
      '--text-muted': palette.textMuted,
      '--header-bg': palette.headerBg,
      '--header-text': palette.headerText,
      '--accent': palette.accent,
      '--accent-strong': palette.accentStrong,
      '--accent-contrast': palette.accentContrast,
      '--card-bg': palette.cardBg,
      '--card-border': palette.cardBorder,
      '--toast-bg': palette.toastBg
    };
    Object.entries(vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
  }

  scheduleSerenityRefresh(now = new Date()) {
    if (this.serenityRefreshTimer) {
      clearTimeout(this.serenityRefreshTimer);
    }
    const msToNextHour = Math.max(
      ((60 - now.getMinutes()) * 60 - now.getSeconds()) * 1000 - now.getMilliseconds(),
      5 * 60 * 1000
    );
    const msUntilWeatherRefresh = 25 * 60 * 1000;
    const delay = Math.min(msToNextHour, msUntilWeatherRefresh);
    this.serenityRefreshTimer = setTimeout(() => {
      if (this.currentTheme === 'serenity') {
        this.applySerenityTheme();
      }
    }, delay);
  }

  clearSerenityOverrides() {
    if (this.serenityRefreshTimer) {
      clearTimeout(this.serenityRefreshTimer);
      this.serenityRefreshTimer = null;
    }
    this.serenityWeatherCache = null;
    const root = document.documentElement;
    [
      '--page-bg',
      '--surface',
      '--text-main',
      '--text-muted',
      '--header-bg',
      '--header-text',
      '--accent',
      '--accent-strong',
      '--accent-contrast',
      '--card-bg',
      '--card-border',
      '--toast-bg'
    ].forEach(v => root.style.removeProperty(v));
  }

  showMessageToast(message) {
    const toast = document.getElementById('refreshToast');
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('visible');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 4000);
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
