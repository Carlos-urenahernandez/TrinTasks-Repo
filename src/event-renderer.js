// Event Renderer - Handles creating event card elements and animations

import { escapeHtml, linkifyText, getCleanTitle, getCourseName } from './utils.js';
import { ICalParser } from './ical-parser.js';
import { ASSIGNMENT_KEYWORDS } from './constants.js';

export class EventRenderer {
  constructor(options = {}) {
    this.onToggleComplete = options.onToggleComplete || (() => {});
    this.onToggleInProgress = options.onToggleInProgress || (() => {});
    this.onTogglePin = options.onTogglePin || (() => {});
    this.onSetReminder = options.onSetReminder || (() => {});
    this.onClearReminder = options.onClearReminder || (() => {});
    this.getSubjectFromTitle = options.getSubjectFromTitle || (() => null);
    this.getAssignmentReminderStatus = options.getAssignmentReminderStatus || (() => Promise.resolve({ hasReminder: false }));
    this.pinnedAssignments = options.pinnedAssignments || {};
    this.sidebarEnabled = options.sidebarEnabled || false;
    this.themeManager = options.themeManager || null;
    this.toastTimeout = null;
    this.activeMenu = null; // Track currently open menu

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (this.activeMenu && !e.target.closest('.action-menu-container')) {
        this.closeActiveMenu();
      }
    });
  }

  /**
   * Update renderer options
   * @param {Object} options - Options to update
   */
  updateOptions(options) {
    Object.assign(this, options);
  }

  /**
   * Close the currently active menu
   */
  closeActiveMenu() {
    if (this.activeMenu) {
      const dropdown = this.activeMenu.querySelector('.action-dropdown');
      if (dropdown) {
        dropdown.remove();
      }
      this.activeMenu.classList.remove('menu-open');

      // Remove menu-active class from parent event card
      const parentEvent = this.activeMenu.closest('.event');
      if (parentEvent) {
        parentEvent.classList.remove('menu-active');
      }

      // Re-enable pointer events on all event cards
      document.querySelectorAll('.event').forEach(el => {
        el.style.pointerEvents = '';
      });

      this.activeMenu = null;
    }
  }

  /**
   * Toggle the action menu for an event
   * @param {HTMLElement} menuContainer - The menu container element
   * @param {Object} event - Event data
   * @param {HTMLElement} eventDiv - The event card element
   */
  async toggleActionMenu(menuContainer, event, eventDiv) {
    // If clicking the same menu that's open, close it
    if (this.activeMenu === menuContainer) {
      this.closeActiveMenu();
      return;
    }

    // Close any other open menu
    this.closeActiveMenu();

    // Create dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'action-dropdown';

    const eventId = event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;
    const isPinned = !!this.pinnedAssignments[eventId];

    // Mark Complete / Incomplete
    const completeItem = document.createElement('button');
    completeItem.type = 'button';
    completeItem.className = 'action-dropdown-item';
    completeItem.innerHTML = event.isCompleted
      ? '<span class="action-icon">○</span> Mark Incomplete'
      : '<span class="action-icon">✓</span> Mark Complete';
    completeItem.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeActiveMenu();
      this.onToggleComplete(event, eventDiv);
    });
    dropdown.appendChild(completeItem);

    // Mark In-Progress / Remove In-Progress
    const inProgressItem = document.createElement('button');
    inProgressItem.type = 'button';
    inProgressItem.className = 'action-dropdown-item';
    inProgressItem.innerHTML = event.isInProgress
      ? '<span class="action-icon">○</span> Remove In-Progress'
      : '<span class="action-icon">◐</span> Mark In-Progress';
    inProgressItem.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeActiveMenu();
      this.onToggleInProgress(event, eventDiv);
    });
    dropdown.appendChild(inProgressItem);

    // Pin to Sidebar (only if sidebar is enabled)
    if (this.sidebarEnabled) {
      const pinItem = document.createElement('button');
      pinItem.type = 'button';
      pinItem.className = 'action-dropdown-item';
      pinItem.innerHTML = isPinned
        ? '<span class="action-icon">✕</span> Unpin from Sidebar'
        : '<span class="action-icon">📌</span> Pin to Sidebar';
      pinItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeActiveMenu();
        this.onTogglePin(event, eventDiv);
      });
      dropdown.appendChild(pinItem);
    }

    // Divider
    const divider = document.createElement('div');
    divider.className = 'action-dropdown-divider';
    dropdown.appendChild(divider);

    // Reminder submenu
    const reminderStatus = await this.getAssignmentReminderStatus(event);
    const reminderItem = document.createElement('div');
    reminderItem.className = 'action-dropdown-item has-submenu';

    if (reminderStatus.hasReminder) {
      // Show when reminder is set
      const reminderTime = new Date(reminderStatus.reminderTime);
      const timeStr = reminderTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      reminderItem.innerHTML = `<span class="submenu-arrow">◂</span> <span class="action-icon">🔔</span> Reminder at ${timeStr}`;
    } else {
      reminderItem.innerHTML = '<span class="submenu-arrow">◂</span> <span class="action-icon">⏰</span> Set Reminder';
    }

    // Submenu for reminder presets
    const submenu = document.createElement('div');
    submenu.className = 'action-submenu';

    if (reminderStatus.hasReminder) {
      // Option to clear reminder
      const clearItem = document.createElement('button');
      clearItem.type = 'button';
      clearItem.className = 'action-dropdown-item';
      clearItem.innerHTML = '<span class="action-icon">✕</span> Clear Reminder';
      clearItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeActiveMenu();
        this.onClearReminder(event);
      });
      submenu.appendChild(clearItem);

      // Divider
      const subDivider = document.createElement('div');
      subDivider.className = 'action-dropdown-divider';
      submenu.appendChild(subDivider);
    }

    // Preset options
    const presets = [
      { label: '1 hour', hours: 1 },
      { label: '2 hours', hours: 2 },
      { label: '4 hours', hours: 4 },
      { label: 'Tomorrow', hours: 24 }
    ];

    presets.forEach(preset => {
      const presetItem = document.createElement('button');
      presetItem.type = 'button';
      presetItem.className = 'action-dropdown-item';
      presetItem.textContent = preset.label;
      presetItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeActiveMenu();
        this.onSetReminder(event, preset.hours);
      });
      submenu.appendChild(presetItem);
    });

    reminderItem.appendChild(submenu);
    dropdown.appendChild(reminderItem);

    // Add dropdown to container
    menuContainer.appendChild(dropdown);
    menuContainer.classList.add('menu-open');
    this.activeMenu = menuContainer;

    // Add menu-active class to parent event card and disable pointer events on other cards
    const parentEvent = eventDiv;
    parentEvent.classList.add('menu-active');

    // Disable pointer events on all other event cards to prevent interference
    document.querySelectorAll('.event').forEach(el => {
      if (el !== parentEvent) {
        el.style.pointerEvents = 'none';
      }
    });

    // Position the dropdown
    this.positionDropdown(menuContainer, dropdown);
  }

  /**
   * Position the dropdown menu to avoid overflow
   * @param {HTMLElement} container - Menu container
   * @param {HTMLElement} dropdown - Dropdown element
   */
  positionDropdown(container, dropdown) {
    const rect = container.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Check if dropdown would overflow left edge (since it opens from the right)
    if (rect.right - dropdownRect.width < 10) {
      dropdown.style.left = '0';
      dropdown.style.right = 'auto';
    }

    // Check if dropdown would overflow bottom edge
    if (rect.bottom + dropdownRect.height > viewportHeight - 10) {
      dropdown.style.bottom = '100%';
      dropdown.style.top = 'auto';
      dropdown.style.marginBottom = '4px';
      dropdown.style.marginTop = '0';
    }
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
    if (event.isInProgress) {
      eventDiv.classList.add('in-progress');
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

    // Create title first (always)
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

    // Title first (far left)
    headerDiv.appendChild(titleDiv);

    if (inferredIsAssignment) {
      // Action menu container - after title (on the right)
      const menuContainer = document.createElement('div');
      menuContainer.className = 'action-menu-container';

      // Action menu trigger button
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'action-menu-btn';
      actionBtn.title = 'Actions';
      actionBtn.innerHTML = '⋮';
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleActionMenu(menuContainer, event, eventDiv);
      });
      menuContainer.appendChild(actionBtn);

      headerDiv.appendChild(menuContainer);
    }

    eventDiv.appendChild(headerDiv);

    let html = '<div class="event-details">';

    // Show DUE date if available
    if (event.dueTime) {
      const isOverdue = !event.isCompleted && event.dueRaw &&
                       ICalParser.iCalDateToTimestamp(event.dueRaw) < Date.now();
      const dueStyle = isOverdue ? 'color: #f59e0b; font-weight: 600;' : 'color: var(--text); font-weight: 600;';
      const dueLabel = isOverdue ? 'Past due:' : 'Due:';

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

    // Show in-progress status if set
    if (event.isInProgress && event.inProgressDate) {
      const inProgressDate = new Date(event.inProgressDate);
      const formattedDate = inProgressDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      html += `<div class="event-detail">
        <span class="event-detail-label">Status:</span>
        <span class="event-detail-value" style="color: #f59e0b;">◐ In progress since ${formattedDate}</span>
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
