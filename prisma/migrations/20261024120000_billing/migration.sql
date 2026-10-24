-- CreateTable
CREATE TABLE "BillingCompany" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'FAC',
    "nextInvoice" INTEGER NOT NULL DEFAULT 1,
    "nextQuote" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "issueDate" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "snapshot" JSONB,
    "pdfBytes" BYTEA,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "sourceQuoteId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingCompany_workspaceId_idx" ON "BillingCompany"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCompany_id_workspaceId_key" ON "BillingCompany"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "BillingCustomer_workspaceId_idx" ON "BillingCustomer"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_sourceQuoteId_key" ON "BillingDocument"("sourceQuoteId");

-- CreateIndex
CREATE INDEX "BillingDocument_workspaceId_issueDate_idx" ON "BillingDocument"("workspaceId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDocument_companyId_number_key" ON "BillingDocument"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_id_workspaceId_key" ON "Brand"("id", "workspaceId");

-- AddForeignKey
ALTER TABLE "BillingCompany" ADD CONSTRAINT "BillingCompany_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_companyId_workspaceId_fkey" FOREIGN KEY ("companyId", "workspaceId") REFERENCES "BillingCompany"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Protect business invariants against accidental writes outside the service.
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_type_status_check" CHECK (
  ("type" = 'INVOICE' AND "status" IN ('DRAFT','ISSUED','PAID')) OR
  ("type" = 'QUOTE' AND "status" IN ('DRAFT','SENT','ACCEPTED','REFUSED'))
);
ALTER TABLE "BillingDocument" ADD CONSTRAINT "BillingDocument_emission_check" CHECK (
  "status" = 'DRAFT' OR ("number" IS NOT NULL AND "snapshot" IS NOT NULL AND "pdfBytes" IS NOT NULL AND "issuedAt" IS NOT NULL)
);
CREATE FUNCTION zuri_protect_issued_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."type" = 'INVOICE' AND OLD."status" <> 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued invoices cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','revision','updatedAt']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','revision','updatedAt']) OR
       NOT (NEW."status" = OLD."status" OR (OLD."status" = 'ISSUED' AND NEW."status" = 'PAID')) THEN
      RAISE EXCEPTION 'Issued invoices are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "BillingDocument_protect_issued" BEFORE UPDATE OR DELETE ON "BillingDocument"
FOR EACH ROW EXECUTE FUNCTION zuri_protect_issued_invoice();
