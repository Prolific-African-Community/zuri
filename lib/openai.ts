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
  /** BrandProfile.language, restated so the model cannot miss it. */
  outputLanguage: string;
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

/**
 * Output language is a brand setting, not something to guess. Without this the
 * model copies the language of whatever material it is shown, so a brand that
 * switches language keeps producing the old one.
 */
const LANGUAGE_RULE = [
  "LANGUAGE — this overrides everything below.",
  "Write every field of every item in the language named by `outputLanguage`.",
  "That setting is the brand's current choice and it wins. Never infer the",
  "language from the supplied profile, pages, keywords, existing opportunities",
  "or past content, even when all of them are in another language. Mixed-language",
  "output is a failure: if one item is in another language, the answer is wrong.",
  "",
].join("\n");

const SYSTEM_PROMPT = [
  LANGUAGE_RULE,
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
export async function generateImage(
  prompt: string,
  size: "1024x1024" | "1536x1024" = "1024x1024",
): Promise<Buffer> {
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
      size,
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

/* -------------------------------------------------------------------------- */
/* Seed keywords                                                              */
/* -------------------------------------------------------------------------- */

const MAX_SEED_KEYWORDS = 10;

export type SeedKeywordContext = {
  brandName: string;
  profile: BrandContext["profile"];
  pages: { url: string; title: string | null; h1: string | null }[];
  competitors: { name: string; websiteUrl: string }[];
};

const SEED_SYSTEM_PROMPT = [
  "You propose seed search keywords for one brand, to be sent to a keyword research API.",
  "You are given the brand profile, the pages of its own website, and its competitors.",
  "",
  `Return at most ${MAX_SEED_KEYWORDS} keywords.`,
  "Each must be a realistic search query a human would type, in lowercase, 2 to 5 words.",
  "Stay close to what the brand actually does — no invented products, no brand names",
  "other than ones that appear in the supplied material.",
  "Mix intents: some describing the service, some describing the problem it solves.",
  "Do not return duplicates or near-duplicates of each other.",
].join("\n");

const SEED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    keywords: {
      type: "array",
      maxItems: MAX_SEED_KEYWORDS,
      items: { type: "string" },
    },
  },
  required: ["keywords"],
} as const;

export async function generateSeedKeywords(
  context: SeedKeywordContext,
): Promise<string[]> {
  const parsed = await callOpenAi(
    SEED_SYSTEM_PROMPT,
    context,
    "seed_keywords",
    SEED_SCHEMA,
  );

  const list = (parsed as { keywords?: unknown }).keywords;
  if (!Array.isArray(list)) throw new Error("OpenAI returned an unexpected shape.");

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const keyword = item.trim().toLowerCase();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }

  return keywords.slice(0, MAX_SEED_KEYWORDS);
}

/* -------------------------------------------------------------------------- */
/* SEO opportunities                                                          */
/* -------------------------------------------------------------------------- */

const SEO_ACTION_TYPES = [
  "CREATE_PAGE",
  "REFRESH_PAGE",
  "TECHNICAL_FIX",
  "INTERNAL_LINK",
] as const;

export type GeneratedSeoOpportunity = {
  title: string;
  description: string;
  actionType: (typeof SEO_ACTION_TYPES)[number];
  targetUrl: string;
  targetKeyword: string;
  score: number;
  rationale: string;
};

export type SeoContext = {
  brandName: string;
  outputLanguage: string;
  profile: BrandContext["profile"];
  pages: {
    url: string;
    title: string | null;
    metaDescription: string | null;
    h1: string | null;
    statusCode: number | null;
    wordCount: number | null;
  }[];
  keywords: {
    keyword: string;
    searchVolume: number | null;
    difficulty: number | null;
    intent: string | null;
    priorityScore: number | null;
    serp: { position: number; domain: string; url: string | null }[];
  }[];
  competitors: { name: string; websiteUrl: string }[];
  existingOpportunityTitles: string[];
};

const SEO_SYSTEM_PROMPT = [
  LANGUAGE_RULE,
  "You turn one brand's own SEO data into concrete, actionable opportunities.",
  "You are given its profile, every page crawled on its site, its researched keywords",
  "with live SERP results, and its competitors.",
  "",
  `Return at most ${MAX_OPPORTUNITIES} opportunities. Fewer is better than padded.`,
  "",
  "Priorities, in this order:",
  "1. Existing pages already close to page one — small moves with real upside.",
  "2. Genuine commercial gaps: a keyword with business intent the site does not answer.",
  "3. Prefer REFRESH_PAGE over CREATE_PAGE whenever a relevant page already exists.",
  "4. TECHNICAL_FIX for real defects visible in the crawl (missing title, missing",
  "   meta description, missing H1, non-200 status, duplicate titles).",
  "5. INTERNAL_LINK when an existing page could pass relevance to another.",
  "",
  "Never propose a generic blog article with no business intent behind it.",
  "Ground everything in the supplied data: only reference URLs that appear in the",
  "pages list, and only keywords that appear in the keywords list.",
  "",
  "`targetUrl` is the page acted on — use an empty string when creating something new.",
  "`targetKeyword` is the keyword driving it — empty string if none applies.",
  "`score` is an integer 0–100 weighing business value, effort and how close the",
  "current position already is. `rationale` is one short sentence.",
  "Do not repeat opportunities that already exist.",
].join("\n");

