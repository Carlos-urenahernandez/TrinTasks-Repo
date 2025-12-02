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

    // Also parse VTODO entries (assignments/tasks)
    const todoRegex = /BEGIN:VTODO([\s\S]*?)END:VTODO/g;
    let todoMatch;
    while ((todoMatch = todoRegex.exec(icalContent)) !== null) {
      const todoData = todoMatch[1];
      const todo = this.parseTodo(todoData);
      if (todo) {
        events.push(todo);
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

    // Extract SUMMARY (title)
    let match = eventData.match(/SUMMARY:(.+?)(?:\r?\n|$)/);
    event.title = match ? this.decodeText(match[1].trim()) : 'Untitled Event';

    // Check if this is an assignment based on keywords in the title
    const isAssignment = /\b(due|assignment|homework|test|quiz|exam|project|paper|lab|presentation)\b/i.test(event.title);
    event.isAssignment = isAssignment;

    // Try to extract time from the title if it contains "due" info
    if (isAssignment && event.title) {
      // Look for time patterns like "8:55 a.m.", "11:59 PM", "9am", etc.
      const timeMatch = event.title.match(/(\d{1,2}:\d{2}\s*[ap]\.?m\.?|\d{1,2}\s*[ap]\.?m\.?)/i);
      if (timeMatch) {
        event.extractedTime = timeMatch[1];
      }
    }

    // Extract DESCRIPTION
    match = eventData.match(/DESCRIPTION:(.+?)(?:\r?\n(?=[A-Z])|$)/s);
    if (match) {
      event.description = this.decodeText(match[1].trim().replace(/\\n/g, '\n'));
    }

    // Extract LOCATION
    match = eventData.match(/LOCATION:(.+?)(?:\r?\n|$)/);
    event.location = match ? this.decodeText(match[1].trim()) : null;

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

  static parseTodo(todoData) {
    const todo = {};
    let match;

    match = todoData.match(/SUMMARY:(.+?)(?:\r?\n|$)/);
    todo.title = match ? this.decodeText(match[1].trim()) : 'Untitled Task';

    match = todoData.match(/DESCRIPTION:(.+?)(?:\r?\n(?=[A-Z])|$)/s);
    if (match) {
      todo.description = this.decodeText(match[1].trim().replace(/\\n/g, '\n'));
    }

    match = todoData.match(/DUE(?:;VALUE=DATE|;TZID=[^:]*)?:(.+?)(?:\r?\n|$)/);
    if (match) {
      const rawDue = match[1].trim();
      todo.startRaw = rawDue; // use startRaw for sorting (due date)
      todo.startTime = this.formatDateTime(rawDue);
      todo.dueRaw = rawDue;
    } else {
      todo.startRaw = null;
      todo.startTime = null;
      todo.dueRaw = null;
    }

    match = todoData.match(/UID:(.+?)(?:\r?\n|$)/);
    todo.uid = match ? match[1].trim() : null;

    match = todoData.match(/STATUS:(.+?)(?:\r?\n|$)/);
    todo.status = match ? match[1].trim() : null;

    // completed timestamp if provided
    match = todoData.match(/COMPLETED:(.+?)(?:\r?\n|$)/);
    todo.completed = match ? this.formatDateTime(match[1].trim()) : null;

    return todo;
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
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
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
    this.parseBtn = document.getElementById('parseBtn');
    this.icalLinkInput = document.getElementById('icalLink');
    this.inputSection = document.querySelector('.input-section');
    this.loadingSpinner = document.getElementById('loadingSpinner');
    this.errorMessage = document.getElementById('errorMessage');
    this.mainContent = document.getElementById('mainContent');
    this.eventsList = document.getElementById('eventsList');
    this.eventsContainer = document.getElementById('eventsContainer');
    this.noData = document.getElementById('noData');
    this.viewToggle = document.getElementById('viewToggle');
    this.toggleBtn = document.getElementById('toggleBtn');
    this.toggleIcon = document.getElementById('toggleIcon');
    this.toggleText = document.getElementById('toggleText');
    this.calendarView = document.getElementById('calendarView');
    this.calendarTitle = document.getElementById('calendarTitle');
    this.calendarDays = document.getElementById('calendarDays');
    this.prevMonthBtn = document.getElementById('prevMonth');
    this.nextMonthBtn = document.getElementById('nextMonth');

    this.currentView = 'calendar'; // 'list' or 'calendar' - default to calendar
    this.events = [];
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    this.currentDate = new Date(); // focused date for day/week navigation
    this.viewMode = 'week'; // 'week' | 'day' | 'month'

    this.setupEventListeners();
    this.loadSavedData();
    this.savedStatuses = {};
  }

  setupEventListeners() {
    this.parseBtn.addEventListener('click', () => this.handleParse());
    this.icalLinkInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleParse();
      }
    });
    this.toggleBtn.addEventListener('click', () => this.toggleView());
    this.prevMonthBtn.addEventListener('click', () => this.navigateMonth(-1));
    this.nextMonthBtn.addEventListener('click', () => this.navigateMonth(1));

    // View mode buttons
    const weekBtn = document.getElementById('weekBtn');
    const dayBtn = document.getElementById('dayBtn');
    const monthBtn = document.getElementById('monthBtn');
    if (weekBtn && dayBtn && monthBtn) {
      weekBtn.addEventListener('click', () => this.setViewMode('week'));
      dayBtn.addEventListener('click', () => this.setViewMode('day'));
      monthBtn.addEventListener('click', () => this.setViewMode('month'));
    }
  }

  setViewMode(mode) {
    this.viewMode = mode;
    // update active class
    const map = { weekBtn: 'week', dayBtn: 'day', monthBtn: 'month' };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (map[id] === mode) el.classList.add('active'); else el.classList.remove('active');
    });

    // Recompute currentDate/currentMonth/currentYear if needed
    this.currentMonth = this.currentDate.getMonth();
    this.currentYear = this.currentDate.getFullYear();

    // Rebuild index and render according to mode
    if (this.events && this.events.length) {
      let eventsForView = [];
      if (mode === 'month') {
        eventsForView = this.filterEventsForMonth(this.events, this.currentMonth, this.currentYear);
      } else if (mode === 'week') {
        const weekDates = this.getDatesForWeek(this.currentDate);
        eventsForView = this.filterEventsForDates(this.events, weekDates);
      } else if (mode === 'day') {
        const ds = this.formatDateKey(this.currentDate);
        eventsForView = this.filterEventsForDates(this.events, [ds]);
      }
      this.buildCalendarIndex(eventsForView);
      // refresh calendar and list
      this.renderCalendar();
      this.renderEventsListForCurrentView(eventsForView);
    }
  }

  formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  getDatesForWeek(centerDate) {
    const d = new Date(centerDate.getFullYear(), centerDate.getMonth(), centerDate.getDate());
    const day = d.getDay(); // 0..6
    const start = new Date(d);
    start.setDate(d.getDate() - day); // Sunday
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + i);
      dates.push(this.formatDateKey(dd));
    }
    return dates;
  }

  filterEventsForDates(events, dateKeys) {
    const set = new Set(dateKeys);
    return (events || []).filter(ev => {
      const raw = ev.dueRaw || ev.startRaw || ev.dueTime || ev.startTime;
      if (!raw) return false;
      const datePart = raw.split('T')[0].replace(/\D/g, '').substring(0,8);
      return set.has(datePart);
    });
  }

  renderEventsListForCurrentView(eventsForView) {
    // Show the events list and populate with provided events
    this.eventsContainer.innerHTML = '';
    const frag = document.createDocumentFragment();
    eventsForView.forEach(ev => frag.appendChild(this.createEventElement(ev)));
    this.eventsContainer.appendChild(frag);
    // ensure list is visible
    this.eventsList.classList.remove('hidden');
    this.calendarView.classList.remove('hidden');
  }

  async handleParse() {
    const url = this.icalLinkInput.value.trim();

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
      const events = await ICalParser.fetchAndParse(url);
      this.displayEvents(events);
      // Save to chrome storage
      await this.saveToStorage(url, events);
    } catch (error) {
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

    console.log('displayEvents called with', events.length, 'events');
    console.log('Sample events:', events.slice(0, 3));

    // Store events for calendar view (full set)
    this.events = events;
    this.currentDate = new Date();
    // default to week view on load
    this.viewMode = 'week';

    // Show event count in header
    const eventCountEl = document.getElementById('eventCount');
    if (eventCountEl) {
      eventCountEl.textContent = `(${events.length} events loaded)`;
    }

    // Build index and render depending on viewMode (week/day/month)
    if (this.viewMode === 'month') {
      const month = this.currentMonth;
      const year = this.currentYear;
      const eventsThisMonth = this.filterEventsForMonth(events, month, year);
      eventsThisMonth.sort((a, b) => ICalParser.iCalDateToTimestamp(b.dueRaw || b.startRaw || b.dueTime || b.startTime) - ICalParser.iCalDateToTimestamp(a.dueRaw || a.startRaw || a.dueTime || a.startTime));
      this.buildCalendarIndex(eventsThisMonth);
      this.renderEventsListForCurrentView(eventsThisMonth);
    } else if (this.viewMode === 'week') {
      const weekDates = this.getDatesForWeek(this.currentDate);
      const eventsThisWeek = this.filterEventsForDates(events, weekDates);
      eventsThisWeek.sort((a, b) => ICalParser.iCalDateToTimestamp(b.dueRaw || b.startRaw || b.dueTime || b.startTime) - ICalParser.iCalDateToTimestamp(a.dueRaw || a.startRaw || a.dueTime || a.startTime));
      this.buildCalendarIndex(eventsThisWeek);
      this.renderEventsListForCurrentView(eventsThisWeek);
    } else { // day
      const ds = this.formatDateKey(this.currentDate);
      const eventsToday = this.filterEventsForDates(events, [ds]);
      this.buildCalendarIndex(eventsToday);
      this.renderEventsListForCurrentView(eventsToday);
    }

    // Hide input section and show main content
    this.inputSection.classList.add('hidden');
    this.noData.classList.add('hidden');
    this.mainContent.classList.remove('hidden');
    this.viewToggle.classList.remove('hidden');

    // Show calendar view by default
    this.currentView = 'calendar';
    this.calendarView.classList.remove('hidden');
    this.eventsList.classList.add('hidden');
    this.renderCalendar();
  }

  /**
   * Return events that belong to the given month/year (local timezone)
   * Uses dueRaw or startRaw when available.
   */
  filterEventsForMonth(events, month, year) {
    if (!Array.isArray(events)) return [];
    return events.filter(ev => {
      const raw = ev.dueRaw || ev.startRaw || ev.dueTime || ev.startTime;
      if (!raw) return false;
      const part = raw.split('T')[0].replace(/\D/g, '').substring(0, 8);
      if (part.length !== 8) return false;
      const evYear = parseInt(part.substring(0,4), 10);
      const evMonth = parseInt(part.substring(4,6), 10) - 1; // 0-index
      return evYear === year && evMonth === month;
    });
  }

  /**
   * Build a simple index mapping YYYYMMDD -> [events]
   * for the currently-rendered month to speed up calendar lookups
   */
  buildCalendarIndex(events) {
    this.calendarEventIndex = {};
    (events || []).forEach(ev => {
      const raw = ev.dueRaw || ev.startRaw || ev.dueTime || ev.startTime;
      if (!raw) return;
      const datePart = raw.split('T')[0].replace(/\D/g, '').substring(0,8);
      if (!datePart || datePart.length !== 8) return;
      if (!this.calendarEventIndex[datePart]) this.calendarEventIndex[datePart] = [];
      this.calendarEventIndex[datePart].push(ev);
    });
  }

  createEventElement(event) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event';

    // Determine effective status (saved by user or provided by calendar)
    const effectiveStatus = (this.savedStatuses && event.uid && this.savedStatuses[event.uid]) || event.status || null;

    // Decode title (convert HTML entities like &#160;) then split course/title
    const rawTitleStr = this.decodeHtmlEntities(event.title || '');

    // Add assignment indicator for Trinity format
    let typeIcon = '';
    if (event.isAssignment) {
      typeIcon = '📚 ';
    }

    // Add priority indicator
    let priorityIcon = '';
    if (event.priority !== undefined) {
      if (event.priority >= 1 && event.priority <= 3) {
        priorityIcon = '🔴 '; // High priority
      } else if (event.priority >= 4 && event.priority <= 6) {
        priorityIcon = '🟡 '; // Medium priority
      } else if (event.priority >= 7 && event.priority <= 9) {
        priorityIcon = '🟢 '; // Low priority
      }
    }

    // Smart-split course and assignment title
    const split = this.smartSplitTitle(rawTitleStr);
    let courseName = split.course || null;
    let assignmentTitle = split.assignment || rawTitleStr;

    const escapedCourse = courseName ? this.escapeHtml(courseName) : '';
    const escapedAssignmentTitle = this.escapeHtml(assignmentTitle || '');

    // Add completed status indicator (from calendar or user-saved)
    let titleHtml;
    if (effectiveStatus === 'COMPLETED' || event.completedTime) {
      titleHtml = `✅ <div class="title-block"><div class="icons">${typeIcon}${priorityIcon}</div><div class="title-text"><div class="course-name">${escapedCourse}</div><div class="assignment-title" style="color:#6b7280;text-decoration:line-through;">${escapedAssignmentTitle}</div></div></div>`;
    } else {
      titleHtml = `<div class="title-block"><div class="icons">${typeIcon}${priorityIcon}</div><div class="title-text"><div class="course-name">${escapedCourse}</div><div class="assignment-title">${escapedAssignmentTitle}</div></div></div>`;
    }

    // Add progress indicator if available
    if (event.percentComplete !== undefined && event.percentComplete < 100 && !event.completedTime) {
      titleHtml += ` <span style="font-size: 11px; color: #6b7280;">(${event.percentComplete}%)</span>`;
    }

    let html = `<div class="event-title">${titleHtml}</div>`;
    html += '<div class="event-details">';

    // Show DUE date if available (for tasks/todos)
    if (event.dueTime) {
      const isOverdue = !(effectiveStatus === 'COMPLETED' || event.completedTime) && event.dueRaw &&
                       ICalParser.iCalDateToTimestamp(event.dueRaw) < Date.now();
      const dueStyle = isOverdue ? 'color: #dc2626; font-weight: 700;' : 'color: #dc2626; font-weight: 600;';
      const dueLabel = isOverdue ? '⚠️ OVERDUE:' : 'Due:';

      html += `<div class="event-detail">
        <span class="event-detail-label">${dueLabel}</span>
        <span class="event-detail-value" style="${dueStyle}">${event.dueTime}</span>
      </div>`;
    }

    // Show completed date if available
    if (event.completedTime) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Completed:</span>
        <span class="event-detail-value" style="color: #10b981;">${event.completedTime}</span>
      </div>`;
    }

    if (event.startTime) {
      html += `<div class="event-detail">
        <span class="event-detail-label">${event.dueTime ? 'Start:' : 'Date:'}</span>
        <span class="event-detail-value">${event.startTime}</span>
      </div>`;
    }

    if (event.endTime) {
      html += `<div class="event-detail">
        <span class="event-detail-label">End:</span>
        <span class="event-detail-value">${event.endTime}</span>
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
    // Add status selector so users can update assignment/task status locally
    const uidForSelect = this.escapeHtml(event.uid || '');
    // add clear separation from description
    html += `<div class="event-detail" style="margin-top:10px;border-top:1px solid #e6e6e6;padding-top:8px;">
      <span class="event-detail-label">Status:</span>
      <span class="event-detail-value">
        <select class="status-select" data-uid="${uidForSelect}">
          <option value="">—</option>
          <option value="NEEDS-ACTION">Not Started</option>
          <option value="IN-PROCESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </span>
    </div>`;

    html += '</div>';

    if (event.description) {
      const decodedDesc = this.decodeHtmlEntities(event.description || '');
      html += `<div class="event-description" style="margin-top:8px;">${this.escapeHtml(decodedDesc)}</div>`;
    }

    eventDiv.innerHTML = html;
    // Wire up status select behavior
    const select = eventDiv.querySelector('.status-select');
    if (select) {
      const uid = select.dataset.uid;
      const current = this.getStatusForEvent(event) || '';
      select.value = current;

      select.addEventListener('change', async (e) => {
        const val = e.target.value || null;
        await this.saveStatusToStorage(uid, val);
        // Re-render events list to reflect new status/overdue styling
        if (this.events && this.events.length > 0) {
          this.displayEvents(this.events);
        }
      });
    }

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

  // Decode HTML entities such as &nbsp; or numeric entities like &#160;
  decodeHtmlEntities(text) {
    if (!text) return text;
    try {
      const txt = document.createElement('textarea');
      txt.innerHTML = text;
      return txt.value;
    } catch (e) {
      return text;
    }
  }

  /**
   * Smartly split a raw title into course name and assignment title.
   * Tries several separators and heuristics to handle cases like:
   * "English 12, The Basis of Leisure FA: Read Psychology" or
   * "DREAMS: A SYMPOSIUM/Fa - E: Prophetic Dreams"
   * Returns { course, assignment }
   */
  smartSplitTitle(raw) {
    if (!raw) return { course: '', assignment: '' };
    const s = raw.trim();

    // Helper to normalize candidate
    const normalize = (str) => str.trim();

    // If course names consistently end with " - <letter>", prioritize splitting there.
    // Example: "English 12, The Basis of Leisure FA - E: Prophetic Dreams"
    const dashLetterMatch = s.match(/^(.+?\s-\s[A-Za-z])\s*(?:[:\-|–—|\|,]\s*)?(.*)$/);
    if (dashLetterMatch) {
      const courseCandidate = normalize(dashLetterMatch[1]);
      const assignmentCandidate = normalize(dashLetterMatch[2] || '');
      if (this.isLikelyCourse(courseCandidate)) {
        return { course: courseCandidate, assignment: assignmentCandidate };
      }
    }

    // Try primary separators in order of likelihood
    const separators = [':', ' - ', ' – ', ' — ', ' | ', '\\|'];
    for (const sep of separators) {
      const parts = s.split(new RegExp(sep));
      if (parts.length >= 2) {
        const left = normalize(parts[0]);
        const right = normalize(parts.slice(1).join(typeof sep === 'string' ? sep : ' '));
        if (this.isLikelyCourse(left)) {
          return { course: left, assignment: right };
        }
        // Sometimes course is on the right (rare) - check the other way
        if (this.isLikelyCourse(right)) {
          return { course: right, assignment: left };
        }
      }
    }

    // If no separator worked, try splitting on first comma if left looks like a course
    if (s.includes(',')) {
      const idx = s.indexOf(',');
      const left = normalize(s.substring(0, idx));
      const right = normalize(s.substring(idx + 1));
      if (this.isLikelyCourse(left)) return { course: left, assignment: right };
    }

    // As a fallback, try to detect course-like prefix (e.g., starts with subject+number)
    const words = s.split('\n')[0].split(/\s+/);
    if (words.length > 0 && /^[A-Za-z]+\s*\d{1,2}/.test(s)) {
      // take the first chunk up to a dash or colon if present
      const m = s.match(/^(.{1,60}?)(?:[:\-|–—|\|,]|$)/);
      if (m && this.isLikelyCourse(m[1].trim())) {
        const course = m[1].trim();
        const assignment = s.substring(m[1].length).replace(/^[:\-|–—|\|,\s]+/, '').trim();
        return { course, assignment };
      }
    }

    // Final fallback: no clear course, return empty course and full string as assignment
    return { course: '', assignment: s };
  }

  /**
   * Heuristic to decide whether a string is likely a course name.
   * Checks for numbers (grade numbers), semester tokens, short length, or typical words.
   */
  isLikelyCourse(str) {
    if (!str) return false;
    const s = str.trim();
    // If it contains semester tokens (FA, SP, SU, FALL, SPRING, SUMMER, WINTER)
    if (/\b(F\.?A\.?|FA|SP|SU|WI|FALL|SPRING|SUMMER|WINTER|SEM|SEMESTER|TERM|S\d)\b/i.test(s)) return true;
    // If it contains a course number like 'English 12' or 'MATH 101'
    if (/\b\d{1,3}\b/.test(s)) return true;
    // If it's reasonably short (<= 80 chars) and has few verbs (likely a title)
    if (s.length < 80 && !/\b(read|write|submit|turn in|due|complete|upload)\b/i.test(s)) return true;
    return false;
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

  toggleView() {
    if (this.currentView === 'calendar') {
      this.currentView = 'list';
      this.calendarView.classList.add('hidden');
      this.eventsList.classList.remove('hidden');
      this.toggleIcon.textContent = '📅';
      this.toggleText.textContent = 'Calendar View';
    } else {
      this.currentView = 'calendar';
      this.eventsList.classList.add('hidden');
      this.calendarView.classList.remove('hidden');
      this.toggleIcon.textContent = '📋';
      this.toggleText.textContent = 'List View';
      this.renderCalendar();
    }
  }

  navigateMonth(direction) {
    this.currentMonth += direction;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    // Rebuild the calendar index for the newly selected month so the user
    // can navigate months without re-parsing the iCal feed.
    if (this.events && this.events.length) {
      const eventsThisMonth = this.filterEventsForMonth(this.events, this.currentMonth, this.currentYear);
      this.buildCalendarIndex(eventsThisMonth);

      // If currently in list view, refresh the list to show events for the new month
      if (this.currentView === 'list') {
        this.eventsContainer.innerHTML = '';
        const frag = document.createDocumentFragment();
        eventsThisMonth.forEach(ev => {
          const el = this.createEventElement(ev);
          frag.appendChild(el);
        });
        this.eventsContainer.appendChild(frag);
      }
    }

    this.renderCalendar();
  }

  renderCalendar() {
    // renderCalendar called; calendarEventIndex will be used for fast lookups

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    this.calendarTitle.textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;

    // Get first day of the month
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const prevLastDay = new Date(this.currentYear, this.currentMonth, 0);

    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();

    this.calendarDays.innerHTML = '';

    // Get today's date for highlighting
    const today = new Date();
    const isCurrentMonth = today.getMonth() === this.currentMonth && today.getFullYear() === this.currentYear;
    const todayDate = today.getDate();

    // Add previous month's days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dayElement = this.createDayElement(day, true, false);
      this.calendarDays.appendChild(dayElement);
    }

    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = isCurrentMonth && day === todayDate;
      const dayElement = this.createDayElement(day, false, isToday);
      this.calendarDays.appendChild(dayElement);
    }

    // Add next month's days to complete the grid
    const totalCells = this.calendarDays.children.length;
    const remainingCells = (Math.ceil(totalCells / 7) * 7) - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
      const dayElement = this.createDayElement(day, true, false);
      this.calendarDays.appendChild(dayElement);
    }
  }

  createDayElement(dayNumber, isOtherMonth, isToday) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    if (isOtherMonth) dayDiv.classList.add('other-month');
    if (isToday) dayDiv.classList.add('today');

    const dayNumberDiv = document.createElement('div');
    dayNumberDiv.className = 'day-number';

    const dayText = document.createElement('span');
    dayText.textContent = dayNumber;
    dayNumberDiv.appendChild(dayText);

    if (!isOtherMonth) {
      const date = new Date(this.currentYear, this.currentMonth, dayNumber);
      const eventsForDay = this.getEventsForDate(date);

      console.log(`Day ${dayNumber}: Found ${eventsForDay.length} events`, eventsForDay);

      if (eventsForDay.length > 0) {
        const eventCount = document.createElement('span');
        eventCount.className = 'event-count';
        eventCount.textContent = eventsForDay.length;
        dayNumberDiv.appendChild(eventCount);

        // Make the entire day clickable with visual feedback
        dayDiv.style.cursor = 'pointer';

        // Check if any events have due dates (assignments/tasks)
        const hasDueDates = eventsForDay.some(event => event.dueRaw || event.dueTime);

        if (hasDueDates) {
          dayDiv.classList.add('has-due-dates');
        } else {
          dayDiv.classList.add('has-events');
        }
      }

      // Add click handler to all current month days (not just days with events)
      dayDiv.addEventListener('click', (e) => {
        console.log('Day clicked!', date, eventsForDay);
        e.stopPropagation();
        e.preventDefault();
        this.showDayDetail(date, eventsForDay);
      });
    }

    dayDiv.appendChild(dayNumberDiv);
    return dayDiv;
  }

  showDayDetail(date, events) {
    console.log('showDayDetail called with:', date, events);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'day-detail-overlay';

    console.log('Overlay created, appending to container');

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'day-detail-modal';

    // Create header
    const header = document.createElement('div');
    header.className = 'day-detail-header';

    const title = document.createElement('div');
    title.className = 'day-detail-title';
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    title.textContent = date.toLocaleDateString('en-US', options);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'day-detail-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create events container
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'day-detail-events';

    if (events.length === 0) {
      const noEvents = document.createElement('div');
      noEvents.className = 'day-detail-no-events';
      noEvents.textContent = 'No events for this day';
      eventsContainer.appendChild(noEvents);
    } else {
      events.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'day-detail-event';

        const eventTitle = document.createElement('div');
        eventTitle.className = 'day-detail-event-title';

        // Decode title and smart-split course/assignment
        const rawTitle = this.decodeHtmlEntities(event.title || '');
        const parts = this.smartSplitTitle(rawTitle);
        let course = parts.course || null;
        let assignTitle = parts.assignment || rawTitle;

        // Build icons
        let icons = '';
        if (event.isAssignment) icons += '📚 ';
        if (event.priority !== undefined) {
          if (event.priority >= 1 && event.priority <= 3) icons += '🔴 ';
          else if (event.priority >= 4 && event.priority <= 6) icons += '🟡 ';
          else if (event.priority >= 7 && event.priority <= 9) icons += '🟢 ';
        }

        const escCourse = course ? this.escapeHtml(course) : '';
        const escAssign = this.escapeHtml(assignTitle);

        if (event.status === 'COMPLETED' || event.completedTime) {
              eventTitle.innerHTML = `✅ <div class="course-name">${escCourse}</div><div class="assignment-title" style="color:#6b7280;text-decoration:line-through;">${escAssign}</div>`;
            } else {
              eventTitle.innerHTML = `<div class="course-name">${icons}${escCourse}</div><div class="assignment-title">${escAssign}</div>`;
        }

        // Add progress indicator if available
        if (event.percentComplete !== undefined && event.percentComplete < 100 && !event.completedTime) {
          const progress = document.createElement('span');
          progress.style.cssText = 'font-size: 12px; color: #6b7280; margin-left: 8px;';
          progress.textContent = `(${event.percentComplete}%)`;
          eventTitle.appendChild(progress);
        }

        eventDiv.appendChild(eventTitle);

        // Show DUE date for tasks/todos
        if (event.dueTime) {
          const eventDue = document.createElement('div');
          eventDue.className = 'day-detail-event-time';

          const isOverdue = !(this.getStatusForEvent(event) === 'COMPLETED' || event.completedTime) && event.dueRaw &&
                           ICalParser.iCalDateToTimestamp(event.dueRaw) < Date.now();

          if (isOverdue) {
            eventDue.style.color = '#dc2626';
            eventDue.style.fontWeight = '700';
            eventDue.textContent = `⚠️ OVERDUE: ${this.formatTimeForDisplay(event.dueTime)}`;
          } else {
            eventDue.style.color = '#dc2626';
            eventDue.style.fontWeight = '600';
            eventDue.textContent = `⏰ Due: ${this.formatTimeForDisplay(event.dueTime)}`;
          }
          eventDiv.appendChild(eventDue);
        }

        // Show completed date if available
        if (event.completedTime) {
          const eventCompleted = document.createElement('div');
          eventCompleted.className = 'day-detail-event-time';
          eventCompleted.style.color = '#10b981';
          eventCompleted.textContent = `✅ Completed: ${this.formatTimeForDisplay(event.completedTime)}`;
          eventDiv.appendChild(eventCompleted);
        }

        // Show start/end time if available
        if (event.startTime) {
          const eventTime = document.createElement('div');
          eventTime.className = 'day-detail-event-time';
          // Format time better for display
          const startStr = this.formatTimeForDisplay(event.startTime);
          const endStr = event.endTime ? this.formatTimeForDisplay(event.endTime) : '';
          const timeLabel = event.dueTime ? '📅 Time:' : '📅';
          eventTime.textContent = `${timeLabel} ${startStr}${endStr ? ' - ' + endStr : ''}`;
          eventDiv.appendChild(eventTime);
        }

        if (event.location) {
          const eventLocation = document.createElement('div');
          eventLocation.className = 'day-detail-event-time';
          eventLocation.textContent = `📍 ${event.location}`;
          eventDiv.appendChild(eventLocation);
        }

        if (event.description) {
          const eventDesc = document.createElement('div');
          eventDesc.className = 'day-detail-event-description';
          eventDesc.textContent = this.decodeHtmlEntities(event.description || '');
          eventDiv.appendChild(eventDesc);
        }

        // Add a status selector for the day-detail view
        const statusWrapper = document.createElement('div');
        statusWrapper.className = 'day-detail-event-status';
        statusWrapper.style.cssText = 'margin-top:8px;border-top:1px solid #e6e6e6;padding-top:8px;';
        const statusLabel = document.createElement('span');
        statusLabel.textContent = 'Status: ';
        statusLabel.style.fontWeight = '600';
        statusWrapper.appendChild(statusLabel);

        const statusSelect = document.createElement('select');
        statusSelect.className = 'status-select';
        statusSelect.dataset.uid = event.uid || '';
        ['','NEEDS-ACTION','IN-PROCESS','COMPLETED','CANCELLED'].forEach(v => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v === '' ? '—' : (v === 'NEEDS-ACTION' ? 'Not Started' : (v === 'IN-PROCESS' ? 'In Progress' : (v === 'COMPLETED' ? 'Completed' : 'Cancelled')));
          statusSelect.appendChild(opt);
        });

        // Set current value
        const currentStatus = this.getStatusForEvent(event) || '';
        statusSelect.value = currentStatus;

        statusSelect.addEventListener('change', async (e) => {
          const val = e.target.value || null;
          await this.saveStatusToStorage(event.uid, val);
          // Update UI in place for this modal item: rebuild title with same rules
          const titleEl = eventDiv.querySelector('.day-detail-event-title');
          const raw = this.decodeHtmlEntities(event.title || '');
          const parts2 = this.smartSplitTitle(raw);
          let course = parts2.course || null;
          let assignTitle = parts2.assignment || raw;

          let icons2 = '';
          if (event.isAssignment) icons2 += '📚 ';
          if (event.priority !== undefined) {
            if (event.priority >= 1 && event.priority <= 3) icons2 += '🔴 ';
            else if (event.priority >= 4 && event.priority <= 6) icons2 += '🟡 ';
            else if (event.priority >= 7 && event.priority <= 9) icons2 += '🟢 ';
          }

          const escCourse2 = course ? this.escapeHtml(course) : '';
          const escAssign2 = this.escapeHtml(assignTitle);

          if (val === 'COMPLETED') {
            titleEl.innerHTML = `✅ <div style="font-weight:700">${escCourse2}</div><div style="color:#6b7280">${escAssign2}</div>`;
          } else {
            titleEl.innerHTML = `<div style="font-weight:700">${icons2}${escCourse2}</div><div>${escAssign2}</div>`;
          }
        });

        statusWrapper.appendChild(statusSelect);
        eventDiv.appendChild(statusWrapper);

        eventsContainer.appendChild(eventDiv);
      });
    }

    modal.appendChild(header);
    modal.appendChild(eventsContainer);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Add to body with fixed positioning
    document.body.appendChild(overlay);
    console.log('Overlay appended to body with fixed positioning');
    console.log('Overlay element:', overlay);
    console.log('Overlay display:', window.getComputedStyle(overlay).display);
    console.log('Overlay z-index:', window.getComputedStyle(overlay).zIndex);
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

    // Use prebuilt index if available
    const eventsForDay = this.calendarEventIndex && this.calendarEventIndex[dateStr] ? this.calendarEventIndex[dateStr] : [];
    return eventsForDay;
  }

  async saveToStorage(url, events) {
    try {
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

  async loadSavedData() {
    try {
      const data = await chrome.storage.local.get(['icalUrl', 'events', 'lastUpdated', 'statuses']);

      this.savedStatuses = data.statuses || {};

      if (data.icalUrl && data.events) {
        this.icalLinkInput.value = data.icalUrl;
        // Defer heavy rendering to the next tick so popup can appear quickly
        setTimeout(() => this.displayEvents(data.events), 0);
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
  }

  async saveStatusToStorage(uid, status) {
    if (!uid) return;
    this.savedStatuses = this.savedStatuses || {};
    if (status) {
      this.savedStatuses[uid] = status;
    } else {
      delete this.savedStatuses[uid];
    }

    try {
      await chrome.storage.local.set({ statuses: this.savedStatuses });
      console.log('Saved status for', uid, status);
    } catch (e) {
      console.error('Failed to save status:', e);
    }
  }

  getStatusForEvent(event) {
    if (!event) return null;
    if (event.uid && this.savedStatuses && this.savedStatuses[event.uid]) {
      return this.savedStatuses[event.uid];
    }
    return event.status || null;
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
}

// Initialize the UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new UIController();
});
