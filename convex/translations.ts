"use node";

import { TranslationServiceClient } from "@google-cloud/translate";
import { action } from "./_generated/server";
import { v } from "convex/values";

let cachedClient: TranslationServiceClient | null = null;
let cachedParent: string | null = null;

const DEFAULT_SOURCE_LANGUAGE = "es";
const DEFAULT_TARGET_LANGUAGE = "en";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const CONJUGATION_TENSES = ["present", "preterite", "imperfect", "conditional", "future"] as const;
type ConjugationTense = (typeof CONJUGATION_TENSES)[number];
type ConjugationResponse = Record<
  ConjugationTense,
  Array<{
    pronoun: string;
    form: string;
  }>
>;

const projectIdEnvKeys = [
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_PROJECT_ID",
  "GCLOUD_PROJECT",
  "PROJECT_ID",
] as const;

function getClient(): TranslationServiceClient {
  if (cachedClient) {
    return cachedClient;
  }

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GOOGLE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    process.env.PROJECT_ID;

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  let credentials;
  
  if (credentialsJson) {
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (error) {
      console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", error);
    }
  }

  const options: ConstructorParameters<typeof TranslationServiceClient>[0] = {};
  if (projectId && projectId.trim().length > 0) {
    options.projectId = projectId.trim();
  }
  if (credentials) {
    options.credentials = credentials;
  }

  cachedClient = new TranslationServiceClient(options);
  return cachedClient;
}

function createEmptyConjugations(): ConjugationResponse {
  return CONJUGATION_TENSES.reduce((acc, tense) => {
    acc[tense] = [];
    return acc;
  }, {} as ConjugationResponse);
}

async function resolveProjectId(): Promise<string | null> {
  for (const key of projectIdEnvKeys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  try {
    const client = getClient();
    return await client.getProjectId();
  } catch (error) {
    console.error("Failed to auto-detect Google Cloud project ID", error);
    return null;
  }
}

async function getParent(): Promise<string> {
  if (cachedParent) {
    return cachedParent;
  }

  const projectId = await resolveProjectId();
  if (!projectId) {
    throw new Error(
      "Google Translate client is missing a project ID. Set GOOGLE_CLOUD_PROJECT (or GOOGLE_PROJECT_ID/GCLOUD_PROJECT) or ensure the service-account JSON has a project_id.",
    );
  }

  cachedParent = `projects/${projectId}/locations/global`;
  return cachedParent;
}

async function translateWithGoogle(
  text: string,
  sourceLanguage?: string,
  targetLanguage?: string,
): Promise<string> {
  const content = text.trim();
  if (!content) {
    throw new Error("Cannot translate an empty string.");
  }

  const parent = await getParent();
  const client = getClient();
  const [response] = await client.translateText({
    parent,
    contents: [content],
    mimeType: "text/plain",
    sourceLanguageCode: (sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE).toLowerCase(),
    targetLanguageCode: (targetLanguage ?? DEFAULT_TARGET_LANGUAGE).toLowerCase(),
  });

  const translatedText = response.translations?.[0]?.translatedText?.trim();
  if (!translatedText) {
    throw new Error("Google Translate returned no text.");
  }

  return translatedText;
}


export const translateParagraph = action({
  args: {
    text: v.string(),
    sourceLanguage: v.optional(v.string()),
    targetLanguage: v.optional(v.string()),
  },
  handler: async (_ctx, { text, sourceLanguage, targetLanguage }) => {
    try {
      const translatedText = await translateWithGoogle(text, sourceLanguage, targetLanguage);
      return { translatedText };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected translation error.";
      console.error("translateParagraph action failed", error);
      throw new Error(message);
    }
  },
});

export const translateWord = action({
  args: {
    word: v.string(),
    sourceLanguage: v.optional(v.string()),
    targetLanguage: v.optional(v.string()),
  },
  handler: async (_ctx, { word, sourceLanguage, targetLanguage }) => {
    const text = word.trim();
    if (!text) {
      throw new Error("Cannot translate an empty word.");
    }

    const googleLanguage = sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE;
    const googleTarget = targetLanguage ?? DEFAULT_TARGET_LANGUAGE;

    try {
      const translation = await translateWithGoogle(text, googleLanguage, googleTarget);
      return {
        word: text,
        translation,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Translation failed for this word.";
      throw new Error(errorMessage);
    }
  },
});

function buildOpenRouterHeaders(apiKey: string) {
  const referer = process.env.OPENROUTER_REFERRER ?? "http://localhost";
  const title = process.env.OPENROUTER_TITLE ?? "Petra Reader";

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": title,
  };
}

export const lookupWordDefinition = action({
  args: {
    word: v.string(),
    sentence: v.optional(v.string()),
  },
  handler: async (_ctx, { word, sentence }) => {
    const text = word.trim();
    if (!text) {
      throw new Error("Cannot lookup an empty word.");
    }

    const contextSentence = sentence?.trim();

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
    }

    const MODEL = "openai/gpt-5.1";
    const LANGUAGE = "spanish";

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: buildOpenRouterHeaders(apiKey),
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: "You are a language dictionary API. Respond only with valid JSON.",
            },
            contextSentence
              ? {
                  role: "user",
                  content: `Given the sentence: "${contextSentence}", provide the definition for the target word "${text}" as it is used in that sentence. The definition must be in ${LANGUAGE}, written in simple, clear language suitable for a learner. Return as JSON with keys: "word", "definition". Do not include any other keys.`,
                }
              : {
                  role: "user",
                  content: `Provide the definition for the word "${text}" in ${LANGUAGE}. The definition must be in ${LANGUAGE}, written in simple, clear language suitable for a learner. Return as JSON with keys: "word", "definition". Do not include any other keys.`,
                },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 0,
          reasoning: {
            effort: "none",
          },
          include_reasoning: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`API Error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content received from API");
      }

      const parsed = JSON.parse(content);
      return {
        word: parsed.word || text,
        definition: parsed.definition || "",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to lookup word definition.";
      throw new Error(errorMessage);
    }
  },
});

export const lookupWordType = action({
  args: {
    word: v.string(),
    sentence: v.optional(v.string()),
  },
  handler: async (_ctx, { word, sentence }) => {
    const text = word.trim();
    if (!text) {
      throw new Error("Cannot lookup an empty word.");
    }

    const contextSentence = sentence?.trim();

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
    }

    const MODEL = "google/gemini-2.5-flash";
    const LANGUAGE = "spanish";

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: buildOpenRouterHeaders(apiKey),
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You are a language part-of-speech API. Respond only with valid JSON containing the part of speech in English (noun, verb, adjective, etc.).",
            },
            contextSentence
              ? {
                  role: "user",
                  content: `Given the sentence: "${contextSentence}", return only the part of speech (noun, verb, adjective, etc.) for the target word "${text}" as it is used in that sentence. Return JSON: {"word":"${text}","type":"<english part of speech>"} and nothing else.`,
                }
              : {
                  role: "user",
                  content: `Return only the part of speech (noun, verb, adjective, etc.) for the word "${text}" in ${LANGUAGE}. Return JSON: {"word":"${text}","type":"<english part of speech>"} and nothing else.`,
                },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 0,
          reasoning: {
            max_tokens: 0,
          },
          include_reasoning: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`API Error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content received from API");
      }

      const parsed = JSON.parse(content);
      return {
        word: parsed.word || text,
        type: parsed.type || "",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to lookup word type.";
      throw new Error(errorMessage);
    }
  },
});

