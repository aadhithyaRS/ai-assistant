"""Long-term memory for the agent: a small vector store backed by ChromaDB.

The agent saves useful findings with `add()` and recalls the most relevant ones with
`search()` before every reasoning step (see agent.py → reasoning()).

Embeddings
  MEMORY_EMBEDDINGS=openai (default)  uses OpenAI text-embedding-3-small (needs OPENAI_API_KEY)
  MEMORY_EMBEDDINGS=local             uses Chroma's built-in MiniLM model (downloads ~80 MB once, runs offline)
"""
import os
import uuid
from datetime import datetime, timezone

import chromadb
from chromadb.utils import embedding_functions

DATA_DIR = os.getenv("MEMORY_DIR", os.path.join(os.path.dirname(__file__), "chroma_data"))
_clients: dict[str, chromadb.ClientAPI] = {}


def _embedding_function():
    if os.getenv("MEMORY_EMBEDDINGS", "openai").lower() == "local":
        return embedding_functions.DefaultEmbeddingFunction()
    return embedding_functions.OpenAIEmbeddingFunction(
        api_key=os.environ["OPENAI_API_KEY"], model_name="text-embedding-3-small"
    )


def _client(path: str):
    # one client per folder, shared by every LongTermMemory instance
    if path not in _clients:
        _clients[path] = chromadb.PersistentClient(path=path)
    return _clients[path]


class LongTermMemory:
    def __init__(self, collection: str = "agent_memory", path: str = DATA_DIR):
        self.col = _client(path).get_or_create_collection(
            name=collection, embedding_function=_embedding_function()
        )

    def add(self, note: str) -> None:
        """Store one piece of text."""
        self.col.add(
            ids=[str(uuid.uuid4())],
            documents=[note],
            metadatas=[{"saved_at": datetime.now(timezone.utc).isoformat()}],
        )

    def search(self, query: str, k: int = 4) -> str:
        """Return the k most similar notes as a bullet list (or a placeholder if empty)."""
        count = self.col.count()
        if count == 0 or not str(query).strip():
            return "(no saved memories yet)"
        res = self.col.query(query_texts=[str(query)[:2000]], n_results=min(k, count))
        docs = res.get("documents", [[]])[0]
        return "\n".join(f"- {d}" for d in docs) or "(no relevant memories)"

    def __len__(self) -> int:
        return self.col.count()
