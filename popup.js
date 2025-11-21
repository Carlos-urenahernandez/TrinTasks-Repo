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

    // Extract DESCRIPTION - handle multi-line descriptions properly
    match = eventData.match(/DESCRIPTION:(.+?)(?=\r?\n[A-Z-]+:|$)/s);
    if (match) {
      // Handle folded lines (lines that start with a space are continuations)
      let description = match[1].replace(/\r?\n\s/g, '');
      // Decode HTML entities and iCal escapes
      description = description.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
      description = description.replace(/&amp;/g, '&')
                              .replace(/&lt;/g, '<')
                              .replace(/&gt;/g, '>')
                              .replace(/&quot;/g, '"')
                              .replace(/&#39;/g, "'");
      event.description = this.decodeText(description.trim());
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

    // Settings elements
    this.settingsBtn = document.getElementById('settingsBtn');
    this.settingsPanel = document.getElementById('settingsPanel');
    this.closeSettingsBtn = document.getElementById('closeSettings');
    this.settingsIcalLink = document.getElementById('settingsIcalLink');
    this.savedCalendarsDiv = document.getElementById('savedCalendars');
    this.addCalendarBtn = document.getElementById('addCalendarBtn');
    this.clearDataBtn = document.getElementById('clearDataBtn');
    this.autoRefreshCheckbox = document.getElementById('autoRefresh');
    this.saveSettingsBtn = document.getElementById('saveSettings');
    this.cancelSettingsBtn = document.getElementById('cancelSettings');

    // Subject tags elements
    this.subjectTagsDiv = document.getElementById('subjectTags');
    this.newTagNameInput = document.getElementById('newTagName');
    this.newTagColorInput = document.getElementById('newTagColor');
    this.addTagBtn = document.getElementById('addTagBtn');

    this.currentView = 'calendar'; // 'list' or 'calendar' - default to calendar
    this.events = [];
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    this.savedCalendars = [];
    this.subjectTags = {};

    this.setupEventListeners();
    this.loadSavedData();
    this.loadSettings();
    this.loadSubjectTags();
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

    // Settings event listeners
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.addCalendarBtn.addEventListener('click', () => this.addCalendar());
    this.clearDataBtn.addEventListener('click', () => this.clearAllData());
    this.addTagBtn.addEventListener('click', () => this.addSubjectTag());

    // Close settings when clicking outside
    this.settingsPanel.addEventListener('click', (e) => {
      if (e.target === this.settingsPanel) {
        this.closeSettings();
      }
    });
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

    // Store events for calendar view
    this.events = events;

    // Show event count in header
    const eventCountEl = document.getElementById('eventCount');
    if (eventCountEl) {
      eventCountEl.textContent = `(${events.length} events loaded)`;
    }

    // Sort events by start/due date in reverse chronological order (newest first)
    // Prioritize DUE date over START date for tasks
    events.sort((a, b) => {
      const dateA = a.dueRaw || a.startRaw || a.dueTime || a.startTime;
      const dateB = b.dueRaw || b.startRaw || b.dueTime || b.startTime;
      const ta = ICalParser.iCalDateToTimestamp(dateA);
      const tb = ICalParser.iCalDateToTimestamp(dateB);
      return tb - ta; // descending
    });

    this.eventsContainer.innerHTML = '';

    events.forEach(event => {
      const eventElement = this.createEventElement(event);
      this.eventsContainer.appendChild(eventElement);
    });

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

  createEventElement(event) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event';
    if (event.isCompleted) {
      eventDiv.classList.add('completed');
    }

    // Apply subject color if available
    const subjectTag = this.getSubjectFromTitle(event.title);
    if (subjectTag) {
      eventDiv.style.borderLeftWidth = '4px';
      eventDiv.style.borderLeftColor = subjectTag.color;
      eventDiv.setAttribute('data-subject', subjectTag.name);
    }

    // Create header with checkbox for assignments
    const headerDiv = document.createElement('div');
    headerDiv.className = 'event-header';

    if (event.isAssignment) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'event-checkbox';
      checkbox.checked = event.isCompleted || false;
      checkbox.addEventListener('change', () => this.toggleAssignmentComplete(event));
      headerDiv.appendChild(checkbox);
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';

    let titleHtml = this.escapeHtml(event.title);

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

    // Add completed status indicator
    if (event.isCompleted) {
      titleHtml = `<span style="text-decoration: line-through; color: #6b7280;">${typeIcon}${priorityIcon}${titleHtml}</span>`;
    } else {
      titleHtml = `${typeIcon}${priorityIcon}${titleHtml}`;
    }

    // Add progress indicator if available
    if (event.percentComplete !== undefined && event.percentComplete < 100 && !event.isCompleted) {
      titleHtml += ` <span style="font-size: 11px; color: #6b7280;">(${event.percentComplete}%)</span>`;
    }

    titleDiv.innerHTML = titleHtml;
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
    this.eventsList.classList.add('hidden');
    this.calendarView.classList.add('hidden');
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
    this.renderCalendar();
  }

  renderCalendar() {
    console.log('renderCalendar called for', this.currentMonth, this.currentYear);
    console.log('Total events available:', this.events.length);

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

        // Build title with priority and status
        let titleContent = '';

        // Add assignment indicator for Trinity format
        if (event.isAssignment) {
          titleContent += '📚 ';
        }

        // Add priority indicator
        if (event.priority !== undefined) {
          if (event.priority >= 1 && event.priority <= 3) {
            titleContent += '🔴 '; // High priority
          } else if (event.priority >= 4 && event.priority <= 6) {
            titleContent += '🟡 '; // Medium priority
          } else if (event.priority >= 7 && event.priority <= 9) {
            titleContent += '🟢 '; // Low priority
          }
        }

        // Add completed status indicator
        if (event.status === 'COMPLETED' || event.completedTime) {
          eventTitle.innerHTML = `✅ <span style="text-decoration: line-through; color: #6b7280;">${titleContent}${this.escapeHtml(event.title)}</span>`;
        } else {
          eventTitle.innerHTML = `${titleContent}${this.escapeHtml(event.title)}`;
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

          const isOverdue = !event.completedTime && event.dueRaw &&
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
          eventDesc.textContent = event.description;
          eventDiv.appendChild(eventDesc);
        }

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

  async toggleAssignmentComplete(event) {
    const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;

    // Load existing completed assignments
    const data = await chrome.storage.local.get(['completedAssignments']);
    const completedAssignments = data.completedAssignments || {};

    if (event.isCompleted) {
      // Mark as incomplete
      delete completedAssignments[eventId];
      event.isCompleted = false;
      event.completedDate = null;
    } else {
      // Mark as complete
      completedAssignments[eventId] = {
        completedDate: new Date().toISOString(),
        title: event.title
      };
      event.isCompleted = true;
      event.completedDate = new Date().toISOString();
    }

    // Save updated completion status
    await chrome.storage.local.set({ completedAssignments });

    // Re-render the current view
    if (this.currentView === 'calendar') {
      this.renderCalendar();
    } else {
      this.displayEvents(this.events);
    }
  }

  async loadSavedData() {
    try {
      const data = await chrome.storage.local.get(['icalUrl', 'events', 'lastUpdated']);

      if (data.icalUrl && data.events) {
        this.icalLinkInput.value = data.icalUrl;
        this.displayEvents(data.events);
        console.log('Loaded saved data from storage');
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
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
    this.loadSavedCalendars();
    this.displaySubjectTags();
    this.settingsPanel.classList.remove('hidden');
  }

  closeSettings() {
    this.settingsPanel.classList.add('hidden');
  }

  async saveSettings() {
    const newUrl = this.settingsIcalLink.value.trim();

    if (newUrl && newUrl !== this.icalLinkInput.value) {
      this.icalLinkInput.value = newUrl;
      // Automatically parse the new URL
      await this.handleParse();
    }

    // Save auto-refresh setting
    const autoRefresh = this.autoRefreshCheckbox.checked;
    await chrome.storage.local.set({ autoRefresh });

    // Setup auto-refresh if enabled
    if (autoRefresh) {
      this.setupAutoRefresh();
    }

    this.closeSettings();
  }

  async addCalendar() {
    const url = this.settingsIcalLink.value.trim();
    if (!url) {
      alert('Please enter a valid iCal URL');
      return;
    }

    // Add to saved calendars
    if (!this.savedCalendars.includes(url)) {
      this.savedCalendars.push(url);
      await chrome.storage.local.set({ savedCalendars: this.savedCalendars });
      this.loadSavedCalendars();
    }
  }

  async loadSavedCalendars() {
    const data = await chrome.storage.local.get(['savedCalendars']);
    this.savedCalendars = data.savedCalendars || [];

    // Display saved calendars
    this.savedCalendarsDiv.innerHTML = '';
    if (this.savedCalendars.length === 0) {
      this.savedCalendarsDiv.innerHTML = '<p style="color: #9ca3af; font-size: 12px;">No saved calendars</p>';
    } else {
      this.savedCalendars.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'saved-calendar-item';

        const urlSpan = document.createElement('span');
        urlSpan.className = 'calendar-url';
        urlSpan.textContent = url;
        urlSpan.style.cursor = 'pointer';
        urlSpan.addEventListener('click', () => {
          this.settingsIcalLink.value = url;
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-calendar';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => this.deleteCalendar(index));

        item.appendChild(urlSpan);
        item.appendChild(deleteBtn);
        this.savedCalendarsDiv.appendChild(item);
      });
    }
  }

  async deleteCalendar(index) {
    this.savedCalendars.splice(index, 1);
    await chrome.storage.local.set({ savedCalendars: this.savedCalendars });
    this.loadSavedCalendars();
  }

  async clearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      await chrome.storage.local.clear();
      this.events = [];
      this.savedCalendars = [];
      this.icalLinkInput.value = '';
      this.settingsIcalLink.value = '';
      this.mainContent.classList.add('hidden');
      this.viewToggle.classList.add('hidden');
      this.inputSection.classList.remove('hidden');
      this.noData.classList.remove('hidden');
      this.loadSavedCalendars();
      this.closeSettings();
    }
  }

  async loadSettings() {
    const data = await chrome.storage.local.get(['autoRefresh']);
    if (data.autoRefresh) {
      this.autoRefreshCheckbox.checked = true;
      this.setupAutoRefresh();
    }
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
    this.subjectTags = data.subjectTags || {
      'BIOLOGY': '#10b981',
      'COMPUTER SCIENCE': '#3b82f6',
      'ENGLISH': '#f59e0b',
      'MATH': '#ef4444',
      'HISTORY': '#8b5cf6'
    };
    this.displaySubjectTags();
  }

  displaySubjectTags() {
    this.subjectTagsDiv.innerHTML = '';
    Object.entries(this.subjectTags).forEach(([name, color]) => {
      const tagDiv = document.createElement('div');
      tagDiv.className = 'subject-tag-item';

      const colorIndicator = document.createElement('div');
      colorIndicator.className = 'tag-color-indicator';
      colorIndicator.style.backgroundColor = color;

      const tagName = document.createElement('span');
      tagName.className = 'tag-name';
      tagName.textContent = name;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-tag';
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', () => this.deleteSubjectTag(name));

      tagDiv.appendChild(colorIndicator);
      tagDiv.appendChild(tagName);
      tagDiv.appendChild(deleteBtn);
      this.subjectTagsDiv.appendChild(tagDiv);
    });
  }

  async addSubjectTag() {
    const name = this.newTagNameInput.value.trim().toUpperCase();
    const color = this.newTagColorInput.value;

    if (!name) {
      alert('Please enter a subject name');
      return;
    }

    this.subjectTags[name] = color;
    await chrome.storage.local.set({ subjectTags: this.subjectTags });
    this.displaySubjectTags();

    // Clear inputs
    this.newTagNameInput.value = '';
    this.newTagColorInput.value = '#3b82f6';

    // Re-render events to apply new tag
    if (this.events.length > 0) {
      this.displayEvents(this.events);
    }
  }

  async deleteSubjectTag(name) {
    delete this.subjectTags[name];
    await chrome.storage.local.set({ subjectTags: this.subjectTags });
    this.displaySubjectTags();

    // Re-render events
    if (this.events.length > 0) {
      this.displayEvents(this.events);
    }
  }

  getSubjectFromTitle(title) {
    // Extract subject from title (e.g., "ADV. BIOLOGY - B:" -> "BIOLOGY")
    const subjectMatch = title.match(/(?:ADV\.\s+)?([A-Z][A-Z\s]+?)(?:\s*-\s*[A-Z\d])?:/);
    if (subjectMatch) {
      const subject = subjectMatch[1].trim();
      // Check if we have a tag for this subject
      for (const tag in this.subjectTags) {
        if (subject.includes(tag) || tag.includes(subject)) {
          return { name: tag, color: this.subjectTags[tag] };
        }
      }
    }
    return null;
  }
}

// Initialize the UI when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new UIController();
});
