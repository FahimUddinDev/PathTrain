-- CreateTable
CREATE TABLE "RegressionNote" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "topicId" TEXT,
    "baseModel" TEXT NOT NULL,
    "fineTunedModel" TEXT NOT NULL,
    "baseAnswer" TEXT NOT NULL,
    "fineTunedAnswer" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegressionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegressionNote_topicId_idx" ON "RegressionNote"("topicId");
