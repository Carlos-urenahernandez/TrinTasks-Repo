// Event Renderer - Handles creating event card elements and animations

import { escapeHtml, linkifyText, getCleanTitle, getCourseName } from './utils.js';
import { ICalParser } from './ical-parser.js';
import { ASSIGNMENT_KEYWORDS } from './constants.js';

export class EventRenderer {
  constructor(options = {}) {
    this.onToggleComplete = options.onToggleComplete || (() => {});
    this.onTogglePin = options.onTogglePin || (() => {});
    this.getSubjectFromTitle = options.getSubjectFromTitle || (() => null);
    this.pinnedAssignments = options.pinnedAssignments || {};
    this.sidebarEnabled = options.sidebarEnabled || false;
    this.themeManager = options.themeManager || null;
    this.toastTimeout = null;
  }

  /**
   * Update renderer options
   * @param {Object} options - Options to update
   */
  updateOptions(options) {
    Object.assign(this, options);
  }

  /**
   * Create an event card element
   * @param {Object} event - Event data
   * @returns {HTMLElement} Event card element
   */
  createEventElement(event) {
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event';
    if (event.isCompleted) {
      eventDiv.classList.add('completed');
    }

    // Apply subject color if available
    const subjectTag = this.getSubjectFromTitle(event.title);
    const courseFullName = getCourseName(event.title) || (subjectTag ? subjectTag.name : '');
    if (subjectTag) {
      eventDiv.style.borderLeftWidth = '4px';
      eventDiv.style.borderLeftColor = subjectTag.color;
      eventDiv.setAttribute('data-subject', subjectTag.name);
    }

    // Create header with checkbox for assignments
    const headerDiv = document.createElement('div');
    headerDiv.className = 'event-header';

    // Get clean title without class prefix
    const cleanTitle = getCleanTitle(event.title);

    // Infer assignment status
    const inferredIsAssignment = !!(
      event.isAssignment ||
      (cleanTitle && cleanTitle !== (event.title || '').trim()) ||
      ASSIGNMENT_KEYWORDS.test(event.title || '')
    );

    if (inferredIsAssignment) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'event-checkbox';
      checkbox.checked = event.isCompleted || false;
      checkbox.addEventListener('change', () => this.onToggleComplete(event, eventDiv));
      headerDiv.appendChild(checkbox);
    }

    // Add pin button (only visible when sidebar is enabled)
    if (this.sidebarEnabled) {
      const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;
      const isPinned = !!this.pinnedAssignments[eventId];

      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = 'pin-btn' + (isPinned ? ' pinned' : '');
      pinBtn.title = isPinned ? 'Unpin from sidebar' : 'Pin to sidebar';
      pinBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>';
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onTogglePin(event, pinBtn);
      });
      headerDiv.appendChild(pinBtn);
    }

    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';

    let titleHtml = escapeHtml(cleanTitle);

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

    // Show DUE date if available
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

    // Show class (full course name)
    if (courseFullName) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Class:</span>
        <span class="event-detail-value">${escapeHtml(courseFullName)}</span>
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
        <span class="event-detail-value">${escapeHtml(event.location)}</span>
      </div>`;
    }

    if (event.organizer) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Organizer:</span>
        <span class="event-detail-value">${escapeHtml(event.organizer)}</span>
      </div>`;
    }

    if (event.attendees && event.attendees.length > 0) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Attendees:</span>
        <span class="event-detail-value">${event.attendees.map(a => escapeHtml(a)).join(', ')}</span>
      </div>`;
    }

    if (event.rrule) {
      html += `<div class="event-detail">
        <span class="event-detail-label">Recurrence:</span>
        <span class="event-detail-value">${escapeHtml(event.rrule)}</span>
      </div>`;
    }

    html += '</div>';

    if (event.description) {
      html += `<div class="event-description">${linkifyText(event.description)}</div>`;
    }

    // Add the details HTML to the eventDiv
    const detailsContainer = document.createElement('div');
    detailsContainer.innerHTML = html;
    eventDiv.appendChild(detailsContainer);

    return eventDiv;
  }

  /**
   * Animate task completion with confetti
   * @param {HTMLElement} target - Target element
   */
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
    }, 900);
    this.launchConfetti(target);
  }

  /**
   * Launch confetti animation
   * @param {HTMLElement} target - Target element
   */
  launchConfetti(target) {
    if (!target) return;
    const container = document.createElement('div');
    container.className = 'confetti-container';

    let colors;
    if (this.themeManager) {
      const themeColors = this.themeManager.getThemeConfettiColors();
      colors = themeColors.length ? themeColors : ['#e63946', '#f77f00', '#2a9d8f', '#118ab2', '#8338ec', '#ff006e', '#8ac926'];
    } else {
      colors = ['#e63946', '#f77f00', '#2a9d8f', '#118ab2', '#8338ec', '#ff006e', '#8ac926'];
    }

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

  /**
   * Hide the toast immediately
   */
  hideToast() {
    const toast = document.getElementById('refreshToast');
    if (!toast) return;
    clearTimeout(this.toastTimeout);
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }

  /**
   * Setup toast click handler (call once)
   */
  setupToastClickHandler() {
    const toast = document.getElementById('refreshToast');
    if (!toast || toast.dataset.clickHandlerSet) return;
    toast.dataset.clickHandlerSet = 'true';
    toast.addEventListener('click', () => this.hideToast());
  }

  /**
   * Show a message toast
   * @param {string} message - Message to show
   */
  showMessageToast(message) {
    const toast = document.getElementById('refreshToast');
    if (!toast || !message) return;

    this.setupToastClickHandler();
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('visible');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 4000);
  }

  /**
   * Show refresh summary toast
   * @param {Object} summary - Refresh summary with added/updated/removed counts
   */
  showRefreshToast(summary) {
    const toast = document.getElementById('refreshToast');
    if (!toast || !summary) return;

    this.setupToastClickHandler();
    const { added = 0, updated = 0, removed = 0, timestamp } = summary;
    toast.textContent = `+${added} added, ${updated} updated, ${removed} removed`;
    toast.classList.remove('hidden');
    toast.classList.add('visible');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 5000);
  }
}
