/**
 * Minimal GitHub REST access, server-side only. Reads the repository, writes
 * files onto a fresh branch, opens a pull request. It never merges, never
 * deletes, and never writes to the default branch.
 */

const API = "https://api.github.com";

export type RepoRef = {
  owner: string;
  repo: string;
  /** Base branch. Falls back to the repository default when absent. */
  branch?: string | null;
};

export type RepoFile = { path: string; content: string; sha: string };

export type PatchFile = {
  path: string;
  /** Only ever create or update — this bridge never removes files. */
  action: "create" | "update";
  content: string;
};

function token() {
  const value = process.env.GITHUB_TOKEN?.trim();
  if (!value) {
    throw new Error("GITHUB_TOKEN is not set. See .env.example.");
  }
  return value;
}

async function call(
  path: string,
  init: RequestInit & { raw?: boolean } = {},
): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("GitHub request failed", path, response.status, text);
    let message = "";
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? "";
    } catch {
      message = "";
    }
    throw new Error(
      `GitHub ${response.status}${message ? `: ${message.slice(0, 140)}` : ""}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

/** Confirms the repo and base branch exist before anything else runs. */
export async function resolveBase(ref: RepoRef) {
  const repo = (await call(`/repos/${ref.owner}/${ref.repo}`)) as {
    default_branch?: string;
    full_name?: string;
    permissions?: { push?: boolean };
  };

  const branch = ref.branch?.trim() || repo.default_branch;
  if (!branch) throw new Error("The repository has no default branch.");

  const head = (await call(
    `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  ).catch(() => null)) as { object?: { sha?: string } } | null;

  if (!head?.object?.sha) {
    throw new Error(`Branch "${branch}" was not found in ${ref.owner}/${ref.repo}.`);
  }

  return { branch, sha: head.object.sha, fullName: repo.full_name ?? "" };
}

/** Flat list of every file path on a branch. */
export async function listFiles(ref: RepoRef, branch: string) {
  const tree = (await call(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  )) as { tree?: { path?: string; type?: string }[]; truncated?: boolean };

  return {
    paths: (tree.tree ?? [])
      .filter((entry) => entry.type === "blob" && entry.path)
      .map((entry) => entry.path as string),
    truncated: Boolean(tree.truncated),
  };
}

export async function readFile(
  ref: RepoRef,
  path: string,
  branch: string,
): Promise<RepoFile | null> {
  const file = (await call(
    `/repos/${ref.owner}/${ref.repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(branch)}`,
  ).catch(() => null)) as
    | { content?: string; encoding?: string; sha?: string; type?: string }
    | null;

  if (!file || file.type !== "file" || !file.sha) return null;

  const content =
    file.encoding === "base64" && file.content
      ? Buffer.from(file.content, "base64").toString("utf8")
      : (file.content ?? "");

  return { path, content, sha: file.sha };
}

