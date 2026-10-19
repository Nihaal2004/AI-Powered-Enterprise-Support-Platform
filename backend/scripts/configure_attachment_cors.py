"""Merge local frontend upload origins into the configured attachment bucket CORS.

Run inside the existing backend container so AWS credentials stay server-side:
  docker exec -i enterprisesupportplatform-backend-1 python - < backend/scripts/configure_attachment_cors.py
Requires s3:GetBucketCORS and s3:PutBucketCORS on the configured bucket.
"""
import json
import os

import boto3
from botocore.exceptions import ClientError


def configure():
    region = os.environ["AWS_REGION"]
    bucket = os.environ["S3_BUCKET_NAME"]
    client = boto3.client("s3", region_name=region, endpoint_url=f"https://s3.{region}.amazonaws.com")
    try:
        existing = client.get_bucket_cors(Bucket=bucket).get("CORSRules", [])
    except ClientError as error:
        if error.response["Error"]["Code"] != "NoSuchCORSConfiguration":
            raise
        existing = []
    rule = {
        "ID": "agent-local-direct-upload",
        "AllowedOrigins": ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
        "AllowedMethods": ["PUT"],
        "AllowedHeaders": ["Content-Type"],
        "MaxAgeSeconds": 300,
    }
    # Preserve existing production/knowledge-base rules. Never replace the policy blindly.
    rules = [item for item in existing if item.get("ID") != rule["ID"]] + [rule]
    if rules != existing:
        client.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": rules})
    print(json.dumps({"configured_origins": rule["AllowedOrigins"], "existing_rules_preserved": True}))


if __name__ == "__main__":
    configure()
