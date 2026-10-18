from io import BytesIO

from pypdf import PdfReader


class DocumentExtractionService:
    def extract(
        self,
        raw_bytes: bytes,
        mime_type: str,
    ) -> list[tuple[int | None, str]]:

        if mime_type == "text/plain":
            text = raw_bytes.decode("utf-8").strip()

            if not text:
                return []

            return [(None, text)]

        if mime_type == "application/pdf":
            reader = PdfReader(BytesIO(raw_bytes))

            pages: list[tuple[int | None, str]] = []

            for page_number, page in enumerate(
                reader.pages,
                start=1,
            ):
                text = (page.extract_text() or "").strip()

                if text:
                    pages.append(
                        (page_number, text)
                    )

            return pages

        raise ValueError(
            f"Unsupported MIME type: {mime_type}"
        )