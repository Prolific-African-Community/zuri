/**
 * The smallest possible read-only Vercel client: it answers one question —
 * did the commit that was merged actually reach production? Server-side only,
 * and it never triggers, cancels or promotes a deployment.
 */

const API = "https://api.vercel.com";

export function vercelConfigured() {
  return Boolean(process.env.VERCEL_TOKEN?.trim());
}

function token() {
  const value = process.env.VERCEL_TOKEN?.trim();
  if (!value) throw new Error("VERCEL_TOKEN is not set. See .env.example.");
  return value;
}

/** Personal accounts have no team; a team account needs its slug or id. */
function teamQuery() {
  const team = process.env.VERCEL_TEAM_ID?.trim();
  return team ? `&teamId=${encodeURIComponent(team)}` : "";
}

export type DeploymentState =
  | "READY"
  | "BUILDING"
  | "QUEUED"
  | "INITIALIZING"
  | "ERROR"
  | "CANCELED"
  | string;

export type Deployment = {
  id: string;
  url: string;
  state: DeploymentState;
  target: string | null;
  commitSha: string | null;
  branch: string | null;
  createdAt: number;
  readyAt: number | null;
  inspectorUrl: string | null;
  errorMessage: string | null;
};

type RawDeployment = {
  uid?: string;
  url?: string;
  state?: string;
  readyState?: string;
  target?: string | null;
  created?: number;
  ready?: number;
  inspectorUrl?: string;
  errorMessage?: string;
  meta?: { githubCommitSha?: string; githubCommitRef?: string };
};

async function call(path: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("Vercel request failed", path, response.status, text);
    let message = "";
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      message = "";
    }
    throw new Error(
      `Vercel ${response.status}${message ? `: ${message.slice(0, 140)}` : ""}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

function shape(raw: RawDeployment): Deployment {
  return {
    id: raw.uid ?? "",
    url: raw.url ? `https://${raw.url}` : "",
    state: raw.readyState ?? raw.state ?? "",
    target: raw.target ?? null,
    commitSha: raw.meta?.githubCommitSha ?? null,
    branch: raw.meta?.githubCommitRef ?? null,
    createdAt: raw.created ?? 0,
    readyAt: raw.ready ?? null,
    inspectorUrl: raw.inspectorUrl ?? null,
    errorMessage: raw.errorMessage ?? null,
  };
}

/**
 * Production deployments for a project, newest first. `target=production` is
 * asked for *and* re-checked, so a preview can never be mistaken for the site.
 */
export async function listProductionDeployments(
  projectId: string,
  limit = 20,
): Promise<Deployment[]> {
  const payload = (await call(
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=${limit}${teamQuery()}`,
  )) as { deployments?: RawDeployment[] };

  return (payload.deployments ?? [])
    .map(shape)
    .filter((deployment) => deployment.target === "production");
}

/** The production deployment built from one commit, if there is one yet. */
export async function findProductionDeployment(
  projectId: string,
  commitSha: string,
): Promise<Deployment | null> {
  const deployments = await listProductionDeployments(projectId);
  return (
    deployments.find(
      (deployment) => deployment.commitSha?.toLowerCase() === commitSha.toLowerCase(),
    ) ?? null
  );
}
