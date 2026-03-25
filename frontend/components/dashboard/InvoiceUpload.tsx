"use client";

import React, { useState} from "react";
import { toast } from "sonner";
import { Upload, FileText, Loader2, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

type OcrField = { value: string | number | null; confidence: number };
type InvoiceUploadResponse = {
  invoice_id: number;
  filename: string;
  status: string;
  ocr_fields: Record<string, OcrField>;
  hash: string;
  overall_ocr_confidence?: number;
};

interface InvoiceUploadProps {
  onUploadSuccess: (data: InvoiceUploadResponse) => void;
}

export default function InvoiceUpload({ onUploadSuccess }: InvoiceUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (selectedFile: File) => {
    const isValidType = ["application/pdf", "image/png", "image/jpeg", "image/jpg"].includes(selectedFile.type);
    const isValidSize = selectedFile.size <= 10 * 1024 * 1024; // 10MB

    if (!isValidType) {
      toast.error("Invalid file type. Please upload a PDF or Image.");
      return;
    }
    if (!isValidSize) {
      toast.error("File is too large. Max size is 10MB.");
      return;
    }

    setFile(selectedFile);
  };

  const uploadFile = async () => {
    if (!file) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Using the centralized api instance for interceptors and base URL
      const response = await api.post("/invoice/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      toast.success("OCR Extraction Successful!");
      onUploadSuccess(response.data);
    } catch (err: any) {
      const message = err.response?.data?.detail || "Upload failed. Please try again.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold">Upload Invoice</h2>
        <p className="text-xs text-muted-foreground">Upload your PDF or Image invoice to automatically extract data via AI.</p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-xl p-10 transition-all flex flex-col items-center justify-center gap-3 ${
          file ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20 hover:border-primary/30 hover:bg-muted/50"
        }`}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileChange}
          accept=".pdf,.png,.jpg,.jpeg"
          disabled={isUploading}
        />

        {file ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="bg-primary/10 p-3 rounded-full mb-2">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm font-bold max-w-[200px] truncate">{file.name}</p>
            <button 
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-[10px] uppercase font-black text-destructive mt-2 hover:underline"
            >
              Remove File
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="bg-muted p-3 rounded-full mb-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Click or drag & drop</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">PDF, PNG, JPG (Max 10MB)</p>
          </div>
        )}
      </div>

      <Button
        onClick={uploadFile}
        disabled={!file || isUploading}
        className="w-full h-12 font-bold transition-all"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            AI Processing...
          </>
        ) : (
          <>
            <FileText className="mr-2 h-5 w-5" />
            Process Invoice
          </>
        )}
      </Button>
    </div>
  );
}