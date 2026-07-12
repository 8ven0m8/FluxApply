import logging
import boto3
from botocore.exceptions import ClientError
from os import getenv
from dotenv import load_dotenv
from urllib.parse import urlencode

load_dotenv()
logger = logging.getLogger(__name__)

S3_BUCKET = getenv("S3_BUCKET_NAME")
S3_REGION = getenv("AWS_REGION")
EXPIRY_TIME = 604800

s3_client = boto3.client(
    "s3",
    region_name=S3_REGION,
    endpoint_url=f"https://s3.{S3_REGION}.amazonaws.com",
)

def download_bytes_from_s3(key: str) -> bytes:
    response = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
    return response["Body"].read()

def download_original_resume_bytes(user_id: str) -> bytes:
    """
    Fetches this user's originally uploaded resume file from S3, trying
    both extensions since we don't track which one was used at upload time.
    Raises FileNotFoundError if neither exists.
    """
    for suffix in (".pdf", ".docx"):
        key = f"{user_id}/original_resume{suffix}"
        try:
            return download_bytes_from_s3(key)
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
                continue
            raise
    raise FileNotFoundError(
        f"No original resume found in S3 for user_id={user_id!r} "
        f"(tried .pdf and .docx). Has this user uploaded a resume yet?"
    )
 
def s3_object_exists(key: str) -> bool:
    """
    Cheap HEAD check, used before handing back a presigned URL — avoids
    generating a link for a file the lifecycle rule already deleted.
    """
    try:
        s3_client.head_object(Bucket=S3_BUCKET, Key=key)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
            return False
        raise


def upload_bytes_to_s3(
    data: bytes,
    key: str,
    content_type: str = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tags: dict[str, str] | None = None,
) -> str:
    """
    Uploads bytes directly to S3 (no local file needed) and returns the S3 URI.
    `key` should be the full object path, e.g. "u1/jd1_resume.docx".
    `tags`, if given, are set as S3 object tags (e.g. for lifecycle rules).
    """
    put_kwargs = {
        "Bucket": S3_BUCKET,
        "Key": key,
        "Body": data,
        "ContentType": content_type,
    }
    if tags:
        put_kwargs["Tagging"] = urlencode(tags)

    try:
        s3_client.put_object(**put_kwargs)
    except ClientError as e:
        logger.error("Failed to upload %s to S3: %s", key, e)
        raise

    return f"s3://{S3_BUCKET}/{key}"


def generate_presigned_url(key: str, expires_in: int = EXPIRY_TIME) -> str:
    """Generates a temporary download link for a private object."""
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )

def s3_uri_to_key(s3_uri: str) -> str:
    """Strips the s3://bucket/ prefix to get back the object key."""
    return s3_uri.replace(f"s3://{S3_BUCKET}/", "", 1)