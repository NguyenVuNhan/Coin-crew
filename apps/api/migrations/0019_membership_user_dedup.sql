UPDATE `membership_requests` SET `status` = 'rejected'
WHERE `status` = 'pending'
  AND EXISTS (
    SELECT 1 FROM `membership_requests` AS `older`
    WHERE `older`.`trip_id` = `membership_requests`.`trip_id`
      AND `older`.`user_id` = `membership_requests`.`user_id`
      AND `older`.`status` = 'pending'
      AND (`older`.`created_at` < `membership_requests`.`created_at`
        OR (`older`.`created_at` = `membership_requests`.`created_at` AND `older`.`id` < `membership_requests`.`id`))
  );--> statement-breakpoint
CREATE UNIQUE INDEX `membership_requests_one_pending_user` ON `membership_requests` (`trip_id`, `user_id`) WHERE `status` = 'pending';