const SEO_SCHEMA = {
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
          actionType: { type: "string", enum: SEO_ACTION_TYPES },
          targetUrl: { type: "string" },
          targetKeyword: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          rationale: { type: "string" },
        },
        required: [
          "title",
          "description",
          "actionType",
          "targetUrl",
          "targetKeyword",
          "score",
          "rationale",
        ],
      },
    },
  },
  required: ["opportunities"],
} as const;

function isSeoOpportunity(value: unknown): value is GeneratedSeoOpportunity {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === "string" &&
    item.title.trim().length > 0 &&
    typeof item.description === "string" &&
    typeof item.rationale === "string" &&
    typeof item.targetUrl === "string" &&
    typeof item.targetKeyword === "string" &&
    typeof item.actionType === "string" &&
    (SEO_ACTION_TYPES as readonly string[]).includes(item.actionType) &&
    typeof item.score === "number" &&
    Number.isFinite(item.score)
  );
}

export async function generateSeoOpportunities(
  context: SeoContext,
): Promise<GeneratedSeoOpportunity[]> {
  const parsed = await callOpenAi(
    SEO_SYSTEM_PROMPT,
    context,
    "seo_opportunities",
    SEO_SCHEMA,
  );

  const list = (parsed as { opportunities?: unknown }).opportunities;
  if (!Array.isArray(list)) throw new Error("OpenAI returned an unexpected shape.");

  return list
    .filter(isSeoOpportunity)
    .slice(0, MAX_OPPORTUNITIES)
    .map((item) => ({
      ...item,
      title: item.title.trim(),
      description: item.description.trim(),
      rationale: item.rationale.trim(),
      targetUrl: item.targetUrl.trim(),
      targetKeyword: item.targetKeyword.trim(),
      score: Math.min(100, Math.max(0, Math.round(item.score))),
    }));
}

/* -------------------------------------------------------------------------- */
/* SEO brief                                                                  */
/* -------------------------------------------------------------------------- */

export type GeneratedSeoBrief = {
  objective: string;
  targetKeyword: string;
  searchIntent: string;
  recommendedAction: (typeof SEO_ACTION_TYPES)[number];
  actionJustification: string;
  recommendedTitle: string;
  recommendedMetaDescription: string;
  outline: string[];
  keyQuestions: string[];
  internalLinks: string[];
  competitorInsights: string[];
  evidenceNeeded: string[];
};

export type SeoBriefContext = {
  brandName: string;
  opportunity: {
    title: string;
    description: string;
    rationale: string | null;
    actionType: string | null;
    targetUrl: string | null;
    targetKeyword: string | null;
    score: number | null;
  };
  profile: BrandContext["profile"];
  targetPage: {
    url: string;
    title: string | null;
    metaDescription: string | null;
    h1: string | null;
    wordCount: number | null;
  } | null;
  keyword: {
    keyword: string;
    searchVolume: number | null;
    difficulty: number | null;
    intent: string | null;
  } | null;
  serpCompetitors: {
    position: number;
    domain: string;
    url: string | null;
    title: string | null;
  }[];
  sitePages: { url: string; title: string | null }[];
};

