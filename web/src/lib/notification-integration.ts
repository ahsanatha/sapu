import { notificationService } from "./notifications";

/**
 * ACQ Notification Integration
 *
 * This module provides easy integration points for notifications throughout the ACQ app.
 * Import and use these functions in your components to add notification capabilities.
 */

/**
 * Notify about new stories in the feed
 * Use this when new stories are loaded or discovered
 */
export async function notifyNewStories(
  stories: Array<{ title: string; category: string; sources: number }>,
): Promise<void> {
  if (stories.length === 0) return;

  // Only notify about the first story to avoid spam
  const story = stories[0];
  const success = await notificationService.notifyNewStory(
    story.title,
    story.category,
    story.sources,
  );

  if (success) {
    console.log(`Notified about new ${story.category} story: ${story.title}`);
  }
}

/**
 * Notify about breaking news
 * Use this for high-priority news alerts
 */
export async function notifyBreakingNews(headline: string): Promise<void> {
  const success = await notificationService.notifyBreakingNews(
    headline,
    "high",
  );
  if (success) {
    console.log("Breaking news alert sent!");
  }
}

/**
 * Schedule daily digest notification
 * Use this to remind users about their daily news summary
 */
export async function scheduleDailyDigest(storyCount: number): Promise<void> {
  const success = await notificationService.notifyDailyDigest(storyCount);

  if (success) {
    console.log(`Scheduled daily digest for ${storyCount} stories`);
  }
}

/**
 * Notify about article collection status
 * Use this when articles are successfully collected or scraped
 */
export async function notifyCollectionComplete(
  count: number,
  source: string,
): Promise<void> {
  const success = await notificationService.scheduleNotification({
    title: "ACQ Collection Complete",
    body: `Collected ${count} articles from ${source}`,
    id: Date.now(),
    extra: { type: "collection_complete", count, source },
  });
  if (success) {
    console.log(`Collected ${count} articles from ${source}`);
  }
}

/**
 * Notify about scraping errors
 * Use this when scraping fails or encounters issues
 */
export async function notifyScrapingError(
  source: string,
  error: string,
): Promise<void> {
  const success = await notificationService.scheduleNotification({
    title: "ACQ Scraping Error",
    body: `Failed to scrape ${source}: ${error}`,
    id: Date.now(),
    extra: { type: "scraping_error", source, error },
  });
  if (success) {
    console.log(`Scraping error: ${source}`);
  }
}

/**
 * Notify about system status
 * Use this for system health and status updates
 */
export async function notifySystemStatus(
  status: "healthy" | "warning" | "error",
  message: string,
): Promise<void> {
  const titles = {
    healthy: "ACQ System Healthy",
    warning: "ACQ System Warning",
    error: "ACQ System Error",
  };

  const success = await notificationService.scheduleNotification({
    title: titles[status],
    body: message,
    id: Date.now(),
    extra: { type: "system_status", status, message },
  });

  if (success) {
    console.log(`System status notification sent: ${status}`);
  }
}

/**
 * Example integration in your Articles.svelte component:
 *
 * ```svelte
 * <script>
 *   import { notifyNewStories, notifyCollectionComplete } from '../lib/notification-integration'
 *
 *   async function fetchArticles() {
 *     // ... existing fetch logic ...
 *
 *     if (newItems.length > 0) {
 *       // Notify about new stories
 *       await notifyNewStories(newItems.map(item => ({
 *         title: item.title,
 *         category: 'General', // or extract from item
 *         sources: 1
 *       })))
 *     }
 *   }
 * </script>
 * ```
 */

// Export the notification service for direct use if needed
export { notificationService };
