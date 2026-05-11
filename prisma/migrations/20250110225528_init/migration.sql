-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(99) NOT NULL,
    `email` VARCHAR(99) NOT NULL,
    `password` VARCHAR(100) NULL,
    `refreshToken` TEXT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `emailVerified` DATETIME(3) NULL,
    `emailVerificationToken` VARCHAR(100) NULL,
    `emailVerificationExpires` DATETIME(3) NULL,
    `passwordResetToken` VARCHAR(100) NULL,
    `passwordResetExpires` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
