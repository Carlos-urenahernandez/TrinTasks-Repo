// TrinTasks - Entry Point
// This file bootstraps the application by importing and initializing the UI controller

import { UIController } from './src/ui-controller.js';

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
