-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female');

-- CreateEnum
CREATE TYPE "Batch" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "InternStatus" AS ENUM ('Active', 'Extended', 'Completed');

-- CreateEnum
CREATE TYPE "Workload" AS ENUM ('Low', 'Medium', 'High');

-- CreateEnum
CREATE TYPE "ExtensionReasonType" AS ENUM ('sign_out', 'presentation', 'internal_query', 'leave', 'other');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('extension', 'reassignment', 'unit_change', 'status_change', 'new_intern', 'auto_advance', 'rotation_update');

-- CreateTable
CREATE TABLE "interns" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "batch" "Batch" NOT NULL,
    "start_date" DATE NOT NULL,
    "phone_number" TEXT,
    "status" "InternStatus" NOT NULL DEFAULT 'Active',
    "extension_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "workload" "Workload" NOT NULL DEFAULT 'Medium',
    "patient_count" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotations" (
    "id" SERIAL NOT NULL,
    "intern_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_manual_assignment" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_reasons" (
    "id" SERIAL NOT NULL,
    "intern_id" INTEGER NOT NULL,
    "extension_days" INTEGER NOT NULL,
    "reason" "ExtensionReasonType" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workload_history" (
    "id" SERIAL NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "workload" "Workload" NOT NULL,
    "week_start_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workload_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" SERIAL NOT NULL,
    "activity_type" "ActivityType" NOT NULL,
    "intern_id" INTEGER,
    "intern_name" TEXT,
    "unit_id" INTEGER,
    "unit_name" TEXT,
    "details" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interns_status_idx" ON "interns"("status");

-- CreateIndex
CREATE INDEX "interns_batch_idx" ON "interns"("batch");

-- CreateIndex
CREATE INDEX "interns_start_date_idx" ON "interns"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateIndex
CREATE INDEX "rotations_intern_id_idx" ON "rotations"("intern_id");

-- CreateIndex
CREATE INDEX "rotations_unit_id_idx" ON "rotations"("unit_id");

-- CreateIndex
CREATE INDEX "rotations_start_date_idx" ON "rotations"("start_date");

-- CreateIndex
CREATE INDEX "rotations_end_date_idx" ON "rotations"("end_date");

-- CreateIndex
CREATE INDEX "rotations_intern_id_start_date_idx" ON "rotations"("intern_id", "start_date");

-- CreateIndex
CREATE INDEX "extension_reasons_intern_id_idx" ON "extension_reasons"("intern_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "workload_history_unit_id_idx" ON "workload_history"("unit_id");

-- CreateIndex
CREATE INDEX "workload_history_week_start_date_idx" ON "workload_history"("week_start_date");

-- CreateIndex
CREATE INDEX "activity_log_activity_type_idx" ON "activity_log"("activity_type");

-- CreateIndex
CREATE INDEX "activity_log_intern_id_idx" ON "activity_log"("intern_id");

-- CreateIndex
CREATE INDEX "activity_log_unit_id_idx" ON "activity_log"("unit_id");

-- CreateIndex
CREATE INDEX "activity_log_created_at_idx" ON "activity_log"("created_at");

-- AddForeignKey
ALTER TABLE "rotations" ADD CONSTRAINT "rotations_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "interns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotations" ADD CONSTRAINT "rotations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_reasons" ADD CONSTRAINT "extension_reasons_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "interns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workload_history" ADD CONSTRAINT "workload_history_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_intern_id_fkey" FOREIGN KEY ("intern_id") REFERENCES "interns"("id") ON DELETE SET NULL ON UPDATE CASCADE;


