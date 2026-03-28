import re
from Crypto.Hash import keccak


# Normalization functions
def normalize_text(value: str) -> str:
    if not value:
        return ""
    value = str(value).upper()
    value = re.sub(r"[^\w\s]", "", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalize_amount(amount) -> str:
    if amount is None:
        return "0"
    try:
        return str(int(round(float(amount))))
    except (ValueError, TypeError):
        return "0"


def normalize_date(date_str: str) -> str:
    if not date_str:
        return ""
    match = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", date_str)
    if match:
        d, m, y = match.groups()
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    match = re.match(r"(\d{4})[/-](\d{2})[/-](\d{2})", date_str)
    if match:
        return date_str
    return normalize_text(date_str)


# Build canonical string


def build_canonical_string(
    invoice_number: str,
    seller_name: str,
    client_name: str,
    amount,
    due_date: str,
    currency: str = "INR",
) -> str:
    """
    Fixed format: INVOICE_NUMBER|SELLER|CLIENT|AMOUNT|CURRENCY|DUE_DATE
    Example: "INV042|PIZZA CORNER|INFOSYS LTD|50000|INR|2025-03-15"
    """
    parts = [
        normalize_text(invoice_number),
        normalize_text(seller_name),
        normalize_text(client_name),
        normalize_amount(amount),
        normalize_text(currency),
        normalize_date(str(due_date) if due_date else ""),
    ]
    return "|".join(parts)


# Hash with keccak256 (pycryptodome)


def compute_keccak256(canonical_string: str) -> str:
    """
    Generate keccak256 hash using pycryptodome.
    Same algorithm used by Ethereum — hash can be verified on-chain.
    """
    k = keccak.new(digest_bits=256)
    k.update(canonical_string.encode("utf-8"))
    return "0x" + k.hexdigest()


# Main function


def generate_invoice_hash(
    invoice_number: str,
    seller_name: str,
    client_name: str,
    amount,
    due_date: str,
    currency: str = "INR",
) -> dict:
    canonical = build_canonical_string(
        invoice_number=invoice_number,
        seller_name=seller_name,
        client_name=client_name,
        amount=amount,
        due_date=due_date,
        currency=currency,
    )
    invoice_hash = compute_keccak256(canonical)
    return {
        "canonical_string": canonical,
        "hash": invoice_hash,
    }
