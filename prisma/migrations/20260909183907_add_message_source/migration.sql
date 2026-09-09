-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('TEXT', 'VOICE');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "source" "MessageSource" NOT NULL DEFAULT 'TEXT';
