import { NextRequest } from "next/server";
import { OpenRouter } from "@openrouter/sdk";

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

    const openrouter = new OpenRouter({ apiKey });
    const stream = await openrouter.chat.send({
      chatRequest: {
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
      },
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) controller.enqueue(encoder.encode(content));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
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
