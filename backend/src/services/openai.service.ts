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
