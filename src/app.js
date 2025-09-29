import { initializeAuthListener } from './core/auth.js';
import { _initToastSwipeHandler } from './ui/toast.js';
import { attachEventListeners } from './core/events.js';

/**
 * Main application entry point.
 * Initializes core components and event listeners.
 */
function main() {
    // Initialize the authentication state listener
    initializeAuthListener();

    // Set up the swipe-to-dismiss handler for toast notifications
    _initToastSwipeHandler();

    // Attach all the global event listeners for the application
    attachEventListeners();
}

// Run the application
main();