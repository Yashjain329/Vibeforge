export interface RepoId {
  owner: string;
  repo: string;
  ref: string | undefined;
}

export interface Branch {
  name: string;
  protected: boolean;
}

export interface BranchList {
  defaultBranch: string;
  branches: Branch[];
  /** true when the repo has more branches than we fetched */
  more: boolean;
}

const NAME = "[A-Za-z0-9_.-]+";
const RE = new RegExp(
  `^(?:(?:https?://)?(?:www\\.)?github\\.com/)?(${NAME})/(${NAME}?)(?:\\.git)?(?:/tree/([A-Za-z0-9_./-]+?))?/?$`,
);

/** Same rules as api/_codemind.py `parse_repo`. Returns null for anything that isn't a GitHub repo. */
export function parseRepo(input: string): RepoId | null {
  const s = input.trim();
  const m = RE.exec(s);
  if (!m || (s.split("/").length > 2 && !s.includes("github.com"))) return null;
  const [, owner, repo, ref] = m;
  if (!repo || [owner, repo].some((x) => x === "." || x === "..")) return null;
  return { owner, repo, ref: ref || undefined };
}

/** The repo string sent to /api/graph. */
export function repoRef(owner: string, repo: string, ref?: string): string {
  return ref ? `https://github.com/${owner}/${repo}/tree/${ref}` : `${owner}/${repo}`;
}

const MAX_BRANCHES = 100;

export async function listBranches(
  owner: string,
  repo: string,
  opts: { fetch?: typeof fetch; token?: string } = {},
): Promise<BranchList> {
  const f = opts.fetch ?? fetch;
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "codemind" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const get = async (url: string) => {
    const res = await f(url, { headers });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error(`Repository ${owner}/${repo} not found (is it public?)`);
    if (res.status === 403 || res.status === 429) {
      const msg = String((body as { message?: string }).message ?? "");
      throw new Error(
        /rate limit/i.test(msg)
          ? "GitHub rate limit reached. Try again in a few minutes."
          : `GitHub refused the request: ${msg || res.status}`,
      );
    }
    if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
    return body;
  };

  const info = (await get(base)) as { default_branch?: string };
  const defaultBranch = info.default_branch ?? "main";
  let raw: { name: string; protected?: boolean }[] = [];
  try {
    raw = (await get(`${base}/branches?per_page=${MAX_BRANCHES}`)) as typeof raw;
  } catch {
    raw = [];
  }
  if (!Array.isArray(raw)) raw = [];
  const branches = raw
    .map((b) => ({ name: b.name, protected: Boolean(b.protected) }))
    .filter((b) => b.name !== defaultBranch)
    .sort((a, b) => a.name.localeCompare(b.name));
  const def = raw.find((b) => b.name === defaultBranch);
  return {
    defaultBranch,
    branches: [{ name: defaultBranch, protected: Boolean(def?.protected) }, ...branches],
    more: raw.length >= MAX_BRANCHES,
  };
}