const BRIEF_SYSTEM_PROMPT = [
  "You write a tight SEO brief for one opportunity. A brief, not the article:",
  "no finished prose, no paragraphs to publish.",
  "",
  "You are given the opportunity, the brand profile, the target page if it already",
  "exists, the target keyword with its metrics, the live SERP for that keyword, and",
  "the other pages on the site.",
  "",
  "`recommendedAction` must normally match the action already on the opportunity.",
  "Only change it when the supplied data genuinely contradicts it, and then say why",
  "in `actionJustification`. When you keep it, `actionJustification` states in one",
  "sentence why it still holds.",
  "",
  "`objective` is one sentence: what this page must achieve commercially.",
  "`searchIntent` names the intent behind the keyword in a few words.",
  "`recommendedTitle` is a real title tag, under 60 characters.",
  "`recommendedMetaDescription` is a real meta description, under 155 characters.",
  "`outline` is the H2/H3 structure, one heading per entry, in order.",
  "`keyQuestions` are the questions the page must answer for a buyer.",
  "`internalLinks` name pages from the supplied site pages to link from or to,",
  "each with the reason in the same line. Use only URLs that appear in the list.",
  "`competitorInsights` must cite the actual ranking domains supplied in the SERP,",
  "and say what they cover or miss. Never invent a competitor that is not listed.",
  "`evidenceNeeded` lists the proof the brand must supply: figures, examples,",
  "screenshots, references. Do not invent the evidence itself.",
  "",
  "Respect the brand voice. Keep every entry short and concrete.",
].join("\n");

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    objective: { type: "string" },
    targetKeyword: { type: "string" },
    searchIntent: { type: "string" },
    recommendedAction: { type: "string", enum: SEO_ACTION_TYPES },
    actionJustification: { type: "string" },
    recommendedTitle: { type: "string" },
    recommendedMetaDescription: { type: "string" },
    outline: { type: "array", items: { type: "string" } },
    keyQuestions: { type: "array", items: { type: "string" } },
    internalLinks: { type: "array", items: { type: "string" } },
    competitorInsights: { type: "array", items: { type: "string" } },
    evidenceNeeded: { type: "array", items: { type: "string" } },
  },
  required: [
    "objective",
    "targetKeyword",
    "searchIntent",
    "recommendedAction",
    "actionJustification",
    "recommendedTitle",
    "recommendedMetaDescription",
    "outline",
    "keyQuestions",
    "internalLinks",
    "competitorInsights",
    "evidenceNeeded",
  ],
} as const;

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function generateSeoBrief(
  context: SeoBriefContext,
): Promise<GeneratedSeoBrief> {
  const parsed = (await callOpenAi(
    BRIEF_SYSTEM_PROMPT,
    context,
    "seo_brief",
    BRIEF_SCHEMA,
  )) as Record<string, unknown>;

  const objective = String(parsed.objective ?? "").trim();
  if (!objective) throw new Error("OpenAI returned a brief with no objective.");

  const action = String(parsed.recommendedAction ?? "");
  if (!(SEO_ACTION_TYPES as readonly string[]).includes(action)) {
    throw new Error("OpenAI returned an unknown action type.");
  }

  return {
    objective,
    targetKeyword: String(parsed.targetKeyword ?? "").trim(),
    searchIntent: String(parsed.searchIntent ?? "").trim(),
    recommendedAction: action as GeneratedSeoBrief["recommendedAction"],
    actionJustification: String(parsed.actionJustification ?? "").trim(),
    recommendedTitle: String(parsed.recommendedTitle ?? "").trim(),
    recommendedMetaDescription: String(parsed.recommendedMetaDescription ?? "").trim(),
    outline: stringList(parsed.outline),
    keyQuestions: stringList(parsed.keyQuestions),
    internalLinks: stringList(parsed.internalLinks),
    competitorInsights: stringList(parsed.competitorInsights),
    evidenceNeeded: stringList(parsed.evidenceNeeded),
  };
}

/* -------------------------------------------------------------------------- */
/* SEO content                                                                */
/* -------------------------------------------------------------------------- */

export type GeneratedSeoContent = {
  title: string;
  metaDescription: string;
  content: string;
  suggestedSlug: string;
};

export type SeoContentContext = {
  brandName: string;
  brief: {
    objective: string;
    targetKeyword: string | null;
    searchIntent: string | null;
    recommendedAction: string;
    recommendedTitle: string | null;
    recommendedMetaDescription: string | null;
    outline: string[];
    keyQuestions: string[];
    internalLinks: string[];
    competitorInsights: string[];
    evidenceNeeded: string[];
  };
  profile: BrandContext["profile"];
  keyword: {
    keyword: string;
    searchVolume: number | null;
    difficulty: number | null;
    intent: string | null;
  } | null;
  serpCompetitors: { position: number; domain: string; title: string | null }[];
  sitePages: { url: string; title: string | null }[];
  goldenExamples: { title: string | null; content: string }[];
};

const CONTENT_SYSTEM_PROMPT = [
  "You write the full page described by an SEO brief, for one brand.",
  "",
  "Follow the brief: its objective, its outline, and its key questions.",
  "Answer the search intent plainly and early — the reader should get what they",
  "came for in the first screen, not after a warm-up.",
  "Be useful before being optimised. Use the target keyword naturally where it",
  "belongs and nowhere else: no stuffing, no repeated exact-match phrases.",
  "",
  "Write in the brand's voice and obey its voice rules. The golden examples are a",
  "tone reference only — never reuse their sentences.",
  "",
  "Invent nothing. No statistics, client names, case studies, prices, dates or",
  "claims that are not in the supplied material. Wherever the brief says evidence",
  "is needed, or wherever a real figure or proof would belong, leave an inline",
  "placeholder in the exact form `[TO SOURCE: what is needed]` instead of writing",
  "something plausible. These placeholders are expected — do not avoid them by",
  "writing vaguely.",
  "",
  "`content` is Markdown: H2 and H3 headings following the outline, short",
  "paragraphs, lists where they help. No H1 — the title field is the H1.",
  "For internal links use the real URLs supplied in the site pages, as Markdown",
  "links, only where they genuinely help the reader.",
  "",
  "`title` is the title tag, under 60 characters.",
  "`metaDescription` is under 155 characters.",
  "`suggestedSlug` is lowercase, hyphenated, no leading slash.",
].join("\n");

const CONTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    metaDescription: { type: "string" },
    content: { type: "string" },
    suggestedSlug: { type: "string" },
  },
  required: ["title", "metaDescription", "content", "suggestedSlug"],
} as const;

export async function generateSeoContent(
  context: SeoContentContext,
): Promise<GeneratedSeoContent> {
  const parsed = (await callOpenAi(
    CONTENT_SYSTEM_PROMPT,
    context,
    "seo_content",
    CONTENT_SCHEMA,
  )) as Record<string, unknown>;

  const content = String(parsed.content ?? "").trim();
  if (!content) throw new Error("OpenAI returned empty content.");

  return {
    title: String(parsed.title ?? "").trim(),
    metaDescription: String(parsed.metaDescription ?? "").trim(),
    content,
    suggestedSlug: String(parsed.suggestedSlug ?? "")
      .trim()
      .replace(/^\/+/, ""),
  };
}

/* -------------------------------------------------------------------------- */
/* Growth Week                                                                */
/* -------------------------------------------------------------------------- */

const MAX_WEEK_ACTIONS = 5;

const WEEK_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
] as const;

const WEEK_ACTIONS = [
  "CREATE_LINKEDIN_DRAFT",
  "APPROVE_LINKEDIN_DRAFT",
  "SCHEDULE_CONTENT",
  "CREATE_SEO_BRIEF",
  "FINALISE_SEO_CONTENT",
  "REFRESH_PAGE",
  "TECHNICAL_FIX",
  "NO_PUBLICATION",
] as const;

const WEEK_CHANNELS = ["SOCIAL", "SEARCH", "NONE"] as const;

export type GeneratedWeekItem = {
  day: (typeof WEEK_DAYS)[number];
  opportunityId: string;
  contentAssetId: string;
  action: (typeof WEEK_ACTIONS)[number];
  channel: (typeof WEEK_CHANNELS)[number];
  reason: string;
  priority: number;
};

export type GrowthWeekContext = {
  brandName: string;
  weekStart: string;
  profile: BrandContext["profile"];
  opportunities: {
    id: string;
    title: string;
    source: string;
    status: string;
    score: number | null;
    actionType: string | null;
    targetKeyword: string | null;
    hasSeoBrief: boolean;
    hasSeoContent: boolean;
    savedDraftCount: number;
  }[];
  contentAssets: {
    id: string;
    title: string | null;
    channel: string;
    type: string;
    status: string;
    scheduledAt: string | null;
    excerpt: string;
  }[];
};

const WEEK_SYSTEM_PROMPT = [
  "You plan one working week of growth work for a single brand.",
  "",
  "You are given the brand profile, its opportunities (social and search, with",
  "scores and how far each has already progressed) and its content assets",
  "(with their status and any date already scheduled).",
  "",
  `Propose at most ${MAX_WEEK_ACTIONS} actions for Monday to Friday.`,
  "Fewer is better than filler. Do not force an action every day: when a day is",
  "better left empty, use action NO_PUBLICATION with channel NONE and say why.",
  "",
  "Rules:",
  "- Balance social and search across the week; do not stack one side.",
  "- Never propose two actions that would produce near-identical content.",
  "- Business priority beats volume: one high-score item beats three weak ones.",
  "- Respect what is already scheduled — do not re-propose scheduling it.",
  "- Move each item one concrete step forward from where it already is:",
  "  an opportunity with no brief needs CREATE_SEO_BRIEF, one with a brief but no",
  "  content needs FINALISE_SEO_CONTENT, a saved draft that is still DRAFT needs",
  "  APPROVE_LINKEDIN_DRAFT, an approved asset with no date needs SCHEDULE_CONTENT.",
  "",
  "`opportunityId` and `contentAssetId` must be ids taken from the supplied lists,",
  "or an empty string when not applicable. Never invent an id.",
  "`reason` is one short sentence. `priority` is 1 (highest) to 5.",
].join("\n");

const WEEK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      maxItems: MAX_WEEK_ACTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string", enum: WEEK_DAYS },
          opportunityId: { type: "string" },
          contentAssetId: { type: "string" },
          action: { type: "string", enum: WEEK_ACTIONS },
          channel: { type: "string", enum: WEEK_CHANNELS },
          reason: { type: "string" },
          priority: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: [
          "day",
          "opportunityId",
          "contentAssetId",
          "action",
          "channel",
          "reason",
          "priority",
        ],
      },
    },
  },
  required: ["items"],
} as const;

function isWeekItem(value: unknown): value is GeneratedWeekItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.day === "string" &&
    (WEEK_DAYS as readonly string[]).includes(item.day) &&
    typeof item.action === "string" &&
    (WEEK_ACTIONS as readonly string[]).includes(item.action) &&
    typeof item.channel === "string" &&
    (WEEK_CHANNELS as readonly string[]).includes(item.channel) &&
    typeof item.reason === "string" &&
    typeof item.opportunityId === "string" &&
    typeof item.contentAssetId === "string" &&
    typeof item.priority === "number"
  );
}

