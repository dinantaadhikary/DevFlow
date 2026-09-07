import crypto from "crypto";
import { cacheGetOrSet } from "../config/redis";
import { query } from "../config/db";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

type AiFeature =
  | "code_explanation"
  | "readme_generation"
  | "documentation"
  | "test_generation"
  | "pr_summary";

const SYSTEM_PROMPTS: Record<AiFeature, string> = {
  code_explanation:
    "You are a senior engineer explaining code to a teammate. Be precise, note edge cases and complexity, and avoid restating the code line-by-line.",

  readme_generation:
    "You generate clear, professional README.md files for software projects: purpose, setup, usage, and structure.",

  documentation:
    "You write concise technical documentation (docstrings/API docs) matching the surrounding code's style and language conventions.",

  test_generation:
    "You write thorough, idiomatic unit tests for the given code, covering edge cases, using the project's apparent testing framework if inferable.",

  pr_summary:
    "You summarize a pull request diff for reviewers: what changed, why, risk areas, and anything that needs closer review. Be concise and skimmable.",
};

async function callGroq(
  system: string,
  userContent: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error (${res.status}): ${text}`);
  }

  const data: any = await res.json();

  return data.choices?.[0]?.message?.content ?? "";
}

function hashInput(feature: AiFeature, input: string): string {
  return crypto
    .createHash("sha256")
    .update(`${feature}:${input}`)
    .digest("hex");
}

export async function runAiFeature(params: {
  feature: AiFeature;
  input: string;
  userId: string;
  projectId?: string;
  ttlSeconds?: number;
}): Promise<{ result: string; cached: boolean }> {
  const {
    feature,
    input,
    userId,
    projectId,
    ttlSeconds = 3600,
  } = params;

  const inputHash = hashInput(feature, input);
  const cacheKey = `ai:${feature}:${inputHash}`;

  let wasCached = true;

  const result = await cacheGetOrSet(
    cacheKey,
    ttlSeconds,
    async () => {
      wasCached = false;
      return callGroq(SYSTEM_PROMPTS[feature], input);
    }
  );

  await query(
    `INSERT INTO ai_requests (user_id, project_id, feature, input_hash)
     VALUES ($1, $2, $3, $4)`,
    [userId, projectId ?? null, feature, inputHash]
  );

  return {
    result,
    cached: wasCached,
  };
}

export const AiService = {
  explainCode: (
    code: string,
    userId: string,
    projectId?: string
  ) =>
    runAiFeature({
      feature: "code_explanation",
      input: code,
      userId,
      projectId,
    }),

  generateReadme: (
    projectContext: string,
    userId: string,
    projectId?: string
  ) =>
    runAiFeature({
      feature: "readme_generation",
      input: projectContext,
      userId,
      projectId,
    }),

  generateDocs: (
    code: string,
    userId: string,
    projectId?: string
  ) =>
    runAiFeature({
      feature: "documentation",
      input: code,
      userId,
      projectId,
    }),

  generateTests: (
    code: string,
    userId: string,
    projectId?: string
  ) =>
    runAiFeature({
      feature: "test_generation",
      input: code,
      userId,
      projectId,
    }),

  summarizePr: (
    diff: string,
    userId: string,
    projectId?: string
  ) =>
    runAiFeature({
      feature: "pr_summary",
      input: diff,
      userId,
      projectId,
      ttlSeconds: 900,
    }),
};