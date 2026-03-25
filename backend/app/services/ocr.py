import re
import io
import cv2
import numpy as np
import pytesseract
import pdfplumber
from PIL import Image


# PDF → clean image 

def pdf_to_image(file_bytes: bytes, page_number: int = 0) -> np.ndarray:
    """Convert a PDF page to a numpy image array using pdfplumber."""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        page = pdf.pages[page_number]
        # Render page as image at high resolution
        pil_image = page.to_image(resolution=200).original
        return np.array(pil_image)


def preprocess_image(img: np.ndarray) -> np.ndarray:

    # Handle RGBA images (PDFs sometimes have alpha channel)
    if len(img.shape) == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2RGB)

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)

    # Otsu threshold — automatically finds best black/white cutoff
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Light denoising
    denoised = cv2.fastNlMeansDenoising(thresh, h=10)

    return denoised


# Run Tesseract OCR 

def run_ocr(img: np.ndarray) -> dict:
    """
    Run Tesseract and return full text + average confidence score.
    """
    pil_img = Image.fromarray(img)

    # Get full text
    full_text = pytesseract.image_to_string(pil_img)

    # Get word-level confidence data
    data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)

    # Average confidence (ignore -1 values which mean no word detected)
    confidences = [int(c) for c in data["conf"] if int(c) != -1]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "full_text": full_text,
        "avg_confidence": round(avg_confidence / 100, 2),
    }


# Also extract text directly from PDF 

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract text directly from PDF using pdfplumber (no OCR needed for digital PDFs).
    Falls back to OCR for scanned/image PDFs.
    """
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            text = ""
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text.strip()
    except Exception:
        return ""


#  specific fields using regex 

def extract_fields(text: str) -> dict:
    """
    Extract invoice fields from raw OCR text using regex patterns.
    Returns each field with its value and a confidence score.
    """
    fields = {}

    # Invoice Number 
    inv_pattern = re.search(
        r"(?:invoice\s*(?:no|number|#)[:\s#]*|INV[-/]?)(\w[\w\-/]*\d+)",
        text,
        re.IGNORECASE,
    )
    if inv_pattern:
        fields["invoice_number"] = {
            "value": inv_pattern.group(1).strip(),
            "confidence": 0.90,
        }
    else:
        fields["invoice_number"] = {"value": None, "confidence": 0.0}

    # Amount 
    amount_pattern = re.search(
        r"(?:total|amount due|grand total|balance due)[^\d]*"
        r"([\$₹€£]?\s?[\d,]+(?:\.\d{1,2})?)",
        text,
        re.IGNORECASE,
    )
    if amount_pattern:
        raw = amount_pattern.group(1).replace(",", "").replace(" ", "")
        raw = re.sub(r"[₹$€£]", "", raw)
        try:
            fields["amount"] = {"value": float(raw), "confidence": 0.92}
        except ValueError:
            fields["amount"] = {"value": None, "confidence": 0.0}
    else:
        fields["amount"] = {"value": None, "confidence": 0.0}

    # Currency
    currency = "INR"
    currency_map = {"₹": "INR", "$": "USD", "€": "EUR", "£": "GBP"}
    for symbol, code in currency_map.items():
        if symbol in text:
            currency = code
            break
    if "INR" in text.upper():
        currency = "INR"
    elif "USD" in text.upper():
        currency = "USD"
    fields["currency"] = {"value": currency, "confidence": 0.85}

    # Dates
    date_pattern = re.compile(
        r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2}|"
        r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})\b",
        re.IGNORECASE,
    )
    dates_found = date_pattern.findall(text)

    if len(dates_found) >= 2:
        fields["issue_date"] = {"value": dates_found[0], "confidence": 0.80}
        fields["due_date"] = {"value": dates_found[-1], "confidence": 0.80}
    elif len(dates_found) == 1:
        fields["issue_date"] = {"value": dates_found[0], "confidence": 0.70}
        fields["due_date"] = {"value": None, "confidence": 0.0}
    else:
        fields["issue_date"] = {"value": None, "confidence": 0.0}
        fields["due_date"] = {"value": None, "confidence": 0.0}

    # Company Names 
    seller_match = re.search(
        r"(?:from|vendor|billed?\s*by|seller)[:\s]+([A-Z][A-Za-z\s&.,]+?)(?:\n|Ltd|LLC|Inc|Pvt)",
        text,
        re.IGNORECASE,
    )
    client_match = re.search(
        r"(?:to|bill\s*to|client|customer|buyer)[:\s]+([A-Z][A-Za-z\s&.,]+?)(?:\n|Ltd|LLC|Inc|Pvt)",
        text,
        re.IGNORECASE,
    )

    fields["seller_name"] = {
        "value": seller_match.group(1).strip() if seller_match else None,
        "confidence": 0.75 if seller_match else 0.0,
    }
    fields["client_name"] = {
        "value": client_match.group(1).strip() if client_match else None,
        "confidence": 0.75 if client_match else 0.0,
    }

    return fields


# Main function

def process_invoice_file(file_bytes: bytes, filename: str) -> dict:
    
    try:
        extracted_text = ""
        overall_confidence = 0.0

        if filename.lower().endswith(".pdf"):
            # Try direct text extraction first (works for digital PDFs)
            extracted_text = extract_text_from_pdf(file_bytes)

            if extracted_text and len(extracted_text) > 50:
                # Digital PDF — text extracted directly, high confidence
                overall_confidence = 0.95
            else:
                # Scanned PDF — fall back to OCR
                img = pdf_to_image(file_bytes)
                clean_img = preprocess_image(img)
                ocr_result = run_ocr(clean_img)
                extracted_text = ocr_result["full_text"]
                overall_confidence = ocr_result["avg_confidence"]
        else:
            # Image file — use OCR directly
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            clean_img = preprocess_image(img)
            ocr_result = run_ocr(clean_img)
            extracted_text = ocr_result["full_text"]
            overall_confidence = ocr_result["avg_confidence"]

        # Extract fields from text
        fields = extract_fields(extracted_text)

        return {
            "success": True,
            "fields": fields,
            "raw_text": extracted_text,
            "overall_confidence": overall_confidence,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "fields": {},
            "raw_text": "",
            "overall_confidence": 0.0,
        }
