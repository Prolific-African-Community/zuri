/**
 * The single OpenAI touchpoint in Zuri. Only ever imported from Server Actions,
 * so the key never reaches the client. One endpoint, no SDK.
 * Everything it needs is passed in; it owns no database access.
 */

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_OPPORTUNITIES = 5;

export const OPPORTUNITY_SOURCES = [
  "MANUAL",
  "OBSERVATION",
  "SIGNAL",
  "COMPETITOR",
] as const;

export type GeneratedOpportunity = {
  title: string;
  description: string;
  source: (typeof OPPORTUNITY_SOURCES)[number];
  score: number;
  rationale: string;
};

export type BrandContext = {
  brandName: string;
  profile: {
    mission: string;
    manifesto: string;
    positioning: string;
    valueProposition: string;
    voiceDescription: string;
    language: string;
  } | null;
  audiences: {
    name: string;
    description: string;
    pains: string[];
    motivations: string[];
    objections: string[];
    vocabulary: string[];
  }[];
  voiceRules: { type: string; rule: string }[];
  observations: string[];
  marketSignals: { title: string; summary: string; type: string }[];
  existingOpportunityTitles: string[];
};

export function openAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

/** True when the context carries something worth reasoning about. */
export function hasSourceMaterial(context: BrandContext) {
  return Boolean(
    context.profile?.mission ||
      context.audiences.length ||
      context.observations.length ||
      context.marketSignals.length,
  );
}

const SYSTEM_PROMPT = [
  "You are a growth strategist working inside Zuri, a multi-brand Growth OS.",
  "You are given one brand's own recorded knowledge: its profile, audiences, voice rules,",
  "recent internal observations, and recent market signals.",
  "",
  `Propose at most ${MAX_OPPORTUNITIES} distinct content or positioning opportunities for that brand.`,
  "Ground every opportunity in the supplied material — never invent facts, metrics, competitors or events.",
  "If the material is thin, return fewer opportunities rather than padding the list.",
  "",
  "Set `source` to where the opportunity mainly comes from:",
  "OBSERVATION for an internal observation, SIGNAL for a market signal,",
  "COMPETITOR for competitive positioning, MANUAL for anything drawn from the brand profile itself.",
  "",
  "`score` is an integer from 0 to 100 combining, in equal parts:",
  "relevance to the brand, audience fit, business value, originality, and timing.",
  "Use the whole range; a weak idea should score low.",
  "",
  "`rationale` is one short sentence explaining the score.",
  "Respect the brand's voice rules. Do not repeat opportunities that already exist.",
].join("\n");

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    opportunities: {
      type: "array",
      maxItems: MAX_OPPORTUNITIES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          source: { type: "string", enum: OPPORTUNITY_SOURCES },
          score: { type: "integer", minimum: 0, maximum: 100 },
          rationale: { type: "string" },
        },
        required: ["title", "description", "source", "score", "rationale"],
      },
    },
  },
  required: ["opportunities"],
} as const;

function isGenerated(value: unknown): value is GeneratedOpportunity {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    typeof item.description === "string" &&
    typeof item.rationale === "string" &&
    typeof item.source === "string" &&
    (OPPORTUNITY_SOURCES as readonly string[]).includes(item.source) &&
    typeof item.score === "number" &&
    Number.isFinite(item.score)
  );
}

/** The one HTTP call. Both generators go through here. */
async function callOpenAi(
  systemPrompt: string,
  context: unknown,
  schemaName: string,
  schema: unknown,
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env to generate.");
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel(),
      // No explicit temperature: some models only accept their default.
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context, null, 2) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Log the provider payload server-side; surface only a short summary so
    // nothing from the raw response ends up in the UI.
    console.error("OpenAI request failed", response.status, detail);
    let reason = "";
    try {
      reason = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      reason = "";
    }
    throw new Error(
      `OpenAI request failed (${response.status}).${reason ? ` ${reason.slice(0, 120)}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response.");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned malformed JSON.");
  }
}

export async function generateOpportunities(
  context: BrandContext,
): Promise<GeneratedOpportunity[]> {
  const parsed = await callOpenAi(
    SYSTEM_PROMPT,
    context,
    "opportunities",
    RESPONSE_SCHEMA,
  );

  const list = (parsed as { opportunities?: unknown }).opportunities;
  if (!Array.isArray(list)) throw new Error("OpenAI returned an unexpected shape.");

  return list
    .filter(isGenerated)
    .slice(0, MAX_OPPORTUNITIES)
    .map((item) => ({
      ...item,
      title: item.title.trim(),
      description: item.description.trim(),
      rationale: item.rationale.trim(),
      score: Math.min(100, Math.max(0, Math.round(item.score))),
    }));
}

/* -------------------------------------------------------------------------- */
/* LinkedIn drafts                                                            */
/* -------------------------------------------------------------------------- */

const MAX_DRAFTS = 3;

export type GeneratedDraft = {
  content: string;
  angle: string;
  whyItWorks: string;
};

export type DraftContext = {
  brandName: string;
  opportunity: {
    title: string;
    description: string;
    rationale: string | null;
  };
  profile: BrandContext["profile"];
  audiences: BrandContext["audiences"];
  voiceRules: BrandContext["voiceRules"];
  goldenExamples: { title: string | null; content: string; notes: string | null }[];
  recentDrafts: { title: string | null; content: string }[];
};

