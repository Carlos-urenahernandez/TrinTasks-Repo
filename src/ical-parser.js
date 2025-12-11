// iCal Parser - Handles parsing of iCal/ICS calendar files

export class ICalParser {
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
