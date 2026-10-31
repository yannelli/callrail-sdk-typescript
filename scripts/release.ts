import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type ReleaseType = "major" | "minor" | "patch";
export interface Author { name: string; email: string; login?: string }
export interface Commit { hash: string; message: string; authors: Author[] }
export interface ReleaseOptions {
  dryRun?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

export const manifestPaths = ["package.json", "package-lock.json"] as const;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const levels: Record<ReleaseType, number> = { patch: 1, minor: 2, major: 3 };
const releaseMarker = "<!-- callrail-release -->";

export function releaseType(message: string): ReleaseType | null {
  const header = /^([a-z]+)(?:\([^\r\n()]+\))?(!)?: \S[^\r\n]*/.exec(message);
  if (!header) return null;
  if (header[2] || /^BREAKING[ -]CHANGE: \S/m.test(message)) return "major";
  if (header[1] === "feat") return "minor";
  if (["fix", "perf", "revert"].includes(header[1] ?? "")) return "patch";
  return null;
}

export function nextVersion(version: string, commits: readonly Pick<Commit, "message">[]): string | null {
  if (!stableVersion.test(version)) throw new Error(`Invalid stable version: ${version}`);
  let highest: ReleaseType | null = null;
  for (const { message } of commits) {
    const current = releaseType(message);
    if (current && (!highest || levels[current] > levels[highest])) highest = current;
  }
  if (!highest) return null;
  const [major = 0n, minor = 0n, patch = 0n] = version.split(".").map(BigInt);
  if (highest === "major") return `${major + 1n}.0.0`;
  if (highest === "minor") return `${major}.${minor + 1n}.0`;
  return `${major}.${minor}.${patch + 1n}`;
}

export function commitAuthors(name: string, email: string, message: string): Author[] {
  const authors: Author[] = [{ name, email }];
  for (const match of message.matchAll(/^Co-authored-by:\s*(.*?)\s*<([^>\n]+)>\s*$/gim)) {
    authors.push({ name: match[1] ?? "", email: match[2] ?? "" });
  }
  // Bots and no-reply service addresses are not people to credit.
  return authors.filter((author) => !/\[bot\]/i.test(`${author.name} ${author.email}`) && !/^no-?reply@/i.test(author.email));
}

function uniqueAuthors(authors: readonly Author[]): Author[] {
  const seen = new Map<string, Author>();
  for (const author of authors) {
    const key = (author.login ?? author.email).toLowerCase();
    if (!seen.has(key)) seen.set(key, author);
  }
  return [...seen.values()];
}

const mention = (author: Author): string => (author.login ? `@${author.login}` : author.name);

export function releaseNotes(version: string, previousTag: string | undefined, commits: readonly Commit[]): string {
  const sections: [string, ReleaseType][] = [["Breaking changes", "major"], ["Features", "minor"], ["Fixes and performance", "patch"]];
  const notes = [`# ${version}`, ""];
  for (const [title, type] of sections) {
    const matching = commits.filter(({ message }) => releaseType(message) === type);
    if (!matching.length) continue;
    notes.push(`## ${title}`, "");
    for (const { hash, message, authors } of matching) {
      const [subject, ...body] = message.split("\n");
      const credit = uniqueAuthors(authors).map(mention).join(", ");
      notes.push(`- ${subject} (${hash.slice(0, 7)})${credit ? ` by ${credit}` : ""}`);
      if (type === "major" && body.join("\n").trim()) notes.push("", ...body.map((line) => `  ${line}`), "");
    }
    notes.push("");
  }
  const contributors = uniqueAuthors(commits.flatMap(({ authors }) => authors));
  if (contributors.length) notes.push("## Contributors", "", ...contributors.map((author) => `- ${mention(author)}`), "");
  notes.push(previousTag ? `Changes since ${previousTag}.` : "First release.", "");
  return notes.join("\n");
}

interface Manifest { version?: unknown; packages?: Record<string, { version?: unknown }> }

function readManifests(cwd: string): [Manifest, Manifest] {
  const [pkg, lock] = manifestPaths.map((path) => JSON.parse(readFileSync(join(cwd, path), "utf8")) as Manifest);
  if (!pkg || !lock) throw new Error("package.json and package-lock.json are required");
  const versions = [pkg.version, lock.version, lock.packages?.[""]?.version];
  if (!versions.every((version) => typeof version === "string" && stableVersion.test(version))) {
    throw new Error("Missing stable SemVer version in package manifests");
  }
  if (new Set(versions).size !== 1) throw new Error("Package and lockfile versions must match");
  return [pkg, lock];
}

function writeVersion(cwd: string, version: string): void {
  const documents = readManifests(cwd);
  documents[0].version = version;
  documents[1].version = version;
  const root = documents[1].packages?.[""];
  if (root) root.version = version;
  manifestPaths.forEach((path, index) => writeFileSync(join(cwd, path), `${JSON.stringify(documents[index], null, 2)}\n`));
}

export async function release(options: ReleaseOptions = {}): Promise<string | null> {
  const { dryRun = true, cwd = process.cwd(), env = process.env, fetch: request = fetch, log = console.log } = options;
  const git = (...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const commitsSince = (tag: string | undefined): Commit[] => {
    const records = git("log", ...(tag ? [`${tag}..HEAD`] : []), "--format=%H%x00%an%x00%ae%x00%B%x00").split("\0");
    const commits: Commit[] = [];
    for (let i = 0; i + 3 < records.length; i += 4) {
      const message = (records[i + 3] ?? "").trim();
      commits.push({ hash: (records[i] ?? "").trim(), message, authors: commitAuthors(records[i + 1] ?? "", records[i + 2] ?? "", message) });
    }
    return commits;
  };
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY ?? "";
  const api = `${env.GITHUB_API_URL || "https://api.github.com"}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

  async function githubLogins(commits: readonly Commit[]): Promise<Map<string, string>> {
    const [owner, name] = repository.split("/");
    const logins = new Map<string, string>();
    for (let start = 0; start < commits.length; start += 50) {
      const fields = commits.slice(start, start + 50).map(({ hash }, index) =>
        `c${index}: object(oid: "${hash}") { ... on Commit { authors(first: 20) { nodes { email user { login } } } } }`);
      const response = await request(`${api}/graphql`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query: `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join(" ")} } }`, variables: { owner, name } }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      type Nodes = { authors: { nodes: { email: string; user: { login: string } | null }[] } } | null;
      const body = (await response.json()) as { data?: { repository: Record<string, Nodes> }; errors?: { message: string }[] };
      if (body.errors?.length) throw new Error(body.errors[0]?.message);
      for (const commit of Object.values(body.data?.repository ?? {})) {
        for (const node of commit?.authors.nodes ?? []) if (node.user?.login) logins.set(node.email.toLowerCase(), node.user.login);
      }
    }
    return logins;
  }

  async function creditLogins(commits: Commit[]): Promise<Commit[]> {
    try {
      const logins = await githubLogins(commits);
      return commits.map((commit) => ({
        ...commit,
        authors: commit.authors.map((author) => {
          const login = logins.get(author.email.toLowerCase());
          return login ? { ...author, login } : author;
        }),
      }));
    } catch (error) {
      log(`Could not look up GitHub logins, so release notes credit authors by name: ${(error as Error).message}`);
      return commits;
    }
  }

  async function publishRelease(tag: string, notes: string): Promise<void> {
    const endpoint = `${api}/repos/${repository}/releases`;
    const existing = await request(`${endpoint}/tags/${tag}`, { headers });
    if (existing.ok) return log(`GitHub release ${tag} already exists`);
    if (existing.status !== 404) throw new Error(`GitHub release lookup failed: HTTP ${existing.status}`);
    const response = await request(endpoint, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ tag_name: tag, name: tag, body: notes, draft: false, prerelease: false, make_latest: "true" }),
    });
    if (!response.ok) throw new Error(`GitHub release creation failed: HTTP ${response.status}: ${await response.text()}`);
    log(`Published ${((await response.json()) as { html_url: string }).html_url}`);
  }

  if (git("branch", "--show-current") !== "main") throw new Error("Releases run from main");
  if (git("status", "--porcelain")) throw new Error("Release checkout must be clean");
  const currentVersion = readManifests(cwd)[0].version as string;
  const previous = git("tag", "--merged", "HEAD", "--sort=-version:refname", "--list", "v*")
    .split("\n").find((tag) => stableVersion.test(tag.slice(1)) && tag.startsWith("v"));
  if (previous && `v${currentVersion}` !== previous) throw new Error(`Manifest version ${currentVersion} does not match ${previous}`);
  if (!dryRun) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY must be owner/repo");
    if (!token) throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
    // A retry repairs a release whose tag was pushed before GitHub publication failed.
    if (previous) {
      const annotation = git("for-each-ref", `refs/tags/${previous}`, "--format=%(contents)");
      if (annotation.includes(releaseMarker)) await publishRelease(previous, annotation.replace(releaseMarker, "").trim());
    }
  }
  // With no tag yet, the first release takes the manifest version as it is.
  const version = previous ? nextVersion(currentVersion, commitsSince(previous)) : currentVersion;
  if (!version) {
    log(`No release-triggering commits since ${previous}`);
    return null;
  }
  const commits = commitsSince(previous);
  const notes = releaseNotes(version, previous, dryRun ? commits : await creditLogins(commits));
  if (dryRun) {
    log(notes);
    return version;
  }
  if (version !== currentVersion) {
    writeVersion(cwd, version);
    git("add", "--", ...manifestPaths);
    git("commit", "-m", `chore(release): ${version}`);
  }
  const directory = mkdtempSync(join(tmpdir(), "callrail-release-notes-"));
  const notesPath = join(directory, "notes.md");
  try {
    writeFileSync(notesPath, `${notes}\n${releaseMarker}\n`);
    // Verbatim keeps the Markdown headings, which git would strip as comments.
    git("tag", "-a", "--cleanup=verbatim", `v${version}`, "-F", notesPath);
    git("push", "--atomic", "origin", "HEAD:refs/heads/main", `refs/tags/v${version}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  await publishRelease(`v${version}`, notes);
  return version;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--publish", "--dry-run"].includes(args[0] ?? "")) {
    throw new Error("Usage: npm run release -- --dry-run|--publish");
  }
  await release({ dryRun: args[0] === "--dry-run" });
}