const DRAFT_SYSTEM_PROMPT = [
  "You write LinkedIn posts for one brand inside Zuri, a multi-brand Growth OS.",
  "You are given the brand's profile, audiences, voice rules, golden examples,",
  "recently generated drafts, and one opportunity to write about.",
  "",
  `Write exactly ${MAX_DRAFTS} drafts for that opportunity, and make them genuinely different.`,
  "Vary the hook, the structure, the tone, the length and the ending across the three.",
  "One should be short and blunt; the others should not converge on the same shape.",
  "",
  "Always start from the concrete problem, in natural spoken language.",
  "Never force a call to action. Never sign off with the brand name or a tagline unless",
  "the post genuinely earns it. No generic marketing copy, no engagement-bait questions,",
  "no buzzword stacking.",
  "",
  "Obey the brand's voice rules. Treat the golden examples as tone reference, not as text",
  "to reuse: do not repeat their phrasing unless you are deliberately calling back to it.",
  "Do not repeat hooks or phrasing from the recent drafts supplied.",
  "",
  "For each draft also return `angle` (a few words naming the approach) and",
  "`whyItWorks` (one short sentence).",
].join("\n");

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    drafts: {
      type: "array",
      maxItems: MAX_DRAFTS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: { type: "string" },
          angle: { type: "string" },
          whyItWorks: { type: "string" },
        },
        required: ["content", "angle", "whyItWorks"],
      },
    },
  },
  required: ["drafts"],
} as const;

function isDraft(value: unknown): value is GeneratedDraft {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.content === "string" &&
    item.content.trim().length > 0 &&
    typeof item.angle === "string" &&
    typeof item.whyItWorks === "string"
  );
}

export async function generateLinkedInDrafts(
  context: DraftContext,
): Promise<GeneratedDraft[]> {
  const parsed = await callOpenAi(
    DRAFT_SYSTEM_PROMPT,
    context,
    "linkedin_drafts",
    DRAFT_SCHEMA,
  );

  const list = (parsed as { drafts?: unknown }).drafts;
  if (!Array.isArray(list)) throw new Error("OpenAI returned an unexpected shape.");

  return list
    .filter(isDraft)
    .slice(0, MAX_DRAFTS)
    .map((item) => ({
      content: item.content.trim(),
      angle: item.angle.trim(),
      whyItWorks: item.whyItWorks.trim(),
    }));
}

/* -------------------------------------------------------------------------- */
/* Visual recommendation                                                      */
/* -------------------------------------------------------------------------- */

const VISUAL_TYPES = ["NONE", "STATEMENT", "FAKE_DOCUMENT", "EDITORIAL"] as const;

export type VisualSuggestion = {
  type: (typeof VISUAL_TYPES)[number];
  reason: string;
  concept: string;
  imagePrompt: string;
};

export type VisualContext = {
  brandName: string;
  post: string;
  profile: BrandContext["profile"];
  voiceRules: BrandContext["voiceRules"];
  opportunity: { title: string; description: string } | null;
};

const VISUAL_SYSTEM_PROMPT = [
  "You decide whether a LinkedIn post needs a visual, and if so which kind.",
  "You are given the post, the brand profile, its voice rules and the opportunity behind it.",
  "",
  "Choose one `type`:",
  "NONE — the words carry the post on their own. This is a legitimate and common answer.",
  "STATEMENT — a single short line of text set as a graphic.",
  "FAKE_DOCUMENT — a plausible mock artefact (a spreadsheet tab, a file list, a report fragment).",
  "EDITORIAL — a quiet conceptual image with no text.",
  "",
  "Never invent a reason to add a visual. If it would only decorate, answer NONE.",
  "",
  "`reason` is one short sentence on why that type fits this post.",
  "`concept` describes what the image shows, in one or two sentences.",
  "`imagePrompt` is the prompt to render it. It must ask for a calm, restrained,",
  "editorial composition with generous negative space, and must avoid stock-photo",
  "and generic SaaS illustration styles: no smiling office workers, no 3D blobs,",
  "no floating UI cards, no gradient mesh backgrounds, no icons of lightbulbs or rockets.",
  "For EDITORIAL the prompt must explicitly forbid any text or lettering in the image.",
  "For STATEMENT and FAKE_DOCUMENT the prompt must state the exact text to render, kept short.",
  "When `type` is NONE, return an empty string for `concept` and `imagePrompt`.",
].join("\n");

const VISUAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: VISUAL_TYPES },
    reason: { type: "string" },
    concept: { type: "string" },
    imagePrompt: { type: "string" },
  },
  required: ["type", "reason", "concept", "imagePrompt"],
} as const;

export async function suggestVisual(
  context: VisualContext,
): Promise<VisualSuggestion> {
  const parsed = (await callOpenAi(
    VISUAL_SYSTEM_PROMPT,
    context,
    "visual_suggestion",
    VISUAL_SCHEMA,
  )) as Record<string, unknown>;

  const type = String(parsed.type ?? "NONE");
  if (!(VISUAL_TYPES as readonly string[]).includes(type)) {
    throw new Error("OpenAI returned an unknown visual type.");
  }

  return {
    type: type as VisualSuggestion["type"],
    reason: String(parsed.reason ?? "").trim(),
    concept: String(parsed.concept ?? "").trim(),
    imagePrompt: String(parsed.imagePrompt ?? "").trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* Image generation                                                           */
/* -------------------------------------------------------------------------- */

const IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

export function openAiImageModel() {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

/** Renders one image and returns raw PNG bytes. */
export async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const response = await fetch(IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: openAiImageModel(),
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("OpenAI image request failed", response.status, detail);
    let reason = "";
    try {
      reason = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      reason = "";
    }
    throw new Error(
      `Image generation failed (${response.status}).${reason ? ` ${reason.slice(0, 120)}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = payload.data?.[0];

  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");

  if (first?.url) {
    const image = await fetch(first.url);
    if (!image.ok) throw new Error("Could not download the generated image.");
    return Buffer.from(await image.arrayBuffer());
  }

  throw new Error("OpenAI returned no image.");
}
