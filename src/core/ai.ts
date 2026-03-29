/**
 * AI Abstraction — WebWaka Real Estate Suite
 *
 * Invariant 7: Vendor Neutral AI
 * ALL AI calls go through OpenRouter. NEVER import OpenAI, Anthropic, or Google SDKs directly.
 * Model selection is configuration-driven, not hardcoded.
 *
 * Use cases:
 * - Property description generation
 * - Valuation commentary
 * - Tenancy agreement drafting
 * - Market analysis summaries
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionParams {
  messages: AIMessage[];
  model?: string; // defaults to a cost-effective model via OpenRouter
  maxTokens?: number;
  temperature?: number;
}

export interface AICompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const DEFAULT_MODEL = 'google/gemini-flash-1.5'; // Cost-effective, fast, Africa-aware

/**
 * Call the AI via OpenRouter (vendor-neutral).
 * @param apiKey — OpenRouter API key from environment
 * @param params — completion parameters
 */
export async function aiComplete(
  apiKey: string,
  params: AICompletionParams
): Promise<AICompletionResponse> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://webwaka.com',
      'X-Title': 'WebWaka Real Estate Suite',
    },
    body: JSON.stringify({
      model: params.model ?? DEFAULT_MODEL,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter AI call failed: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? '',
    model: data.model,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
}

/**
 * Generate a professional property description using AI.
 * @param apiKey — OpenRouter API key
 * @param propertyDetails — key property attributes
 */
export async function generatePropertyDescription(
  apiKey: string,
  propertyDetails: {
    type: string;
    listingType: string;
    bedrooms?: number;
    bathrooms?: number;
    location: string;
    state: string;
    priceFormatted: string;
    features?: string[];
  }
): Promise<string> {
  const result = await aiComplete(apiKey, {
    messages: [
      {
        role: 'system',
        content: 'You are a professional Nigerian real estate copywriter. Write compelling, accurate property descriptions for the Nigerian market. Be concise (max 150 words). Use Nigerian real estate terminology.',
      },
      {
        role: 'user',
        content: `Write a property description for: ${JSON.stringify(propertyDetails)}`,
      },
    ],
    maxTokens: 256,
    temperature: 0.8,
  });
  return result.content;
}