export async function generateGrowthWeek(
  context: GrowthWeekContext,
): Promise<GeneratedWeekItem[]> {
  const parsed = await callOpenAi(
    WEEK_SYSTEM_PROMPT,
    context,
    "growth_week",
    WEEK_SCHEMA,
  );

  const list = (parsed as { items?: unknown }).items;
  if (!Array.isArray(list)) throw new Error("OpenAI returned an unexpected shape.");

  const opportunityIds = new Set(context.opportunities.map((item) => item.id));
  const assetIds = new Set(context.contentAssets.map((item) => item.id));

  return list
    .filter(isWeekItem)
    .slice(0, MAX_WEEK_ACTIONS)
    .map((item) => ({
      ...item,
      // Drop any id the model did not take from the supplied lists.
      opportunityId: opportunityIds.has(item.opportunityId) ? item.opportunityId : "",
      contentAssetId: assetIds.has(item.contentAssetId) ? item.contentAssetId : "",
      reason: item.reason.trim(),
      priority: Math.min(5, Math.max(1, Math.round(item.priority))),
    }));
}

/* -------------------------------------------------------------------------- */
/* Article                                                                    */
/* -------------------------------------------------------------------------- */

export type GeneratedArticle = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  metaTitle: string;
  metaDescription: string;
  internalLinks: { href: string; anchor: string }[];
};

export type ArticleContext = {
  brandName: string;
  profile: BrandContext["profile"];
  voiceRules: { type: string; rule: string }[];
  goldenExamples: { title: string | null; content: string }[];
  opportunity: {
    title: string;
    description: string;
    rationale: string | null;
    targetKeyword: string | null;
    targetUrl: string | null;
  };
  brief: SeoContentContext["brief"] | null;
  keyword: SeoContentContext["keyword"];
  serpCompetitors: SeoContentContext["serpCompetitors"];
  sitePages: { url: string; title: string | null }[];
  publicRoute: string;
};

const ARTICLE_SYSTEM_PROMPT = [
  "You write one complete editorial article for a brand's blog.",
  "",
  "Write it premium, direct, human and useful. Say the thing, then explain it.",
  "Short sentences over long ones. No academic throat-clearing, no listicle",
  "padding, no content-farm filler, no agency boilerplate, no SEO copy that",
  "exists to be crawled rather than read.",
  "",
  "Obey the brand voice rules. The golden examples are a tone reference only —",
  "never reuse their sentences.",
  "",
  "Invent nothing. No statistics, client names, case studies, prices, dates or",
  "claims that are not in the supplied material. Where a real figure or proof",
  "would belong, leave an inline `[TO SOURCE: what is needed]` placeholder",
  "instead of writing something plausible.",
  "",
  "Use the target keyword where it genuinely belongs and nowhere else. No",
  "stuffing, no repeated exact-match phrases, no keyword in every heading.",
  "",
  "`content` is clean MDX: H2 and H3 headings, short paragraphs, lists where they",
  "help. No H1 — the title is the H1. No import statements, no JSX components, no",
  "front matter: only Markdown the site already renders.",
  "`internalLinks` are site-relative paths taken from the supplied site pages,",
  "each with the anchor text to use. Return an empty array rather than inventing",
  "a path.",
  "`slug` is lowercase words separated by single dashes, no leading slash.",
  "`metaTitle` is at most 70 characters, `metaDescription` at most 165.",
  "`excerpt` is one or two sentences that make someone want to read on.",
  "`category` is a single short label, `tags` three to six of them.",
].join("\n");

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    excerpt: { type: "string" },
    content: { type: "string" },
    category: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    metaTitle: { type: "string" },
    metaDescription: { type: "string" },
    internalLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { href: { type: "string" }, anchor: { type: "string" } },
        required: ["href", "anchor"],
      },
    },
  },
  required: [
    "title",
    "slug",
    "excerpt",
    "content",
    "category",
    "tags",
    "metaTitle",
    "metaDescription",
    "internalLinks",
  ],
} as const;

export async function generateArticle(
  context: ArticleContext,
): Promise<GeneratedArticle> {
  const parsed = (await callOpenAi(
    ARTICLE_SYSTEM_PROMPT,
    context,
    "article",
    ARTICLE_SCHEMA,
  )) as Record<string, unknown>;

  const content = String(parsed.content ?? "").trim();
  if (!content) throw new Error("OpenAI returned an empty article.");

  const list = (value: unknown) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];

  return {
    title: String(parsed.title ?? "").trim(),
    slug: String(parsed.slug ?? "")
      .trim()
      .replace(/^\/+/, ""),
    excerpt: String(parsed.excerpt ?? "").trim(),
    content,
    category: String(parsed.category ?? "").trim(),
    tags: list(parsed.tags),
    metaTitle: String(parsed.metaTitle ?? "").trim(),
    metaDescription: String(parsed.metaDescription ?? "").trim(),
    internalLinks: Array.isArray(parsed.internalLinks)
      ? parsed.internalLinks
          .filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === "object" && entry !== null,
          )
          .map((entry) => ({
            href: String(entry.href ?? "").trim(),
            anchor: String(entry.anchor ?? "").trim(),
          }))
          .filter((link) => link.href && link.anchor)
      : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Article images                                                             */
