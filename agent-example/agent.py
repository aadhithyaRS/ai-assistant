"""Agentic AI Assistant — core agent configuration."""
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
