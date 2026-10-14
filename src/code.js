/*
 * code.js — the Python files the "developer" types in scenes 1–2.
 * Edit these strings to change what appears in the editor. They are the same files that are
 * shipped as a runnable project in /agent-example. Typing speed and timing live in app.js (FILES).
 */
// Source files the "developer" types during the video.
window.SRC = {};
SRC.agent1 = String.raw`"""Agentic AI Assistant — core agent configuration."""
import os
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from prompts import SYSTEM_PROMPT, MAX_STEPS
from tools import TOOLS
from memory import LongTermMemory

load_dotenv()

# --- LLM: the agent's reasoning engine ---------------------------
llm = ChatOpenAI(model="gpt-4o", temperature=0)
llm_with_tools = llm.bind_tools(TOOLS)

# --- Memory: short-term (thread) + long-term (vector store) ------
checkpointer = MemorySaver()
long_term = LongTermMemory(collection="agent_memory")


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    plan: list[str]
    step: int
`;
SRC.agent2 = String.raw`

# --- Brain: reason about the next action -------------------------
def reasoning(state: AgentState) -> dict:
    """Think, plan, and decide whether a tool is needed."""
    query = state["messages"][-1].content
    context = long_term.search(query, k=4)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Relevant memory:\n{context}"},
        *state["messages"],
    ]
    response = llm_with_tools.invoke(messages)
    return {"messages": [response], "step": state["step"] + 1}


# --- Decision logic: act with a tool, or respond? ----------------
def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if last.tool_calls and state["step"] < MAX_STEPS:
        return "tools"
    return END


# --- Wire the agent workflow -------------------------------------
graph = StateGraph(AgentState)
graph.add_node("reasoning", reasoning)
graph.add_node("tools", ToolNode(TOOLS))

graph.add_edge(START, "reasoning")
graph.add_conditional_edges("reasoning", should_continue)
graph.add_edge("tools", "reasoning")

agent = graph.compile(checkpointer=checkpointer)
`;
SRC.prompts = String.raw`"""System prompt that defines the agent's goals and behaviour."""

SYSTEM_PROMPT = """You are an autonomous research assistant.

GOAL
- Complete the user's task end-to-end with minimal hand-holding.

HOW YOU WORK
1. Break the task into a short, ordered plan.
2. Reason step by step before every action.
3. Pick the right tool for each step; never guess facts.
4. Save useful findings to memory for later steps.
5. Verify results, then return a clear, structured answer.

RULES
- Cite the source of every researched claim.
- Ask the user if the task is ambiguous or unsafe.
"""

MAX_STEPS = 12
`;
SRC.tools = String.raw`from langchain_core.tools import tool
from langchain_community.tools.tavily_search import TavilySearchResults

from memory import LongTermMemory

search = TavilySearchResults(max_results=5)
notes = LongTermMemory(collection="agent_memory")


@tool
def web_search(query: str) -> str:
    """Search the web for up-to-date information."""
    return search.invoke({"query": query})


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
`;
SRC.agent = SRC.agent1 + SRC.agent2;
