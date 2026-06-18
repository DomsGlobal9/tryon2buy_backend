-- CreateTable
CREATE TABLE "tryon_vendors" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tryon_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryon_garments" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "original_image_url" TEXT NOT NULL,
    "processed_image_url" TEXT,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tryon_garments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryon_human_models" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tryon_human_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryon_generations" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "garment_id" TEXT,
    "human_model_id" TEXT,
    "garment_source" TEXT NOT NULL,
    "catalog_product_id" TEXT,
    "garment_image_url" TEXT NOT NULL,
    "human_image_url" TEXT NOT NULL,
    "result_image_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tryon_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tryon_vendors_email_key" ON "tryon_vendors"("email");

-- AddForeignKey
ALTER TABLE "tryon_garments" ADD CONSTRAINT "tryon_garments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "tryon_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_human_models" ADD CONSTRAINT "tryon_human_models_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "tryon_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_generations" ADD CONSTRAINT "tryon_generations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "tryon_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_generations" ADD CONSTRAINT "tryon_generations_garment_id_fkey" FOREIGN KEY ("garment_id") REFERENCES "tryon_garments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_generations" ADD CONSTRAINT "tryon_generations_human_model_id_fkey" FOREIGN KEY ("human_model_id") REFERENCES "tryon_human_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
