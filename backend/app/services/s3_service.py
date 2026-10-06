import asyncio
import os

import boto3
from botocore.exceptions import ClientError


class S3Service:
    def __init__(self):
        self.bucket = os.environ["S3_BUCKET_NAME"]

        self.client = boto3.client(
            "s3",
            region_name=os.environ["AWS_REGION"],
        )

    def generate_upload_url(
        self,
        object_key: str,
        content_type: str,
        expires_in: int = 300,
    ) -> str:
        return self.client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self.bucket,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

    async def get_object_metadata(
        self,
        object_key: str,
    ) -> dict:
        try:
            response = await asyncio.to_thread(
                self.client.head_object,
                Bucket=self.bucket,
                Key=object_key,
            )

            return response

        except ClientError as exc:
            raise ValueError(
                "Uploaded object could not be found in S3"
            ) from exc

    async def delete_object(
        self,
        object_key: str,
    ) -> None:
        await asyncio.to_thread(
            self.client.delete_object,
            Bucket=self.bucket,
            Key=object_key,
        )