/* -------------------------------------------------------------------------- */

export type ArticleVisualContext = {
  brandName: string;
  title: string;
  excerpt: string;
  category: string;
  targetKeyword: string;
  content: string;
  profile: BrandContext["profile"];
  voiceRules: { type: string; rule: string }[];
  artDirection: string;
};

export type CoverConcept = { concept: string; alt: string; imagePrompt: string };

const COVER_SYSTEM_PROMPT = [
  "You art-direct the cover image of one editorial article.",
  "",
  "Read the article and find the single idea a reader should feel before they",
  "read a word. The cover illustrates that idea — it never decorates the topic",
  "and never illustrates the title literally.",
  "",
  "Obey the supplied art direction exactly. It is a constraint, not a mood board.",
  "",
  "`concept` is one or two sentences explaining the image and why it fits.",
  "`alt` describes what is actually visible, for a reader who cannot see it.",
  "`imagePrompt` is the full prompt for the image model: subject, composition,",
  "lighting, palette and the exclusions from the art direction. Landscape",
  "orientation, suitable as a wide editorial header.",
].join("\n");

const COVER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    concept: { type: "string" },
    alt: { type: "string" },
    imagePrompt: { type: "string" },
  },
  required: ["concept", "alt", "imagePrompt"],
} as const;

export async function suggestCover(
  context: ArticleVisualContext,
): Promise<CoverConcept> {
  const parsed = (await callOpenAi(
    COVER_SYSTEM_PROMPT,
    context,
    "article_cover",
    COVER_SCHEMA,
  )) as Record<string, unknown>;

  const imagePrompt = String(parsed.imagePrompt ?? "").trim();
  if (!imagePrompt) throw new Error("OpenAI returned no cover prompt.");

  return {
    concept: String(parsed.concept ?? "").trim(),
    alt: String(parsed.alt ?? "").trim(),
    imagePrompt,
  };
}

/* -------------------------------------------------------------------------- */
/* Google Business post                                                       */
/* -------------------------------------------------------------------------- */

/** Google Business Profile truncates hard; this stays well inside the limit. */
export const GOOGLE_BUSINESS_MAX = 1200;

export type GeneratedBusinessPost = { content: string; callToAction: string };

export type BusinessPostContext = {
  brandName: string;
  profile: BrandContext["profile"];
  article: {
    title: string;
    excerpt: string;
    body: string;
    targetKeyword: string;
    url: string;
  };
};

const BUSINESS_SYSTEM_PROMPT = [
  "You write one Google Business Profile post that sends a local reader to an",
  "article the brand has just published.",
  "",
  "Short: three or four sentences, under 900 characters. Plain, human, direct.",
  "Open on the problem the reader recognises, say what the article settles, and",
  "stop. No emoji, no hashtags, no marketing exclamation.",
  "",
  "Invent nothing: no statistics, client names, prices, offers, opening hours or",
  "claims that are not in the article. Do not restate the excerpt word for word,",
  "and do not write a flat summary — give a reason to click.",
  "",
  "Use the target keyword once at most, only where it reads naturally. If the",
  "brand has a place or a market, a local angle is welcome, but never invent one.",
  "",
  "`content` is the post body without the link. `callToAction` is the short",
  "label for the button, two or three words, e.g. \"Read the article\".",
].join("\n");

const BUSINESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    content: { type: "string" },
    callToAction: { type: "string" },
  },
  required: ["content", "callToAction"],
} as const;

export async function generateGoogleBusinessPost(
  context: BusinessPostContext,
): Promise<GeneratedBusinessPost> {
  const parsed = (await callOpenAi(
    BUSINESS_SYSTEM_PROMPT,
    context,
    "google_business_post",
    BUSINESS_SCHEMA,
  )) as Record<string, unknown>;

  const content = String(parsed.content ?? "").trim();
  if (!content) throw new Error("OpenAI returned an empty post.");

  return {
    content: content.slice(0, GOOGLE_BUSINESS_MAX),
    callToAction: String(parsed.callToAction ?? "").trim() || "Read the article",
  };
}

/* -------------------------------------------------------------------------- */
/* Meta ideas                                                                 */
/* -------------------------------------------------------------------------- */

export const META_CHANNELS = ["FACEBOOK", "INSTAGRAM", "BOTH"] as const;

export const META_TYPES = [
  "TEXT_POST",
  "MEME_CONCEPT",
  "VIDEO_AD_BRIEF",
  "TESTIMONIAL_VIDEO_BRIEF",
] as const;

export type MetaIdea = {
  channel: (typeof META_CHANNELS)[number];
  contentType: (typeof META_TYPES)[number];
  hook: string;
  angle: string;
  rationale: string;
  concept: string;
  cta: string;
  /** TEXT_POST */
  post: string;
  /** MEME_CONCEPT */
  setup: string;
  punchline: string;
  visualConcept: string;
  caption: string;
  /** VIDEO_AD_BRIEF */
  audience: string;
  painPoint: string;
  promise: string;
  duration: string;
  /** TESTIMONIAL_VIDEO_BRIEF — a persona, never a real customer */
  persona: string;
  problem: string;
  transformation: string;
  structure: string;
};

export type MetaIdeasContext = {
  brandName: string;
  profile: BrandContext["profile"];
  voiceRules: { type: string; rule: string }[];
  audiences: {
    name: string;
    description: string;
    pains: string[];
    motivations: string[];
    objections: string[];
  }[];
  goldenExamples: { title: string | null; content: string }[];
  source: {
    kind: "OPPORTUNITY" | "ARTICLE";
    title: string;
    description: string;
    body: string;
    url: string | null;
  };
  /** Titles already produced for this brand, so ideas do not repeat them. */
  recentContent: string[];
};

const META_SYSTEM_PROMPT = [
  "You propose Meta content ideas for one brand: Facebook and Instagram, not",
  "LinkedIn. Return at most four, and make them genuinely different — different",
  "angle, different format, different reason to stop scrolling. Four variations",
  "of the same post is a failure.",
  "",
  "Meta rewards speed and recognition. Lead with a hook someone feels in one",
  "second: a tension, a small truth, something people forward to a colleague.",
  "Human language, simple visual ideas, no corporate tone, no jargon, no flat",
  "summary of the source, no automatic hashtags, no misleading clickbait.",
  "",
  "Invent nothing factual: no statistics, client names, prices or results that",
  "are not in the supplied material.",
  "",
  "Pick the channel per idea: FACEBOOK for text and discussion, INSTAGRAM for",
  "visual and short video, BOTH only when it truly works on each.",
  "",
  "Fill only the fields its `contentType` needs and leave the others as empty",
  "strings:",
  "- TEXT_POST: `post` (short, punchy, line breaks welcome) and `cta`.",
  "- MEME_CONCEPT: `setup`, `punchline`, `visualConcept`, `caption`.",
  "- VIDEO_AD_BRIEF: `audience`, `painPoint`, `promise`, `cta`, `duration`",
  "  between 15 and 30 seconds. No storyboard, no shot list.",
  "- TESTIMONIAL_VIDEO_BRIEF: `persona`, `problem`, `transformation`,",
  "  `structure`, `cta`. The persona is a scenario to cast or script — write it",
  "  as an explicit persona, never as a real customer, and never quote words as",
  "  if someone said them.",
  "",
  "`hook` is the first line or first second. `angle` is the idea in one",
  "sentence. `rationale` says why this could work for this brand's audience.",
  "`concept` describes what the reader sees.",
].join("\n");

const META_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          channel: { type: "string", enum: META_CHANNELS },
          contentType: { type: "string", enum: META_TYPES },
          hook: { type: "string" },
          angle: { type: "string" },
          rationale: { type: "string" },
          concept: { type: "string" },
          cta: { type: "string" },
          post: { type: "string" },
          setup: { type: "string" },
          punchline: { type: "string" },
          visualConcept: { type: "string" },
          caption: { type: "string" },
          audience: { type: "string" },
          painPoint: { type: "string" },
          promise: { type: "string" },
          duration: { type: "string" },
          persona: { type: "string" },
          problem: { type: "string" },
          transformation: { type: "string" },
          structure: { type: "string" },
        },
        required: [
          "channel",
          "contentType",
          "hook",
          "angle",
          "rationale",
          "concept",
          "cta",
          "post",
          "setup",
          "punchline",
          "visualConcept",
          "caption",
          "audience",
          "painPoint",
          "promise",
          "duration",
          "persona",
          "problem",
          "transformation",
          "structure",
        ],
      },
    },
  },
  required: ["ideas"],
} as const;

export async function generateMetaIdeas(
  context: MetaIdeasContext,
): Promise<MetaIdea[]> {
  const parsed = (await callOpenAi(
    META_SYSTEM_PROMPT,
    context,
    "meta_ideas",
    META_SCHEMA,
  )) as Record<string, unknown>;

  const raw = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  const text = (value: unknown) => String(value ?? "").trim();

  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
    .slice(0, 4)
    .map((entry) => ({
      channel: (META_CHANNELS as readonly string[]).includes(String(entry.channel))
        ? (entry.channel as MetaIdea["channel"])
        : "FACEBOOK",
      contentType: (META_TYPES as readonly string[]).includes(String(entry.contentType))
        ? (entry.contentType as MetaIdea["contentType"])
        : "TEXT_POST",
      hook: text(entry.hook),
      angle: text(entry.angle),
      rationale: text(entry.rationale),
      concept: text(entry.concept),
      cta: text(entry.cta),
      post: text(entry.post),
      setup: text(entry.setup),
      punchline: text(entry.punchline),
      visualConcept: text(entry.visualConcept),
      caption: text(entry.caption),
      audience: text(entry.audience),
      painPoint: text(entry.painPoint),
      promise: text(entry.promise),
      duration: text(entry.duration),
      persona: text(entry.persona),
      problem: text(entry.problem),
      transformation: text(entry.transformation),
      structure: text(entry.structure),
    }))
    .filter((idea) => idea.hook);
}

