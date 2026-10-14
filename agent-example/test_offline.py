"""Offline self-test — runs the REAL graph without any API keys or internet.

The LLM is replaced by a scripted stand-in that first asks for a tool, then answers,
and memory uses a toy embedding. If this passes, your install and the graph wiring work.

    python test_offline.py
"""
import os
import tempfile

os.environ.setdefault("OPENAI_API_KEY", "sk-offline-test")
os.environ.setdefault("TAVILY_API_KEY", "tvly-offline-test")
os.environ["MEMORY_DIR"] = tempfile.mkdtemp(prefix="agent_mem_")

import memory  # noqa: E402
from chromadb import EmbeddingFunction  # noqa: E402


class ToyEmbedding(EmbeddingFunction):
    """Deterministic 16-dim vectors — fine for a wiring test, useless for real search."""
    def __init__(self):
        pass

    def __call__(self, input):
        return [[float((hash(t) >> i) & 1) for i in range(16)] for t in input]

    @staticmethod
    def name():
        return "toy"

    def get_config(self):
        return {}

    @staticmethod
    def build_from_config(config):
        return ToyEmbedding()


memory._embedding_function = lambda: ToyEmbedding()

import agent  # noqa: E402
from langchain_core.messages import AIMessage  # noqa: E402

replies = iter([
    AIMessage(content="", tool_calls=[
        {"name": "save_note", "args": {"note": "competitors: Nimbus AI, Coreline, Parallax Labs"}, "id": "call_1"},
        {"name": "write_report", "args": {"title": "Competitor Summary", "sections": {"Overview": "Three players."}}, "id": "call_2"},
    ]),
    AIMessage(content="# Competitor Summary\nThree players, compared on pricing and focus."),
])


class ScriptedLLM:
    def invoke(self, messages):
        assert messages[0]["role"] == "system", "system prompt should come first"
        return next(replies)


agent.llm_with_tools = ScriptedLLM()

import main  # noqa: E402

result = main.run_task("Research three competitors and create a summary report.")
assert result["tool_calls"] == 2, result
assert result["answer"].startswith("# Competitor Summary"), result
assert len(agent.long_term) == 1, "save_note should have stored one memory"
print("\n✅ Offline test passed — the graph, tools and memory are wired correctly.")
