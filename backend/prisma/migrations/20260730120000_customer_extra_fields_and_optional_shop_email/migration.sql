-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "keyNumber" DROP NOT NULL,
ADD COLUMN     "billAmount" DOUBLE PRECISION,
ADD COLUMN     "vehicleName" TEXT,
ADD COLUMN     "lostKey" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "addKey" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "homeOfficeName" TEXT,
ADD COLUMN     "vehicleCategory" TEXT;
