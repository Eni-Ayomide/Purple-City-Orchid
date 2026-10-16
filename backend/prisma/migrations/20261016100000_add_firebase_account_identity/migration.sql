ALTER TABLE "users"
ADD COLUMN "firebase_uid" TEXT,
ADD COLUMN "email" VARCHAR(320),
ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