export const lookupVerbConjugations = action({
  args: {
    word: v.string(),
  },
  handler: async (_ctx, { word }) => {
    const text = word.trim();
    if (!text) {
      throw new Error("Cannot conjugate an empty word.");
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
    }

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: buildOpenRouterHeaders(apiKey),
        body: JSON.stringify({
          model: "openai/gpt-5.1",
          messages: [
            {
              role: "system",
              content:
                "You are a Spanish verb conjugation API. Respond only with valid JSON that matches the requested shape.",
            },
            {
              role: "user",
              content: `Provide Spanish conjugations for the verb "${text}" in these tenses: ${CONJUGATION_TENSES.join(
                ", ",
              )}. Use the pronouns: yo, tú, él/ella/usted, nosotros/nosotras, vosotros/vosotras, ellos/ellas/ustedes. Return a JSON object where each tense key maps to an array of objects with "pronoun" and "form" (no extra text). If the word is not a verb, respond with {"error":"not a verb"}.`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 0,
          include_reasoning: false,
          reasoning: {
            effort: "none",
          },
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`API Error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content received from API");
      }

      const parsed = JSON.parse(content);
      if (parsed?.error) {
        throw new Error("This word cannot be conjugated.");
      }

      const conjugations = createEmptyConjugations();

      for (const tense of CONJUGATION_TENSES) {
        const value = parsed?.[tense];
        if (!value) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry && typeof entry === "object" && "pronoun" in entry && "form" in entry) {
              const pronoun = typeof entry.pronoun === "string" ? entry.pronoun.trim() : "";
              const form = typeof entry.form === "string" ? entry.form.trim() : "";
              if (pronoun && form) {
                conjugations[tense].push({ pronoun, form });
              }
            } else if (Array.isArray(entry) && entry.length >= 2) {
              const [pronoun, form] = entry;
              if (typeof pronoun === "string" && typeof form === "string") {
                conjugations[tense].push({ pronoun: pronoun.trim(), form: form.trim() });
              }
            }
          }
        } else if (value && typeof value === "object") {
          for (const [pronoun, form] of Object.entries(value)) {
            if (typeof form === "string" && form.trim()) {
              conjugations[tense].push({ pronoun, form: form.trim() });
            }
          }
        }
      }

      return { conjugations };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to lookup verb conjugations.";
      throw new Error(errorMessage);
    }
  },
});
