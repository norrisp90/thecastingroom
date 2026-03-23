import { AzureOpenAI } from "openai";

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
 * Create an ephemeral Realtime API token via Azure OpenAI REST API.
 * The API key stays server-side; the browser gets a short-lived token.
 */
export async function createRealtimeToken(
  model: string,
  voice: string,
  instructions: string
): Promise<{ token: string; endpoint: string; expiresAt: string }> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!endpoint || !apiKey) {
    throw new Error("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required");
  }

  const baseUrl = endpoint.replace(/\/$/, "");
  const url = `${baseUrl}/openai/realtimeSessions?api-version=2025-04-01-preview`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      instructions,
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: { type: "server_vad" },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Realtime session creation failed (${res.status}): ${errorBody}`);
  }

  const data = await res.json() as { id?: string; client_secret?: { value?: string; expires_at?: number } };
  return {
    token: data.client_secret?.value ?? data.id ?? "",
    endpoint: baseUrl,
    expiresAt: data.client_secret?.expires_at
      ? new Date(data.client_secret.expires_at * 1000).toISOString()
      : new Date(Date.now() + 60_000).toISOString(),
  };
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
