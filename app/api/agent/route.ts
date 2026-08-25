import { NextRequest } from "next/server";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-5.5";

function errorMessage(status: number, raw: string) {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    const value = parsed.error;
    if (typeof value === "string") return value;
    if (value?.message) return value.message;
  } catch {
    // Keep the raw response when it is not JSON.
  }
  return raw || `OpenRouter returned HTTP ${status}.`;
}

export async function POST(request: NextRequest) {
  try {
    const { command } = (await request.json()) as { command?: string };

    if (!command?.trim()) {
      return Response.json({ error: "Command is required." }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return Response.json(
        { error: "OPENROUTER_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://project.vercel.app",
        "X-Title": "Browser Agent",
      },
      body: JSON.stringify({
        model: MODEL,
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
      const message = errorMessage(upstream.status, details);
      console.error("OpenRouter request failed", {
        status: upstream.status,
        message,
      });
      return Response.json(
        { error: `OpenRouter error (${upstream.status}): ${message}` },
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
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() ?? "";

            for (const event of events) {
              for (const line of event.split(/\r?\n/)) {
                if (!line.startsWith("data:")) continue;

                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data) as {
                    choices?: Array<{ delta?: { content?: string | null } }>;
                    error?: { message?: string };
                  };

                  if (parsed.error?.message) {
                    controller.enqueue(
                      encoder.encode(`OpenRouter error: ${parsed.error.message}`),
                    );
                    continue;
                  }

                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) controller.enqueue(encoder.encode(content));
                } catch {
                  // Ignore malformed/incomplete SSE frames.
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
      },
    });
  } catch (error) {
    console.error("Agent request failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Agent request failed." },
      { status: 500 },
    );
  }
}
