"""Run the agent from the terminal, or as a small web app.

  python main.py                                  # interactive: type tasks, see the agent think
  python main.py "Research three competitors and create a summary report."
  python main.py --serve                          # web playground at http://127.0.0.1:8000
"""
import argparse
import sys
import time
import uuid

from dotenv import load_dotenv

load_dotenv()  # must run before agent.py builds the LLM / tools

from rich.console import Console  # noqa: E402

from agent import agent, long_term  # noqa: E402

console = Console(highlight=False)


def run_task(task: str, thread_id: str | None = None, verbose: bool = True) -> dict:
    """Stream one task through the graph and print what each node does (like the video's logs)."""
    thread_id = thread_id or uuid.uuid4().hex[:6]
    config = {"configurable": {"thread_id": thread_id}}
    inputs = {"messages": [("user", task)], "plan": [], "step": 0}
    t0, steps, tool_calls, answer = time.time(), 0, 0, ""

    def log(tag, style, text):
        if verbose:
            console.print(f"[dim]{time.strftime('%H:%M:%S')}[/] [{style}]{tag:<7}[/] {text}")

    if verbose:
        console.rule(f"[dim]task {thread_id}")
    log("TASK", "cyan", f'"{task}"')
    for update in agent.stream(inputs, config, stream_mode="updates"):
        for node, out in update.items():
            steps += 1
            for msg in out.get("messages", []):
                if node == "reasoning":
                    log("NODE", "magenta", f"reasoning    ▸ step {out.get('step', '?')}")
                    if getattr(msg, "tool_calls", None):
                        log("DECIDE", "blue", "→ tools")
                        for call in msg.tool_calls:
                            tool_calls += 1
                            args = ", ".join(f'{k}={v!r}' for k, v in call["args"].items())
                            log("TOOL", "green", f"{call['name']}({args[:90]})")
                    else:
                        log("DECIDE", "blue", "→ END")
                        answer = msg.content
                elif node == "tools":
                    preview = str(msg.content).replace("\n", " ")[:100]
                    log("RESULT", "yellow", f"{msg.name}: {preview}…")
    log("DONE", "green", f"{steps} steps · {tool_calls} tool calls · {time.time() - t0:.1f}s")
    return {"thread_id": thread_id, "answer": answer, "steps": steps, "tool_calls": tool_calls}


def create_app():
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse
    from pydantic import BaseModel

    app = FastAPI(title="Agentic AI Assistant")

    class Task(BaseModel):
        task: str
        thread_id: str | None = None

    @app.post("/api/tasks")
    def create_task(t: Task):
        return run_task(t.task, t.thread_id)

    @app.get("/", response_class=HTMLResponse)
    def playground():
        return PLAYGROUND_HTML

    return app


def serve(port: int):
    import uvicorn

    console.print(f"[green]INFO[/]     Memory: {len(long_term)} saved notes")
    uvicorn.run(create_app(), host="127.0.0.1", port=port)


PLAYGROUND_HTML = """<!doctype html><meta charset=utf-8><title>Agent Playground</title>
<style>body{font:15px system-ui;background:#0f1117;color:#e6e9f2;max-width:820px;margin:40px auto;padding:0 16px}
textarea{width:100%;height:70px;background:#171a23;color:#fff;border:1px solid #2c3140;border-radius:10px;padding:12px;font:inherit}
button{margin-top:8px;background:#6d5dfc;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;cursor:pointer}
.msg{white-space:pre-wrap;background:#161922;border:1px solid #252a37;border-radius:12px;padding:14px;margin-top:16px}</style>
<h2>Agentic AI Assistant</h2><textarea id=t>Research three competitors and create a summary report.</textarea>
<button onclick=go()>Run agent</button><div id=out></div>
<script>async function go(){const o=document.getElementById('out');o.innerHTML='<div class=msg>Working… (watch the terminal for live logs)</div>';
const r=await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:document.getElementById('t').value})});
const j=await r.json();o.innerHTML='<div class=msg></div>';o.firstChild.textContent=j.answer+'\\n\\n— '+j.steps+' steps · '+j.tool_calls+' tool calls';}</script>"""


def main():
    ap = argparse.ArgumentParser(description="Agentic AI Assistant")
    ap.add_argument("task", nargs="*", help="a task to run once (omit for interactive mode)")
    ap.add_argument("--serve", action="store_true", help="start the web playground")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()

    if a.serve:
        return serve(a.port)
    if a.task:
        res = run_task(" ".join(a.task))
        console.print("\n" + res["answer"])
        return
    console.print("[bold]Agentic AI Assistant[/] — type a task, or 'exit' to quit.")
    thread = uuid.uuid4().hex[:6]  # same thread = the agent remembers the conversation
    while True:
        try:
            task = input("\nyou › ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if task.lower() in {"exit", "quit"}:
            break
        if task:
            console.print("\n" + run_task(task, thread)["answer"])


if __name__ == "__main__":
    sys.exit(main())
