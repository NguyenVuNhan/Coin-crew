UPDATE `membership_requests` SET `status` = 'rejected'
WHERE `status` = 'pending'
  AND EXISTS (
    SELECT 1 FROM `membership_requests` AS `newer`
    WHERE `newer`.`trip_id` = `membership_requests`.`trip_id`
      AND `newer`.`user_id` = `membership_requests`.`user_id`
      AND `newer`.`status` = 'pending'
      AND (`newer`.`created_at` > `membership_requests`.`created_at`
        OR (`newer`.`created_at` = `membership_requests`.`created_at` AND `newer`.`id` > `membership_requests`.`id`))
  );--> statement-breakpoint
CREATE UNIQUE INDEX `membership_requests_one_pending_user` ON `membership_requests` (`trip_id`, `user_id`) WHERE `status` = 'pending';
