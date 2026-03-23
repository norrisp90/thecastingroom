import { AzureOpenAI } from "openai";
import WebSocket from "ws";

let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;

    if (!endpoint || !apiKey) {
      throw new Error("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required");
    }

    client = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion: "2024-12-01-preview",
    });
  }
  return client;
}

/**
 * Open a WebSocket to Azure OpenAI Realtime API and configure the session.
 * The api-key stays server-side. Backend relays messages between browser and Azure.
 */
export function connectToRealtimeWs(
  model: string,
  voice: string,
  instructions: string
): WebSocket {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required");
  }

  const baseWss = endpoint.replace(/\/$/, "").replace(/^https:/, "wss:");
  const url = `${baseWss}/openai/realtime?api-version=2024-10-01-preview&deployment=${encodeURIComponent(model)}`;

  const ws = new WebSocket(url, {
    headers: { "api-key": apiKey },
  });

  ws.on("open", () => {
    ws.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        voice,
        instructions,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: { type: "server_vad" },
      },
    }));
  });

  return ws;
}

export async function chatCompletion(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string
): Promise<string> {
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 2048,
    temperature: 0.8,
  });

  return response.choices[0]?.message?.content ?? "";
}

export async function* chatCompletionStream(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string
): AsyncGenerator<string> {
  const openai = getClient();

  const stream = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 2048,
    temperature: 0.8,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}
