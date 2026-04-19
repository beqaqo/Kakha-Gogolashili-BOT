from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence


DEFAULT_COLLECTION_NAME = "articles"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_PERSIST_DIRECTORY = "./chroma_db"
DEFAULT_LOCAL_MODEL_DIRECTORY = "./models/all-MiniLM-L6-v2"


def resolve_embedding_model(model_name: str = DEFAULT_EMBEDDING_MODEL) -> str:
    local_model_path = Path(DEFAULT_LOCAL_MODEL_DIRECTORY)
    if local_model_path.exists():
        return str(local_model_path)
    return model_name


def create_embedding_function(model_name: str = DEFAULT_EMBEDDING_MODEL, device: str | None = None):
    resolved_model = resolve_embedding_model(model_name)

    if Path(resolved_model).exists():
        return LocalSentenceTransformerEmbeddingFunction(
            model_name=resolved_model,
            device=device,
        )

    try:
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
    except ImportError as exc:
        raise ImportError(
            "chromadb with ONNX embedding support is required. Install dependencies with: "
            "py -3 -m pip install -r requirements.txt"
        ) from exc

    return ONNXMiniLM_L6_V2()


class LocalSentenceTransformerEmbeddingFunction:
    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL, device: str | None = None):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise ImportError(
                "sentence-transformers is required. Install dependencies with: "
                "pip install chromadb sentence-transformers"
            ) from exc

        self.model_name = model_name
        self.device = device
        self._model = SentenceTransformer(model_name, device=device)

    def __call__(self, input: Sequence[str]) -> list[list[float]]:
        embeddings = self._model.encode(list(input), normalize_embeddings=True)
        return embeddings.tolist()


@dataclass(slots=True)
class SearchResult:
    id: str
    content: str
    metadata: dict[str, Any]
    distance: float | None = None


class ArticleEmbeddingStore:
    def __init__(
        self,
        collection_name: str = DEFAULT_COLLECTION_NAME,
        persist_directory: str = DEFAULT_PERSIST_DIRECTORY,
        embedding_model_name: str = DEFAULT_EMBEDDING_MODEL,
        device: str | None = None,
    ):
        try:
            import chromadb
        except ImportError as exc:
            raise ImportError(
                "chromadb is required. Install dependencies with: "
                "pip install chromadb sentence-transformers"
            ) from exc

        self.collection_name = collection_name
        self.persist_directory = str(Path(persist_directory))
        self.embedding_model_name = embedding_model_name
        self.embedding_function = create_embedding_function(
            model_name=embedding_model_name,
            device=device,
        )
        self.client = chromadb.PersistentClient(path=self.persist_directory)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_function,
            metadata={"hnsw:space": "cosine"},
        )

    def upsert_articles(self, articles: Sequence[Mapping[str, Any]]) -> int:
        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict[str, Any]] = []

        for article in articles:
            content = str(article.get("content", "")).strip()
            if not content:
                continue

            article_id = self._build_article_id(article)
            ids.append(article_id)
            documents.append(content)
            metadatas.append(self._build_metadata(article, article_id))

        if not ids:
            return 0

        self.collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
        return len(ids)

    async def aupsert_articles(self, articles: Sequence[Mapping[str, Any]]) -> int:
        return await asyncio.to_thread(self.upsert_articles, articles)

    def query(
        self,
        query_text: str,
        limit: int = 4,
        where: Mapping[str, Any] | None = None,
    ) -> list[SearchResult]:
        query_text = query_text.strip()
        if not query_text:
            return []

        response = self.collection.query(
            query_texts=[query_text],
            n_results=limit,
            where=dict(where) if where else None,
            include=["documents", "metadatas", "distances"],
        )

        ids = response.get("ids", [[]])[0]
        documents = response.get("documents", [[]])[0]
        metadatas = response.get("metadatas", [[]])[0]
        distances = response.get("distances", [[]])[0]

        results: list[SearchResult] = []
        for index, item_id in enumerate(ids):
            results.append(
                SearchResult(
                    id=item_id,
                    content=documents[index],
                    metadata=metadatas[index] or {},
                    distance=distances[index] if index < len(distances) else None,
                )
            )

        return results

    async def aquery(
        self,
        query_text: str,
        limit: int = 4,
        where: Mapping[str, Any] | None = None,
    ) -> list[SearchResult]:
        return await asyncio.to_thread(self.query, query_text, limit, where)

    def count(self) -> int:
        return self.collection.count()

    def delete(self, ids: Sequence[str]) -> None:
        if ids:
            self.collection.delete(ids=list(ids))

    def reset(self) -> None:
        self.client.delete_collection(self.collection_name)
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self.embedding_function,
            metadata={"hnsw:space": "cosine"},
        )

    @staticmethod
    def _build_article_id(article: Mapping[str, Any]) -> str:
        source_id = article.get("id") or article.get("slug")
        if source_id:
            return str(source_id)

        identity = "|".join(
            [
                str(article.get("title", "")),
                str(article.get("author", "")),
                str(article.get("category", "")),
                str(article.get("content", "")),
            ]
        )
        return hashlib.sha256(identity.encode("utf-8")).hexdigest()

    @staticmethod
    def _build_metadata(article: Mapping[str, Any], article_id: str) -> dict[str, Any]:
        tags = article.get("tags") or []
        if isinstance(tags, str):
            normalized_tags = [tags]
        else:
            normalized_tags = [str(tag) for tag in tags]

        metadata: dict[str, Any] = {
            "article_id": article_id,
            "title": str(article.get("title", "")),
            "author": str(article.get("author", "")),
            "category": str(article.get("category", "")),
            "tags_json": json.dumps(normalized_tags, ensure_ascii=True),
        }

        if article.get("source"):
            metadata["source"] = str(article["source"])

        if article.get("url"):
            metadata["url"] = str(article["url"])

        return metadata


def build_context(results: Sequence[SearchResult], max_chars: int = 3000) -> str:
    sections: list[str] = []
    current_len = 0
    for result in results:
        title = result.metadata.get("title") or result.id
        block = f"Title: {title}\nContent: {result.content}"
        
        if current_len + len(block) > max_chars:
            # If we have space for at least 200 chars, take a snippet
            remaining = max_chars - current_len
            if remaining > 200:
                sections.append(block[:remaining] + "... [truncated]")
            break
            
        sections.append(block)
        current_len += len(block)
        
    return "\n\n".join(sections)


def create_default_store(
    persist_directory: str = DEFAULT_PERSIST_DIRECTORY,
    collection_name: str = DEFAULT_COLLECTION_NAME,
    embedding_model_name: str = DEFAULT_EMBEDDING_MODEL,
) -> ArticleEmbeddingStore:
    return ArticleEmbeddingStore(
        collection_name=collection_name,
        persist_directory=persist_directory,
        embedding_model_name=embedding_model_name,
    )