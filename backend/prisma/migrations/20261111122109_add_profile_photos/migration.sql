-- CreateTable
CREATE TABLE "profile_photos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_photos_storage_key_key" ON "profile_photos"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "profile_photos_user_id_position_key" ON "profile_photos"("user_id", "position");

-- AddForeignKey
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
