from fastembed import TextEmbedding


class EmbeddingService:
    def __init__(self):
        self.model = TextEmbedding(
            model_name="BAAI/bge-small-en-v1.5"
        )

    def embed_documents(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        return [
            embedding.tolist()
            for embedding in self.model.embed(texts)
        ]

    def embed_query(
        self,
        query: str,
    ) -> list[float]:
        embedding = next(
            self.model.query_embed(query)
        )

        return embedding.tolist()