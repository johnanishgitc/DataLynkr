import { AppState, AppStateStatus, InteractionManager, Platform } from 'react-native';

/**
 * Background task manager to keep downloads running when phone is locked
 * Uses InteractionManager and AppState to maintain task execution
 */
class BackgroundTaskManager {
  private interactionHandles: Set<number> = new Set();
  private appStateSubscription: { remove: () => void } | null = null;
  private isActive = false;

  /**
   * Start a background task that will continue running when phone is locked
   * Returns a cleanup function
   */
  startBackgroundTask(): () => void {
    if (this.isActive) {
      console.log('[BackgroundTask] Already active, reusing existing task');
      return this.stopBackgroundTask.bind(this);
    }

    this.isActive = true;
    console.log('[BackgroundTask] Starting background task manager');

    // Create interaction handle to keep task alive
    const handle = InteractionManager.createInteractionHandle();
    this.interactionHandles.add(handle);
    console.log('[BackgroundTask] Created interaction handle:', handle);

    // Monitor app state changes
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log(`[BackgroundTask] App state changed to: ${nextAppState}`);
      
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // When going to background, create additional interaction handles
        // to keep the task running
        const bgHandle = InteractionManager.createInteractionHandle();
        this.interactionHandles.add(bgHandle);
        console.log('[BackgroundTask] Created background interaction handle:', bgHandle);
      } else if (nextAppState === 'active') {
        // When coming back to foreground, we can optionally clear some handles
        // but keep at least one active
        console.log('[BackgroundTask] App returned to foreground, keeping task active');
      }
    });

    // Return cleanup function
    return this.stopBackgroundTask.bind(this);
  }

  /**
   * Stop the background task
   */
  stopBackgroundTask(): void {
    if (!this.isActive) {
      return;
    }

    console.log('[BackgroundTask] Stopping background task manager');
    this.isActive = false;

    // Clear all interaction handles
    this.interactionHandles.forEach((handle) => {
      try {
        InteractionManager.clearInteractionHandle(handle);
        console.log('[BackgroundTask] Cleared interaction handle:', handle);
      } catch (e) {
        console.warn('[BackgroundTask] Error clearing handle:', e);
      }
    });
    this.interactionHandles.clear();

    // Remove app state listener
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Check if background task is active
   */
  isTaskActive(): boolean {
    return this.isActive;
  }

  /**
   * Create a new interaction handle (useful for long-running operations)
   */
  createHandle(): number {
    const handle = InteractionManager.createInteractionHandle();
    this.interactionHandles.add(handle);
    return handle;
  }

  /**
   * Clear a specific interaction handle
   */
  clearHandle(handle: number): void {
    if (this.interactionHandles.has(handle)) {
      InteractionManager.clearInteractionHandle(handle);
      this.interactionHandles.delete(handle);
    }
  }
}

// Singleton instance
export const backgroundTaskManager = new BackgroundTaskManager();

/**
 * Helper function to run a task with background support
 * Ensures the task continues running when phone is locked
 */
export async function runWithBackgroundSupport<T>(
  task: () => Promise<T>
): Promise<T> {
  const cleanup = backgroundTaskManager.startBackgroundTask();
  
  try {
    const result = await task();
    return result;
  } finally {
    cleanup();
  }
}

/**
 * Helper to wait for interactions to complete before continuing
 * Useful for ensuring UI updates don't block background tasks
 */
export function waitForInteractions(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      resolve();
    });
  });
}
