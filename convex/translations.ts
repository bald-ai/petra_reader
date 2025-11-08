"use node";

import { TranslationServiceClient } from "@google-cloud/translate";
import { action } from "./_generated/server";
import { v } from "convex/values";

let cachedClient: TranslationServiceClient | null = null;
let cachedParent: string | null = null;

const DEFAULT_SOURCE_LANGUAGE = "es";
const DEFAULT_TARGET_LANGUAGE = "en";

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

export const lookupWordDefinition = action({
  args: {
    word: v.string(),
  },
  handler: async (_ctx, { word }) => {
    const text = word.trim();
    if (!text) {
      throw new Error("Cannot lookup an empty word.");
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
    }

    const API_URL = "https://openrouter.ai/api/v1/chat/completions";
    const MODEL = "x-ai/grok-4-fast";
    const LANGUAGE = "spanish";

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: "You are a language dictionary API. Respond only with valid JSON.",
            },
            {
              role: "user",
              content: `Provide the definition and word type (noun, verb, adjective, etc.) for the word "${text}" in ${LANGUAGE}. The definition must be in ${LANGUAGE}. Return as JSON with keys: "word", "definition", "type".`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
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
        definition: parsed.definition || "",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to lookup word definition.";
      throw new Error(errorMessage);
    }
  },
});
