// Sidebar - Handles major assignments sidebar display

import { getCleanTitle } from './utils.js';
import { ICalParser } from './ical-parser.js';
import { MAJOR_ASSIGNMENT_KEYWORDS } from './constants.js';

export class Sidebar {
  constructor(options = {}) {
    this.majorAssignmentsBar = options.majorAssignmentsBar;
    this.majorListDiv = options.majorListDiv;
    this.showMajorAssignmentsCheckbox = options.showMajorAssignmentsCheckbox;
    this.onUnpin = options.onUnpin || (() => {});
    this.onNavigateToDate = options.onNavigateToDate || (() => {});
    this.events = [];
    this.pinnedAssignments = {};
  }

  /**
   * Update sidebar data
   * @param {Object} data - Data to update
   */
  updateData(data) {
    if (data.events !== undefined) this.events = data.events;
    if (data.pinnedAssignments !== undefined) this.pinnedAssignments = data.pinnedAssignments;
  }

  /**
   * Toggle sidebar visibility
   * @param {boolean} show - Whether to show the sidebar
   */
  toggleVisibility(show) {
    if (!this.majorAssignmentsBar) return;
    if (show) {
      this.majorAssignmentsBar.classList.remove('hidden');
    } else {
      this.majorAssignmentsBar.classList.add('hidden');
    }
  }

  /**
   * Check if an event is a major assignment
   * @param {Object} event - Event to check
   * @returns {boolean} True if major assignment
   */
  isMajorAssignment(event) {
    if (!event) return false;
    const text = `${event.title || ''} ${event.description || ''}`;
    return MAJOR_ASSIGNMENT_KEYWORDS.test(text);
  }

  /**
   * Update the major assignments sidebar
   */
  update() {
    if (!this.majorListDiv || !this.majorAssignmentsBar) return;

    // Respect settings checkbox if present
    const showSetting = this.showMajorAssignmentsCheckbox ? this.showMajorAssignmentsCheckbox.checked : false;
    if (!showSetting) {
      this.majorAssignmentsBar.classList.add('hidden');
      return;
    }

    this.majorAssignmentsBar.classList.remove('hidden');
    this.majorListDiv.innerHTML = '';

    // Show pinned assignments first
    const pinnedIds = Object.keys(this.pinnedAssignments || {});
    if (pinnedIds.length > 0) {
      const pinnedHeader = document.createElement('div');
      pinnedHeader.className = 'sidebar-section-header';
      pinnedHeader.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg> Pinned';
      this.majorListDiv.appendChild(pinnedHeader);

      pinnedIds.forEach(eventId => {
        const pinData = this.pinnedAssignments[eventId];
        // Find full event if available
        const ev = (this.events || []).find(e => {
          const id = e.uid || `${e.title}_${e.dueRaw || e.startRaw}`;
          return id === eventId;
        }) || pinData;

        const item = document.createElement('div');
        item.className = 'major-item pinned-item';

        const title = document.createElement('div');
        title.className = 'major-title';
        title.textContent = getCleanTitle(ev.title || 'Untitled');

        const meta = document.createElement('div');
        meta.className = 'major-meta';
        meta.textContent = ev.dueTime || ev.startTime || '';

        // Unpin button
        const unpinBtn = document.createElement('button');
        unpinBtn.type = 'button';
        unpinBtn.className = 'unpin-btn';
        unpinBtn.title = 'Unpin';
        unpinBtn.innerHTML = '&times;';
        unpinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onUnpin(eventId);
        });

        item.appendChild(title);
        item.appendChild(meta);
        item.appendChild(unpinBtn);

        // Click to navigate to date
        item.addEventListener('click', () => {
          const raw = ev.dueRaw || ev.startRaw;
          if (raw) {
            this.navigateToRawDate(raw);
          }
        });

        this.majorListDiv.appendChild(item);
      });
    }

    // Build list of major assignments within next 14 days
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

    // Add major assignments section if there are any
    if (majors.length > 0) {
      if (pinnedIds.length > 0) {
        const majorHeader = document.createElement('div');
        majorHeader.className = 'sidebar-section-header';
        majorHeader.textContent = 'Major';
        this.majorListDiv.appendChild(majorHeader);
      }

      majors.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'major-item';
        const title = document.createElement('div');
        title.className = 'major-title';
        title.textContent = getCleanTitle(ev.title || ev.summary || 'Untitled');
        const meta = document.createElement('div');
        meta.className = 'major-meta';
        const when = ev.dueTime || ev.startTime || '';
        meta.textContent = when;
        item.appendChild(title);
        item.appendChild(meta);
        // Clicking focuses the date/day in the main view
        item.addEventListener('click', () => {
          if (ev.dueRaw || ev.startRaw) {
            this.navigateToRawDate(ev.dueRaw || ev.startRaw);
          }
        });
        this.majorListDiv.appendChild(item);
      });
    }

    // Show empty message if nothing to display
    if (pinnedIds.length === 0 && majors.length === 0) {
      const p = document.createElement('div');
      p.className = 'major-empty';
      p.style.color = 'var(--text-muted)';
      p.style.fontSize = '13px';
      p.textContent = 'No pinned or major assignments';
      this.majorListDiv.appendChild(p);
    }
  }

  /**
   * Navigate to a date from a raw iCal date string
   * @param {string} raw - Raw iCal date string
   */
  navigateToRawDate(raw) {
    const datePart = (raw.split('T')[0] || raw).replace(/\D/g, '').substring(0, 8);
    if (datePart.length === 8) {
      const y = parseInt(datePart.substring(0, 4), 10);
      const m = parseInt(datePart.substring(4, 6), 10) - 1;
      const d = parseInt(datePart.substring(6, 8), 10);
      const date = new Date(y, m, d);
      this.onNavigateToDate(date);
    }
  }
}
