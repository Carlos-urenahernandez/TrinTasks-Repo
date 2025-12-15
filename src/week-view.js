// Week View - Handles calendar week view rendering and navigation

import { DAY_NAMES, MONTH_NAMES } from './constants.js';
import { getWeekStart } from './utils.js';
import { ICalParser } from './ical-parser.js';
import { saveEventOrder, loadEventOrder } from './storage-manager.js';

export class WeekView {
  constructor(options = {}) {
    this.weekTitle = options.weekTitle;
    this.weekDays = options.weekDays;
    this.selectedDayTitle = options.selectedDayTitle;
    this.eventsContainer = options.eventsContainer;
    this.onDaySelect = options.onDaySelect || (() => {});
    this.getEventsForDate = options.getEventsForDate || (() => []);
    this.onWeekChange = options.onWeekChange || (() => {});
    this.filterMode = 'active'; // Default to showing uncompleted assignments

    this.currentWeekStart = getWeekStart(new Date());
    this.selectedDate = new Date();
  }

  /**
   * Check if currently viewing the week that contains today
   * @returns {boolean}
   */
  isViewingCurrentWeek() {
    const today = new Date();
    const todayWeekStart = getWeekStart(today);
    return this.currentWeekStart.getTime() === todayWeekStart.getTime();
  }

