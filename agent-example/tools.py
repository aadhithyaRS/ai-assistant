from langchain_core.tools import tool
from langchain_tavily import TavilySearch  # the video shows the older TavilySearchResults (now deprecated)

from memory import LongTermMemory

search = TavilySearch(max_results=5)
notes = LongTermMemory(collection="agent_memory")


@tool
def web_search(query: str) -> str:
    """Search the web for up-to-date information."""
    return str(search.invoke({"query": query}))


@tool
def save_note(note: str) -> str:
    """Persist a useful finding to long-term memory."""
    notes.add(note)
    return "saved"


@tool
def write_report(title: str, sections: dict) -> str:
    """Compile findings into a structured markdown report."""
    body = "\n\n".join(f"## {h}\n{t}" for h, t in sections.items())
    return f"# {title}\n\n{body}"


TOOLS = [web_search, save_note, write_report]
