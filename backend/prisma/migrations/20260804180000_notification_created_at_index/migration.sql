-- Backs NotificationService.getNotifications/getSuperNotifications now that
-- both are capped with `take: 50` (WHERE "shopId" = ? / IS NULL, ORDER BY
-- "createdAt" DESC).
CREATE INDEX "Notification_shopId_createdAt_idx" ON "Notification"("shopId", "createdAt");
