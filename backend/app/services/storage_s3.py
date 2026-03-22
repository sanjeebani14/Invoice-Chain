import os
import re
from uuid import uuid4

import boto3


def _sanitize_filename(name: str) -> str:
    name = os.path.basename(name or "upload")
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return name[:160] or "upload"


def get_s3_client():
    endpoint_url = (os.getenv("S3_ENDPOINT_URL") or "").strip() or None
    region_name = (os.getenv("S3_REGION") or "").strip() or None
    return boto3.client("s3", endpoint_url=endpoint_url, region_name=region_name)


def get_s3_bucket() -> str:
    bucket = (os.getenv("S3_BUCKET") or "").strip()
    if not bucket:
        raise RuntimeError("S3_BUCKET is not set")
    return bucket


def upload_kyc_document(
    *,
    user_id: int,
    filename: str,
    content_type: str | None,
    file_bytes: bytes,
) -> dict:
    bucket = get_s3_bucket()
    safe_name = _sanitize_filename(filename)
    key = f"kyc/{user_id}/{uuid4().hex}_{safe_name}"

    client = get_s3_client()
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    client.put_object(Bucket=bucket, Key=key, Body=file_bytes, **extra_args)

    return {"bucket": bucket, "key": key}


def upload_invoice_document(
    *,
    seller_id: int,
    filename: str,
    content_type: str | None,
    file_bytes: bytes,
) -> dict:
    bucket = get_s3_bucket()
    safe_name = _sanitize_filename(filename)
    key = f"invoices/{seller_id}/{uuid4().hex}_{safe_name}"

    client = get_s3_client()
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    client.put_object(Bucket=bucket, Key=key, Body=file_bytes, **extra_args)
    return {"bucket": bucket, "key": key}


def build_s3_uri(bucket: str, key: str) -> str:
    return f"s3://{bucket}/{key}"


def parse_s3_uri(uri: str) -> tuple[str, str] | None:
    if not uri or not uri.startswith("s3://"):
        return None
    rest = uri[5:]
    if "/" not in rest:
        return None
    bucket, key = rest.split("/", 1)
    if not bucket or not key:
        return None
    return bucket, key


def generate_presigned_get_url(*, bucket: str, key: str, expires_in: int = 900) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )
