/**
 * DataForSEO access, server-side only. Two endpoints, no SDK, no scraping:
 * one for keyword metrics, one for the live Google organic SERP.
 */

const BASE = "https://api.dataforseo.com/v3";

const DEFAULT_LOCATION = "United States";
const DEFAULT_LANGUAGE = "English";

export function seoLocation() {
  return process.env.DATAFORSEO_LOCATION_NAME?.trim() || DEFAULT_LOCATION;
}

export function seoLanguage() {
  return process.env.DATAFORSEO_LANGUAGE_NAME?.trim() || DEFAULT_LANGUAGE;
}

export type KeywordMetrics = {
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  intent: string | null;
};

export type SerpResult = {
  domain: string;
  position: number;
  url: string | null;
  title: string | null;
};

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) {
    throw new Error(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set to use DataForSEO.",
    );
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1500;

/** DataForSEO intermittently 403s or rate-limits a request that then succeeds. */
function isTransient(status: number) {
  return status === 403 || status === 429 || status >= 500;
}

async function call(path: string, body: unknown): Promise<unknown> {
  let response!: Response;
  let text = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify(body),
    });
    text = await response.text();

    if (response.ok || !isTransient(response.status) || attempt === MAX_ATTEMPTS) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
  }

  if (!response.ok) {
    console.error("DataForSEO request failed", path, response.status, text);
    throw new Error(`DataForSEO request failed (${response.status}).`);
  }

  let payload: {
    status_code?: number;
    status_message?: string;
    tasks?: {
      status_code?: number;
      status_message?: string;
      result?: unknown;
    }[];
  };
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("DataForSEO returned malformed JSON.");
  }

  // 20000 is DataForSEO's "ok" code, both at the envelope and task level.
  if (payload.status_code !== 20000) {
    console.error("DataForSEO error", path, payload.status_code, payload.status_message);
    throw new Error(
      `DataForSEO: ${payload.status_message ?? "unknown error"}`.slice(0, 160),
    );
  }

  const task = payload.tasks?.[0];
  if (!task) throw new Error("DataForSEO returned no task.");
  if (task.status_code !== 20000) {
    console.error("DataForSEO task error", path, task.status_code, task.status_message);
    throw new Error(
      `DataForSEO: ${task.status_message ?? "task failed"}`.slice(0, 160),
    );
  }

  return task.result;
}

/** Volume, difficulty and main intent for up to a handful of keywords. */
export async function fetchKeywordMetrics(
  keywords: string[],
): Promise<KeywordMetrics[]> {
  if (!keywords.length) return [];

  const result = (await call("/dataforseo_labs/google/keyword_overview/live", [
    {
      keywords,
      location_name: seoLocation(),
      language_name: seoLanguage(),
    },
  ])) as
    | {
        items?: {
          keyword?: string;
          keyword_info?: { search_volume?: number | null };
          keyword_properties?: { keyword_difficulty?: number | null };
          search_intent_info?: { main_intent?: string | null };
        }[];
      }[]
    | null;

  const items = result?.[0]?.items ?? [];

  return items
    .filter((item) => typeof item.keyword === "string")
    .map((item) => ({
      keyword: item.keyword as string,
      searchVolume: item.keyword_info?.search_volume ?? null,
      difficulty: item.keyword_properties?.keyword_difficulty ?? null,
      intent: item.search_intent_info?.main_intent ?? null,
    }));
}

/** Top organic results for one keyword. */
export async function fetchSerp(
  keyword: string,
  depth = 10,
): Promise<SerpResult[]> {
  const result = (await call("/serp/google/organic/live/advanced", [
    {
      keyword,
      location_name: seoLocation(),
      language_name: seoLanguage(),
      depth,
    },
  ])) as
    | {
        items?: {
          type?: string;
          rank_absolute?: number;
          domain?: string;
          url?: string;
          title?: string;
        }[];
      }[]
    | null;

  const items = result?.[0]?.items ?? [];

  return items
    .filter((item) => item.type === "organic" && item.domain)
    .slice(0, depth)
    .map((item, index) => ({
      domain: item.domain as string,
      position: item.rank_absolute ?? index + 1,
      url: item.url ?? null,
      title: item.title ?? null,
    }));
}

/**
 * Priority score, 0–100. Deliberately a plain weighted sum so the number is
 * explainable rather than clever:
 *   volume     up to 60 pts, on a log scale (10 searches ≠ 10 000 searches)
 *   difficulty up to 25 pts, inverted (easier ranks higher)
 *   intent     up to 15 pts (commercial and transactional are worth most)
 * Missing inputs simply contribute nothing.
 */
export function priorityScore(metrics: {
  searchVolume: number | null;
  difficulty: number | null;
  intent: string | null;
}) {
  const volume = metrics.searchVolume ?? 0;
  const volumePoints = Math.min(
    60,
    Math.round((Math.log10(volume + 1) / Math.log10(100_000)) * 60),
  );

  const difficultyPoints =
    metrics.difficulty === null
      ? 0
      : Math.round(((100 - metrics.difficulty) / 100) * 25);

  const intent = metrics.intent?.toLowerCase() ?? "";
  const intentPoints =
    intent === "transactional" || intent === "commercial"
      ? 15
      : intent === "informational"
        ? 8
        : intent === "navigational"
          ? 3
          : 0;

  return Math.max(0, Math.min(100, volumePoints + difficultyPoints + intentPoints));
}
