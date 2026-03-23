"use client";
import React, { useState } from "react";
import axios from "axios";
import { getBackendOrigin } from "@/lib/backendOrigin";

export default function InvoiceUpload({
  onUploadSuccess,
  onUploadStart,
  onUploadError,
}: {
  onUploadSuccess: (data: unknown) => void;
  onUploadStart?: () => void;
  onUploadError?: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const backendOrigin = getBackendOrigin();

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (
      droppedFile &&
      (droppedFile.type === "application/pdf" ||
        droppedFile.type.startsWith("image/"))
    ) {
      setFile(droppedFile);
      setError("");
    } else {
      setError("Please upload a valid PDF or Image file.");
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    setError("");
    onUploadStart?.();

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(
        `${backendOrigin}/api/v1/invoice/invoices/upload`,
        formData,
        { withCredentials: true },
      );
      const data = response.data;

      onUploadSuccess(data);
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? typeof err.response?.data?.detail === "string"
          ? err.response?.data?.detail
          : err.message
        : err instanceof Error
          ? err.message
          : "An error occurred";
      setError(message);
      onUploadError?.(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold mb-6">Upload New Invoice</h2>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
      >
        {file ? (
          <p className="text-green-600 font-medium text-lg">{file.name}</p>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 font-medium">
              Drag & drop your invoice here
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Supports PDF, PNG, JPG up to 10MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <button
        onClick={uploadFile}
        disabled={!file || isUploading}
        className="mt-6 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isUploading ? "Extracting Data via OCR..." : "Process Invoice"}
      </button>
    </div>
  );
}