  /**
   * Check if the selected date is today
   * @returns {boolean}
   */
  isSelectedDateToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(this.selectedDate);
    selected.setHours(0, 0, 0, 0);
    return today.getTime() === selected.getTime();
  }

  /**
   * Navigate to previous or next week
   * @param {number} direction - -1 for previous, 1 for next
   */
  navigateWeek(direction) {
    const newDate = new Date(this.currentWeekStart);
    newDate.setDate(newDate.getDate() + (direction * 7));
    this.currentWeekStart = newDate;
    this.renderWeekView();
    this.onWeekChange(!this.isSelectedDateToday());
  }

  /**
   * Render the week view
   */
  renderWeekView() {
    // Calculate week end date
    const weekEnd = new Date(this.currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Update week title
    const startMonth = MONTH_NAMES[this.currentWeekStart.getMonth()];
    const endMonth = MONTH_NAMES[weekEnd.getMonth()];
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
      dayName.textContent = DAY_NAMES[i];
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
        this.onDaySelect(date);
        this.onWeekChange(!this.isSelectedDateToday());
      });

      this.weekDays.appendChild(dayDiv);
    }
  }

  /**
   * Set filter mode
   * @param {string} mode - 'all', 'active', or 'completed'
   */
  setFilterMode(mode) {
    this.filterMode = mode;
  }

  /**
   * Apply filter to events
   * @param {Array} events - Events to filter
   * @returns {Array} Filtered events
   */
  applyFilter(events) {
    if (this.filterMode === 'completed') {
      return events.filter(e => e.isCompleted);
    }
    if (this.filterMode === 'active') {
      return events.filter(e => !e.isCompleted);
    }
    return events;
  }

  /**
   * Get date key for storage
   * @param {Date} date - Date object
   * @returns {string} Date key in YYYYMMDD format
   */
  getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Get event ID
   * @param {Object} event - Event object
   * @returns {string} Event ID
   */
  getEventId(event) {
    return event.uid || `${event.title}_${event.dueRaw || event.startRaw}`;
  }

  /**
   * Show events for the selected day
   * @param {Function} createEventElement - Function to create event elements
   */
  async showEventsForSelectedDay(createEventElement) {
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
      // Check for custom order
      const dateKey = this.getDateKey(this.selectedDate);
      const customOrder = await loadEventOrder(dateKey);

      if (customOrder && customOrder.length > 0) {
        // Apply custom order
        const eventMap = new Map();
        eventsForDay.forEach(e => eventMap.set(this.getEventId(e), e));

        const orderedEvents = [];
        // First add events in custom order
        customOrder.forEach(id => {
          if (eventMap.has(id)) {
            orderedEvents.push(eventMap.get(id));
            eventMap.delete(id);
          }
        });
        // Then add any new events not in custom order
        eventMap.forEach(e => orderedEvents.push(e));
        eventsForDay = orderedEvents;
      } else {
        // Default sort: incomplete first, then by due time
        eventsForDay.sort((a, b) => {
          if (a.isCompleted && !b.isCompleted) return 1;
          if (!a.isCompleted && b.isCompleted) return -1;
          const ta = ICalParser.iCalDateToTimestamp(a.dueRaw || a.startRaw);
          const tb = ICalParser.iCalDateToTimestamp(b.dueRaw || b.startRaw);
          return ta - tb;
        });
      }

      eventsForDay.forEach(event => {
        const eventElement = createEventElement(event);
        const eventId = this.getEventId(event);
        eventElement.setAttribute('data-event-id', eventId);
        eventElement.draggable = true;
        this.setupDragHandlers(eventElement, dateKey);
        this.eventsContainer.appendChild(eventElement);
      });
    }
  }

  /**
   * Setup drag and drop handlers for an event element
   * @param {HTMLElement} element - Event element
   * @param {string} dateKey - Date key for storage
   */
  setupDragHandlers(element, dateKey) {
    element.addEventListener('dragstart', (e) => {
      element.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', element.getAttribute('data-event-id'));
      this.startAutoScroll();
    });

    element.addEventListener('dragend', () => {
      element.classList.remove('dragging');
      this.stopAutoScroll();
      this.saveCurrentOrder(dateKey);
    });

    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const dragging = this.eventsContainer.querySelector('.dragging');
      if (!dragging || dragging === element) return;

      const rect = element.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (e.clientY < midY) {
        element.parentNode.insertBefore(dragging, element);
      } else {
        element.parentNode.insertBefore(dragging, element.nextSibling);
      }
    });
  }

  /**
   * Start auto-scroll during drag
   */
  startAutoScroll() {
    const scrollSpeed = 8;
    const edgeThreshold = 50;

    this.autoScrollHandler = (e) => {
      const containerRect = this.eventsContainer.getBoundingClientRect();
      const mouseY = e.clientY;

      // Check if near top edge
      if (mouseY < containerRect.top + edgeThreshold && mouseY > containerRect.top) {
        this.eventsContainer.scrollTop -= scrollSpeed;
      }
      // Check if near bottom edge
      else if (mouseY > containerRect.bottom - edgeThreshold && mouseY < containerRect.bottom) {
        this.eventsContainer.scrollTop += scrollSpeed;
      }
    };

    document.addEventListener('dragover', this.autoScrollHandler);
  }

  /**
   * Stop auto-scroll
   */
  stopAutoScroll() {
    if (this.autoScrollHandler) {
      document.removeEventListener('dragover', this.autoScrollHandler);
      this.autoScrollHandler = null;
    }
  }

  /**
   * Save current order of events
   * @param {string} dateKey - Date key for storage
   */
  async saveCurrentOrder(dateKey) {
    const eventElements = this.eventsContainer.querySelectorAll('.event[data-event-id]');
    const eventIds = Array.from(eventElements).map(el => el.getAttribute('data-event-id'));
    await saveEventOrder(dateKey, eventIds);
  }

  /**
   * Select a specific date
   * @param {Date} date - Date to select
   */
  selectDate(date) {
    this.selectedDate = date;
    // Adjust current week if needed
    const weekStart = getWeekStart(date);
    if (weekStart.getTime() !== this.currentWeekStart.getTime()) {
      this.currentWeekStart = weekStart;
    }
  }
}

/**
 * Get events for a specific date from an events array
 * @param {Array} events - All events
 * @param {Date} date - Date to filter by
 * @returns {Array} Events for that date
 */
export function getEventsForDate(events, date) {
  // Create date string in local timezone (YYYY-MM-DD)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  return events.filter(event => {
    // Check for DUE date first, then fall back to START date
    const eventDateRaw = event.dueRaw || event.startRaw;

    if (!eventDateRaw) {
      return false;
    }

    // Extract just the date part (YYYYMMDD or YYYYMMDDTHHMMSS)
    const eventDatePart = eventDateRaw.split('T')[0];

    // Remove any non-digit characters
    const eventDateStr = eventDatePart.replace(/\D/g, '').substring(0, 8);

    return eventDateStr === dateStr;
  });
}
