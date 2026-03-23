"use client";
import { useState, type ComponentProps } from "react";
// Using relative paths to fix import errors
import InvoiceUpload from "../../components/InvoiceUpload";
import InvoiceCorrection from "../../components/InvoiceCorrection";

type InvoiceCorrectionData = ComponentProps<typeof InvoiceCorrection>["data"];

export default function UploadPage() {
  const [invoiceData, setInvoiceData] = useState<InvoiceCorrectionData | null>(
    null,
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 text-center mb-8">
          Invoice Processing Gateway
        </h1>

        {!invoiceData ? (
          <InvoiceUpload onUploadSuccess={(data) => setInvoiceData(data)} />
        ) : (
          <InvoiceCorrection data={invoiceData} />
        )}
      </div>
    </div>
  );
}
