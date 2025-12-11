// Week View - Handles calendar week view rendering and navigation

import { DAY_NAMES, MONTH_NAMES } from './constants.js';
import { getWeekStart } from './utils.js';
import { ICalParser } from './ical-parser.js';

export class WeekView {
  constructor(options = {}) {
    this.weekTitle = options.weekTitle;
    this.weekDays = options.weekDays;
    this.selectedDayTitle = options.selectedDayTitle;
    this.eventsContainer = options.eventsContainer;
    this.onDaySelect = options.onDaySelect || (() => {});
    this.getEventsForDate = options.getEventsForDate || (() => []);
    this.filterMode = 'all';

    this.currentWeekStart = getWeekStart(new Date());
    this.selectedDate = new Date();
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
   * Show events for the selected day
   * @param {Function} createEventElement - Function to create event elements
   */
  showEventsForSelectedDay(createEventElement) {
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
        const eventElement = createEventElement(event);
        this.eventsContainer.appendChild(eventElement);
      });
    }
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
