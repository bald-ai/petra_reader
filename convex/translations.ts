"use node";

import { TranslationServiceClient } from "@google-cloud/translate";
import { action } from "./_generated/server";
import { v } from "convex/values";

let cachedClient: TranslationServiceClient | null = null;
let cachedParent: string | null = null;

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

  const options: any = {};
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

export const translateParagraph = action({
  args: {
    text: v.string(),
    sourceLanguage: v.optional(v.string()),
    targetLanguage: v.optional(v.string()),
  },
  handler: async (_ctx, { text, sourceLanguage, targetLanguage }) => {
    const content = text.trim();
    if (!content) {
      throw new Error("Cannot translate an empty paragraph.");
    }

    try {
      const parent = await getParent();
      const client = getClient();
      const [response] = await client.translateText({
        parent,
        contents: [content],
        mimeType: "text/plain",
        sourceLanguageCode: sourceLanguage ?? "es",
        targetLanguageCode: targetLanguage ?? "en",
      });

      const translatedText = response.translations?.[0]?.translatedText?.trim();
      if (!translatedText) {
        throw new Error("Google Translate returned no text for this paragraph.");
      }

      return { translatedText };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected translation error.";
      console.error("translateParagraph action failed", error);
      throw new Error(message);
    }
  },
});
