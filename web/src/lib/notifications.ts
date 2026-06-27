import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

export interface NotificationOptions {
  title: string;
  body: string;
  id?: number;
  schedule?: {
    at?: Date;
    repeats?: boolean;
    every?: "minute" | "hour" | "day" | "week" | "month" | "year";
  };
  sound?: string | null;
  attachments?: any[];
  actionTypeId?: string;
  extra?: any;
}

export class NotificationService {
  private static instance: NotificationService;
  private isInitialized = false;
  private isNative = Capacitor.isNativePlatform();

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    if (!this.isNative) {
      console.log(
        "Notifications: Running in web environment, native notifications not available",
      );
      return false;
    }

    try {
      // Request permissions
      const permission = await LocalNotifications.requestPermissions();

      if (permission.display !== "granted") {
        console.warn("Notification permissions denied");
        return false;
      }

      this.isInitialized = true;
      console.log("Notification service initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize notification service:", error);
      return false;
    }
  }

  async scheduleNotification(options: NotificationOptions): Promise<boolean> {
    if (!this.isInitialized && !(await this.initialize())) {
      console.warn("Cannot schedule notification: service not initialized");
      return false;
    }

    if (!this.isNative) {
      // Fallback for web: use browser notifications
      return this.scheduleWebNotification(options);
    }

    try {
      const notificationId = options.id || Date.now();

      await LocalNotifications.schedule({
        notifications: [
          {
            title: options.title,
            body: options.body,
            id: notificationId,
            schedule: options.schedule || undefined,
            sound:
              typeof options.sound === "string" ? options.sound : undefined,
            attachments: options.attachments || undefined,
            actionTypeId: options.actionTypeId || "",
            extra: options.extra || null,
          },
        ],
      });

      console.log(
        `Notification scheduled successfully with ID: ${notificationId}`,
      );
      return true;
    } catch (error) {
      console.error("Failed to schedule notification:", error);
      return false;
    }
  }

  async scheduleWebNotification(
    options: NotificationOptions,
  ): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("Web notifications not supported");
      return false;
    }

    try {
      // Request permission if not already granted
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          console.warn("Web notification permission denied");
          return false;
        }
      }

      // Schedule the notification
      const notification = new Notification(options.title, {
        body: options.body,
        icon: "/assets/icon-192.png", // Add your app icon
        badge: "/assets/icon-72.png",
        tag: options.id?.toString() || Date.now().toString(),
        requireInteraction: true,
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      console.log("Web notification shown successfully");
      return true;
    } catch (error) {
      console.error("Failed to show web notification:", error);
      return false;
    }
  }

  async cancelNotification(notificationId: number): Promise<boolean> {
    if (!this.isNative) {
      console.log("Cancel notification not supported in web environment");
      return false;
    }

    try {
      await LocalNotifications.cancel({
        notifications: [{ id: notificationId }],
      });
      console.log(`Notification ${notificationId} cancelled successfully`);
      return true;
    } catch (error) {
      console.error("Failed to cancel notification:", error);
      return false;
    }
  }

  async cancelAllNotifications(): Promise<boolean> {
    if (!this.isNative) {
      console.log("Cancel all notifications not supported in web environment");
      return false;
    }

    try {
      await LocalNotifications.cancel({ notifications: [] });
      console.log("All notifications cancelled successfully");
      return true;
    } catch (error) {
      console.error("Failed to cancel all notifications:", error);
      return false;
    }
  }

  async getPendingNotifications(): Promise<any[]> {
    if (!this.isNative) {
      console.log("Get pending notifications not supported in web environment");
      return [];
    }

    try {
      const result = await LocalNotifications.getPending();
      return result.notifications;
    } catch (error) {
      console.error("Failed to get pending notifications:", error);
      return [];
    }
  }

  // ACQ-specific notification methods
  async notifyNewStory(
    storyTitle: string,
    category: string,
    sourceCount: number,
  ): Promise<boolean> {
    return this.scheduleNotification({
      title: `New ${category} Story`,
      body: `${storyTitle} - Aggregated from ${sourceCount} sources`,
      id: Date.now(),
      extra: { type: "new_story", category, sourceCount },
    });
  }

  async notifyBreakingNews(
    headline: string,
    urgency: "high" | "medium" | "low",
  ): Promise<boolean> {
    const notification: NotificationOptions = {
      title: "Breaking News",
      body: headline,
      id: Date.now(),
      extra: { type: "breaking_news", urgency },
    };

    if (urgency === "high") {
      notification.sound = "default";
    }

    return this.scheduleNotification(notification);
  }

  async notifyDailyDigest(storyCount: number): Promise<boolean> {
    return this.scheduleNotification({
      title: "Your Daily ACQ Digest",
      body: `${storyCount} new stories available today across your selected categories`,
      id: Date.now(),
      schedule: { at: new Date(Date.now() + 1000 * 60 * 60 * 24) }, // Tomorrow
      extra: { type: "daily_digest", storyCount },
    });
  }

  async notifyCustomSale(
    title: string,
    message: string,
    delaySeconds: number = 5,
  ): Promise<boolean> {
    return this.scheduleNotification({
      title,
      body: message,
      id: Date.now(),
      schedule: { at: new Date(Date.now() + 1000 * delaySeconds) },
      extra: { type: "custom_sale" },
    });
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();

// Example usage function matching your request
export async function scheduleSaleNotification(): Promise<void> {
  const success = await notificationService.notifyCustomSale(
    "On sale",
    "Widgets are 10% off. Act fast!",
    5,
  );

  if (success) {
    console.log("Sale notification scheduled successfully");
  } else {
    console.warn("Failed to schedule sale notification");
  }
}

// Initialize the service on module load (but don't block)
notificationService.initialize().then((initialized) => {
  if (initialized) {
    console.log("ACQ Notification Service ready");
  }
});

export default notificationService;
