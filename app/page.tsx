"use client";

import { FormEvent, useState } from "react";

type Event = { title: string; detail: string };

export default function Home() {
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);

  async function runAgent(event: FormEvent) {
    event.preventDefault();
    if (!command.trim() || running) return;

    setRunning(true);
    setResponse("");
    setEvents([
      { title: "Task received", detail: command.trim() },
      { title: "Planning", detail: "Breaking the request into browser actions…" },
    ]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Request failed.");
      }

      setEvents((current) => [
        ...current,
        { title: "Model connected", detail: "OpenRouter / openai/gpt-5.5" },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        setResponse((current) => current + decoder.decode(value, { stream: true }));
      }

      setEvents((current) => [
        ...current,
        { title: "Plan ready", detail: "Browser-control tools can be connected next." },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setResponse(message);
      setEvents((current) => [...current, { title: "Error", detail: message }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="agent-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <span>Browser Agent</span>
        </div>
        <div className="nav-label">Workspace</div>
        <div className="nav-item active"><span>Agent</span><span>⌘1</span></div>
        <div className="nav-item"><span>Runs</span><span>0</span></div>
        <div className="nav-item"><span>Browser</span><span>—</span></div>
        <div className="nav-item"><span>Settings</span><span>⌘,</span></div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="status"><span className="dot" /> Agent ready</div>
          <div className="model">openai/gpt-5.5 · OpenRouter</div>
        </header>

        <div className="workspace">
          <div className="hero">
            <div className="eyebrow">Browser automation workspace</div>
            <h1>Tell the browser what to do.</h1>
            <p>Describe a task in plain language. The agent will turn it into an executable browser workflow.</p>
          </div>

          <form className="command-card" onSubmit={runAgent}>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Example: Open Google, search for the latest laptops under ₹60,000, compare the first five results, and summarize them."
            />
            <div className="card-footer">
              <span className="hint">Enter a task · browser tools are coming in the next phase</span>
              <button className="run" type="submit" disabled={!command.trim() || running}>
                {running ? "Running…" : "Run agent →"}
              </button>
            </div>
          </form>

          <div className="panel">
            <section className="card">
              <h2>Live activity</h2>
              {events.length === 0 ? (
                <div className="empty">No activity yet. Run a task to see the agent's execution timeline.</div>
              ) : (
                events.map((item, index) => (
                  <div className="event" key={`${item.title}-${index}`}>
                    <div className="event-icon">{index + 1}</div>
                    <div className="event-body">
                      <div className="event-title">{item.title}</div>
                      <div className="event-detail">{item.detail}</div>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="card">
              <h2>Agent output</h2>
              {response ? <div className="response">{response}</div> : <div className="empty">The model's streamed output will appear here.</div>}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
