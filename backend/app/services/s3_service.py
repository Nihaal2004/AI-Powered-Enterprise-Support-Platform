import asyncio
import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


class S3Service:
    def __init__(self):
        self.bucket = os.environ["S3_BUCKET_NAME"]
        region = os.environ["AWS_REGION"]

        self.client = boto3.client(
            "s3",
            region_name=region,
            # Browser PUT preflights must reach the bucket's region directly.
            # The global S3 endpoint can redirect before returning CORS headers.
            endpoint_url=f"https://s3.{region}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
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

    def generate_download_url(
        self,
        object_key: str,
        filename: str,
        expires_in: int = 300,
    ) -> str:
        return self.client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": self.bucket,
                "Key": object_key,
                "ResponseContentDisposition": (
                    f'attachment; filename="{filename}"'
                ),
            },
            ExpiresIn=expires_in,
        )

    
    async def download_object(
        self,
        object_key: str,
    ) -> bytes:
        response = await asyncio.to_thread(
            self.client.get_object,
            Bucket=self.bucket,
            Key=object_key,
        )

        body = response["Body"]

        return await asyncio.to_thread(
            body.read
        )