/** Creates `zuri/...` off the base commit. Refuses to touch the base branch. */
export async function createBranch(
  ref: RepoRef,
  branchName: string,
  fromSha: string,
  baseBranch: string,
) {
  if (!branchName.startsWith("zuri/")) {
    throw new Error("Zuri only writes to branches prefixed with zuri/.");
  }
  if (branchName === baseBranch) {
    throw new Error("Refusing to write to the base branch.");
  }

  await call(`/repos/${ref.owner}/${ref.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  });

  return branchName;
}

/** Writes one file on the working branch. Update requires the current sha. */
export async function writeFile(
  ref: RepoRef,
  branch: string,
  file: PatchFile,
  sha: string | undefined,
  message: string,
) {
  if (file.action === "update" && !sha) {
    throw new Error(`Cannot update ${file.path}: it does not exist on the branch.`);
  }

  await call(
    `/repos/${ref.owner}/${ref.repo}/contents/${file.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        branch,
        content: Buffer.from(file.content, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    },
  );
}

export async function createPullRequest(
  ref: RepoRef,
  branch: string,
  baseBranch: string,
  title: string,
  body: string,
) {
  const pr = (await call(`/repos/${ref.owner}/${ref.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head: branch, base: baseBranch }),
  })) as { number?: number; html_url?: string };

  if (!pr.number || !pr.html_url) {
    throw new Error("GitHub did not return the created pull request.");
  }

  return { number: pr.number, url: pr.html_url };
}

/** Writes raw bytes (an image) on the working branch, base64 as GitHub wants. */
export async function writeBinaryFile(
  ref: RepoRef,
  branch: string,
  path: string,
  bytes: Buffer,
  sha: string | undefined,
  message: string,
) {
  await call(
    `/repos/${ref.owner}/${ref.repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        branch,
        content: bytes.toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    },
  );
}

/** An open pull request whose head is this branch, if there is one. */
export async function findPullRequest(ref: RepoRef, branch: string) {
  const pulls = (await call(
    `/repos/${ref.owner}/${ref.repo}/pulls?state=all&head=${encodeURIComponent(
      `${ref.owner}:${branch}`,
    )}`,
  ).catch(() => null)) as
    | { number?: number; html_url?: string; state?: string; merged_at?: string | null }[]
    | null;

  // Only a pull request that is still open can be reused. A merged one would
  // report itself as merged again and fake a publication that never happened.
  const pr = pulls?.find((entry) => entry.state === "open" && !entry.merged_at);
  return pr?.number && pr.html_url ? { number: pr.number, url: pr.html_url } : null;
}

/** True when the branch already exists on the remote. */
export async function branchExists(ref: RepoRef, branch: string) {
  const head = (await call(
    `/repos/${ref.owner}/${ref.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  ).catch(() => null)) as { object?: { sha?: string } } | null;
  return Boolean(head?.object?.sha);
}

export type PullRequestState = {
  number: number;
  url: string;
  /** GitHub's own words: "open" or "closed". Closed is not merged. */
  state: string;
  merged: boolean;
  mergedAt: string | null;
  /** The commit the merge produced on the base branch. */
  mergeCommitSha: string | null;
};

/** Reads one pull request. Merge is only ever taken from `merged`/`merged_at`. */
export async function getPullRequest(
  ref: RepoRef,
  number: number,
): Promise<PullRequestState> {
  const pr = (await call(`/repos/${ref.owner}/${ref.repo}/pulls/${number}`)) as {
    number?: number;
    html_url?: string;
    state?: string;
    merged?: boolean;
    merged_at?: string | null;
    merge_commit_sha?: string | null;
  };

  return {
    number: pr.number ?? number,
    url: pr.html_url ?? "",
    state: pr.state ?? "",
    merged: Boolean(pr.merged) || Boolean(pr.merged_at),
    mergedAt: pr.merged_at ?? null,
    mergeCommitSha: pr.merge_commit_sha ?? null,
  };
}

/** Which merge methods the repository actually allows. */
export async function allowedMergeMethods(ref: RepoRef) {
  const repo = (await call(`/repos/${ref.owner}/${ref.repo}`)) as {
    allow_squash_merge?: boolean;
    allow_merge_commit?: boolean;
    allow_rebase_merge?: boolean;
  };

  const methods: ("squash" | "merge" | "rebase")[] = [];
  if (repo.allow_squash_merge !== false) methods.push("squash");
  if (repo.allow_merge_commit !== false) methods.push("merge");
  if (repo.allow_rebase_merge !== false) methods.push("rebase");
  return methods;
}

/**
 * Merges a pull request with a method the repository allows. It never pushes to
 * the base branch directly and never overrides a branch protection: a refusal
 * from GitHub is returned as an error, not worked around.
 */
export async function mergePullRequest(
  ref: RepoRef,
  number: number,
  title: string,
  method: "squash" | "merge" | "rebase",
) {
  const result = (await call(
    `/repos/${ref.owner}/${ref.repo}/pulls/${number}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({ merge_method: method, commit_title: title }),
    },
  )) as { merged?: boolean; sha?: string; message?: string };

  return { merged: Boolean(result.merged), sha: result.sha ?? "" };
}

/**
 * Removes one file from a working branch. The only deletion this bridge can
 * perform: one path, one sha, never a directory and never on the base branch.
 */
export async function deleteFile(
  ref: RepoRef,
  branch: string,
  path: string,
  sha: string,
  message: string,
) {
  if (!branch.startsWith("zuri/")) {
    throw new Error("Zuri only deletes on branches prefixed with zuri/.");
  }

  await call(
    `/repos/${ref.owner}/${ref.repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "DELETE",
      body: JSON.stringify({ message, branch, sha }),
    },
  );
}
