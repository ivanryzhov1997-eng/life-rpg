CREATE TABLE `users` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `unionId` varchar(255) NOT NULL,
  `name` varchar(255),
  `email` varchar(320),
  `avatar` text,
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  `lastSignInAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `users_id` PRIMARY KEY(`id`),
  CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
CREATE TABLE `game_saves` (
  `id` serial AUTO_INCREMENT NOT NULL,
  `userId` bigint unsigned NOT NULL,
  `payload` json NOT NULL,
  `revision` int NOT NULL DEFAULT 1,
  `deviceId` varchar(80) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `game_saves_id` PRIMARY KEY(`id`),
  CONSTRAINT `game_saves_userId_unique` UNIQUE(`userId`),
  CONSTRAINT `game_saves_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