/* -------------------------------------------------------------------------- */
/* Meta creative package                                                      */
/* -------------------------------------------------------------------------- */

export type MetaCreativePackage = {
  hook: string;
  copy: string;
  cta: string;
  visualRecommendation: "NONE" | "STATIC";
  imagePrompt: string;
  /** Labelled sections, in reading order, for whatever the format needs. */
  sections: { label: string; body: string }[];
  productionPrompt: string;
};

export type MetaCreativeContext = {
  brandName: string;
  channel: string;
  contentType: string;
  profile: BrandContext["profile"];
  voiceRules: { type: string; rule: string }[];
  audiences: {
    name: string;
    description: string;
    pains: string[];
    motivations: string[];
    objections: string[];
  }[];
  goldenExamples: { title: string | null; content: string }[];
  draft: { title: string; body: string };
  source: { title: string; description: string; url: string | null };
  artDirection: string;
};

const CREATIVE_SYSTEM_PROMPT = [
  "You turn a Meta content idea into the package someone produces from. Write",
  "for Facebook or Instagram, in the brand's language and voice.",
  "",
  "Invent nothing factual: no statistics, client names, prices, results or",
  "quotes that are not in the supplied material. No unsupported claims.",
  "",
  "Fill `sections` with what this content type actually needs, each section a",
  "short label and a body:",
  "",
  "TEXT_POST — `copy` is the finished post, `hook` its first line, `cta` the",
  "closing line. Set `visualRecommendation` to STATIC only when an image really",
  "adds something; otherwise NONE and leave `imagePrompt` empty. Sections may",
  "carry the visual concept when STATIC.",
  "",
  "MEME_CONCEPT — sections: Setup, Punchline, Meme structure, Visual",
  "composition, Caption. `copy` is the caption, `visualRecommendation` STATIC.",
  "Design an original composition; never require a copyrighted meme template.",
  "",
  "VIDEO_AD_BRIEF — sections: Objective, Target audience, Core pain, Core",
  "promise, Hook 0-3s, Script, Storyboard, Shot list, On-screen text, Voiceover,",
  "Pacing, Visual direction, Sound direction. The script runs 15 to 30 seconds:",
  "write it in full, spoken as it will be heard. Storyboard is scene by scene.",
  "`visualRecommendation` is NONE — no still image is produced for a video.",
  "",
  "TESTIMONIAL_VIDEO_BRIEF — same depth, sections: Fictional persona, Target",
  "audience, Situation, Hook, Script, Transformation, Objections addressed,",
  "Scene structure, B-roll, On-screen text, Visual direction. The persona is a",
  "scenario to cast: describe it as a persona, never as a real customer, and",
  "never write a line as if a real client had said it.",
  "",
  "`productionPrompt` is a single self-contained prompt a video tool can take:",
  "subject, structure, pacing, visual direction, on-screen text, aspect ratio",
  "for the channel, and what to avoid. Leave it empty for TEXT_POST without a",
  "visual.",
  "",
  "`imagePrompt`, when there is one, follows the supplied art direction and",
  "carries no text to render unless the concept is explicitly typographic.",
].join("\n");

const CREATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hook: { type: "string" },
    copy: { type: "string" },
    cta: { type: "string" },
    visualRecommendation: { type: "string", enum: ["NONE", "STATIC"] },
    imagePrompt: { type: "string" },
    productionPrompt: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { label: { type: "string" }, body: { type: "string" } },
        required: ["label", "body"],
      },
    },
  },
  required: [
    "hook",
    "copy",
    "cta",
    "visualRecommendation",
    "imagePrompt",
    "productionPrompt",
    "sections",
  ],
} as const;

export async function generateMetaCreative(
  context: MetaCreativeContext,
): Promise<MetaCreativePackage> {
  const parsed = (await callOpenAi(
    CREATIVE_SYSTEM_PROMPT,
    context,
    "meta_creative",
    CREATIVE_SCHEMA,
  )) as Record<string, unknown>;

  const text = (value: unknown) => String(value ?? "").trim();
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === "object" && entry !== null,
        )
        .map((entry) => ({ label: text(entry.label), body: text(entry.body) }))
        .filter((section) => section.label && section.body)
    : [];

  if (!sections.length && !text(parsed.copy)) {
    throw new Error("OpenAI returned an empty creative package.");
  }

  return {
    hook: text(parsed.hook),
    copy: text(parsed.copy),
    cta: text(parsed.cta),
    visualRecommendation: text(parsed.visualRecommendation) === "STATIC" ? "STATIC" : "NONE",
    imagePrompt: text(parsed.imagePrompt),
    productionPrompt: text(parsed.productionPrompt),
    sections,
  };
}
