import re


class CitationService:
    CITATION_PATTERN = re.compile(r"\[(\d+)\]")

    @classmethod
    def strip_citations(
        cls,
        text: str,
    ) -> str:
        cleaned = cls.CITATION_PATTERN.sub("", text)

        # Clean spaces left before punctuation / doubled spaces.
        cleaned = re.sub(r" +([.,;:!?])", r"\1", cleaned)
        cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)

        return cleaned.strip()


    @classmethod
    def build_citations(
        cls,
        draft_text: str,
        knowledge_chunks: list[dict],
    ) -> list[dict]:
        referenced_numbers = {
            int(match)
            for match in cls.CITATION_PATTERN.findall(draft_text)
        }

        if not referenced_numbers:
            raise ValueError(
                "Generated reply contains no citations"
            )

        max_citation = len(knowledge_chunks)

        invalid = sorted(
            number
            for number in referenced_numbers
            if number < 1 or number > max_citation
        )

        if invalid:
            raise ValueError(
                f"Generated reply contains invalid citations: {invalid}"
            )

        return [
            {
    "citation": number,
    "chunk_id": knowledge_chunks[number - 1]["chunk_id"],
    "document_id": knowledge_chunks[number - 1]["document_id"],
    "chunk_index": knowledge_chunks[number - 1]["chunk_index"],
    "page_number": knowledge_chunks[number - 1]["page_number"],
    "similarity": knowledge_chunks[number - 1]["similarity"],
}
            for number in sorted(referenced_numbers)
        ]