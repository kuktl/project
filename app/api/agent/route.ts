import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { command } = (await request.json()) as { command?: string };

    if (!command?.trim()) {
      return Response.json({ error: "Command is required." }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENROUTER_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "You are a browser-control planning agent. Analyze the user's task and return a concise execution plan. Do not claim browser actions were executed; only describe intended actions until tools are connected.",
          },
          { role: "user", content: command.trim() },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const details = await upstream.text();
      console.error("OpenRouter request failed", upstream.status, details);
      return Response.json(
        { error: "OpenRouter request failed." },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const event of events) {
              for (const line of event.split("\n")) {
                if (!line.startsWith("data: ")) continue;

                const data = line.slice(6).trim();
                if (!data || data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data) as {
                    choices?: Array<{ delta?: { content?: string | null } }>;
                  };
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) controller.enqueue(encoder.encode(content));
                } catch {
                  // Ignore incomplete/non-JSON SSE frames.
                }
              }
            }
          }

          controller.close();
        } catch (error) {
          console.error("OpenRouter stream failed", error);
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Agent request failed", error);
    return Response.json({ error: "Agent request failed." }, { status: 500 });
  }
}
