import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { logger } from "../logger";

/**
 * LLM provider boundary. API keys stay on the server; callers pass only
 * prompts that have already been authorized and stripped of personal data.
 * When no provider is configured, `generateText` throws AiUnavailableError and
 * features fall back to deterministic templates.
 */
export class AiUnavailableError extends Error {
  constructor(message = "AI is not configured for this installation.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export type AiRequest = { system: string; prompt: string; maxTokens?: number; effort?: "low" | "medium" | "high" };
export type AiResponse = { text: string; provider: string; model: string };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generate(req: AiRequest): Promise<AiResponse>;
}

let anthropicClient: Anthropic | undefined;

const anthropicProvider = (): AiProvider => {
  const model = env().AI_MODEL || "claude-opus-5-5";
  return {
    name: "anthropic",
    model,
    async generate({ system, prompt, maxTokens = 4000, effort = "medium" }) {
      anthropicClient ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
      // Server-side refusal fallback: a policy decline is retried on a suitable model inside the same call.
      const response = await anthropicClient.beta.messages.create({
        model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort },
        system,
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") throw new AiUnavailableError("The AI declined this request. Try rephrasing it.");
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text, provider: "anthropic", model: response.model };
    },
  };
};

const openAiProvider = (): AiProvider => {
  const model = env().AI_MODEL || "gpt-4.1-mini";
  return {
    name: "openai",
    model,
    async generate({ system, prompt, maxTokens = 4000 }) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env().OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);
      const json = (await res.json()) as { choices: { message: { content: string } }[]; model: string };
      return { text: json.choices[0]?.message.content?.trim() ?? "", provider: "openai", model: json.model };
    },
  };
};

export function aiProvider(): AiProvider | null {
  const config = env();
  if (config.AI_PROVIDER === "anthropic" && config.ANTHROPIC_API_KEY) return anthropicProvider();
  if (config.AI_PROVIDER === "openai" && config.OPENAI_API_KEY) return openAiProvider();
  return null;
}

export function aiStatus() {
  const p = aiProvider();
  return p ? { configured: true as const, provider: p.name, model: p.model } : { configured: false as const, provider: env().AI_PROVIDER, model: null };
}

export async function generateText(req: AiRequest): Promise<AiResponse> {
  const provider = aiProvider();
  if (!provider) throw new AiUnavailableError();
  try {
    return await provider.generate(req);
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    logger.error("AI provider call failed", { provider: provider.name, error });
    throw new AiUnavailableError("The AI service is unavailable right now. A template is shown instead.");
  }
}

/** Shared rules for every school-facing prompt. */
export const SCHOOL_SYSTEM_RULES = `You are an assistant for school staff in India.
Rules you must follow:
- Use only the data provided in the request. If something is not in the data, say it is not available; never invent figures, names or events.
- Data is anonymised. Refer to students only by the labels given (for example "Student 3" or "the student").
- Do not diagnose or label children with psychological, medical, behavioural or learning conditions, and do not speculate about home life. Describe observable school data only (attendance, submissions, marks) and suggest supportive, practical next steps.
- Frame suggestions as suggestions for a teacher to consider, not decisions. Never assign marks, grades or disciplinary outcomes.
- Write in clear, warm, plain English suitable for parents and teachers in Tamil Nadu. Use Indian conventions (₹, lakh, DD Month YYYY dates).`;
