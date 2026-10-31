import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkPullRequest } from "../scripts/check-pr.js";
import { commitAuthors, nextVersion, release, releaseNotes, releaseType } from "../scripts/release.js";

test("releaseType reads Conventional Commit headers", () => {
  assert.equal(releaseType("feat: add trackers"), "minor");
  assert.equal(releaseType("fix(calls): decode duration"), "patch");
  assert.equal(releaseType("perf: reuse agents"), "patch");
  assert.equal(releaseType("revert: undo retries"), "patch");
  assert.equal(releaseType("feat!: rename client"), "major");
  assert.equal(releaseType("refactor: split http\n\nBREAKING CHANGE: drops Node 18"), "major");
  assert.equal(releaseType("docs: fix typo"), null);
  assert.equal(releaseType("chore(release): 0.2.0"), null);
  assert.equal(releaseType("Update README"), null);
});

test("nextVersion takes the highest bump", () => {
  assert.equal(nextVersion("0.1.0", [{ message: "fix: a" }]), "0.1.1");
  assert.equal(nextVersion("0.1.1", [{ message: "fix: a" }, { message: "feat: b" }]), "0.2.0");
  assert.equal(nextVersion("0.2.0", [{ message: "feat!: c" }, { message: "fix: d" }]), "1.0.0");
  assert.equal(nextVersion("1.0.0", [{ message: "docs: e" }]), null);
  assert.throws(() => nextVersion("1.0", []), /Invalid stable version/);
});

test("commitAuthors keeps co-authors and drops bots", () => {
  const authors = commitAuthors("Ryan", "ryan@example.com", "feat: x\n\nCo-authored-by: Sam <sam@example.com>\nCo-authored-by: bot[bot] <1+bot[bot]@users.noreply.github.com>");
  assert.deepEqual(authors.map((author) => author.name), ["Ryan", "Sam"]);
});

test("releaseNotes groups commits and credits contributors", () => {
  const ryan = { name: "Ryan", email: "r@example.com", login: "yannelli" };
  const notes = releaseNotes("0.2.0", "v0.1.0", [
    { hash: "a".repeat(40), message: "feat: add trackers", authors: [ryan] },
    { hash: "b".repeat(40), message: "fix: decode duration", authors: [{ name: "Sam", email: "s@example.com" }] },
    { hash: "c".repeat(40), message: "docs: typo", authors: [ryan] },
  ]);
  assert.match(notes, /^# 0\.2\.0\n\n## Features\n\n- feat: add trackers \(aaaaaaa\) by @yannelli\n/);
  assert.match(notes, /## Fixes and performance\n\n- fix: decode duration \(bbbbbbb\) by Sam\n/);
  assert.doesNotMatch(notes, /docs: typo/);
  assert.match(notes, /## Contributors\n\n- @yannelli\n- Sam\n/);
  assert.match(notes, /Changes since v0\.1\.0\.\n$/);
  assert.match(releaseNotes("0.1.0", undefined, []), /First release\.\n$/);
});

test("checkPullRequest accepts Conventional titles only", () => {
  checkPullRequest({ title: "feat(calls): add recordings" });
  checkPullRequest({ title: "fix!: drop Node 18", body: "BREAKING CHANGE: Node 20 is required." });
  assert.throws(() => checkPullRequest({ title: "Add recordings" }), /Conventional Commit/);
  assert.throws(() => checkPullRequest({ title: "feat: x", body: "BREAKING CHANGE: y" }), /Put !/);
});

function fixture(): { root: string; work: string; git: (...args: string[]) => string; commit: (message: string) => void } {
  const root = mkdtempSync(join(tmpdir(), "callrail-release-test-"));
  const work = join(root, "work");
  const run = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  run(root, "init", "-q", "--bare", "-b", "main", "remote.git");
  run(root, "init", "-q", "-b", "main", "work");
  const git = (...args: string[]): string => run(work, ...args);
  git("config", "user.name", "Ryan");
  git("config", "user.email", "r@example.com");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("remote", "add", "origin", join(root, "remote.git"));
  const name = "@yannelli/callrail";
  writeFileSync(join(work, "package.json"), `${JSON.stringify({ name, version: "0.1.0" }, null, 2)}\n`);
  writeFileSync(join(work, "package-lock.json"), `${JSON.stringify({ name, version: "0.1.0", lockfileVersion: 3, packages: { "": { name, version: "0.1.0" } } }, null, 2)}\n`);
  let count = 0;
  const commit = (message: string): void => {
    writeFileSync(join(work, `file-${count++}.txt`), message);
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  commit("feat: initial client");
  return { root, work, git, commit };
}

function fakeGitHub(): { fetch: typeof fetch; created: unknown[] } {
  const created: unknown[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith("/graphql")) return new Response(JSON.stringify({ data: { repository: {} } }));
    if (href.includes("/releases/tags/")) {
      const tag = href.split("/").at(-1);
      return new Response("{}", { status: created.some((body) => (body as { tag_name: string }).tag_name === tag) ? 200 : 404 });
    }
    created.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ html_url: "https://github.com/yannelli/callrail-sdk-typescript/releases/x" }), { status: 201 });
  }) as typeof fetch;
  return { fetch: fake, created };
}

const env = { GITHUB_REPOSITORY: "yannelli/callrail-sdk-typescript", GH_TOKEN: "token" };
const quiet = (): void => {};

test("release tags the manifest version first, then bumps from commits", async () => {
  const { root, work, git, commit } = fixture();
  try {
    assert.equal(await release({ cwd: work, log: quiet }), "0.1.0");
    const github = fakeGitHub();
    assert.equal(await release({ dryRun: false, cwd: work, env, fetch: github.fetch, log: quiet }), "0.1.0");
    assert.equal(git("ls-remote", "--tags", "origin").includes("refs/tags/v0.1.0"), true);
    assert.equal(git("log", "-1", "--format=%s"), "feat: initial client");

    commit("docs: typo");
    assert.equal(await release({ dryRun: false, cwd: work, env, fetch: github.fetch, log: quiet }), null);

    commit("fix: decode duration");
    commit("feat: add trackers");
    assert.equal(await release({ dryRun: false, cwd: work, env, fetch: github.fetch, log: quiet }), "0.2.0");
    assert.equal(git("log", "-1", "--format=%s"), "chore(release): 0.2.0");
    assert.equal(JSON.parse(readFileSync(join(work, "package-lock.json"), "utf8")).packages[""].version, "0.2.0");
    assert.equal(git("rev-parse", "origin/main"), git("rev-parse", "HEAD"));
    const tagNotes = git("for-each-ref", "refs/tags/v0.2.0", "--format=%(contents)");
    assert.match(tagNotes, /^# 0\.2\.0\n\n## Features/);
    assert.deepEqual(github.created.map((body) => (body as { tag_name: string }).tag_name), ["v0.1.0", "v0.2.0"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release refuses a dirty checkout or a mismatched manifest", async () => {
  const { root, work, git } = fixture();
  try {
    writeFileSync(join(work, "stray.txt"), "x");
    await assert.rejects(release({ cwd: work, log: quiet }), /must be clean/);
    rmSync(join(work, "stray.txt"));
    git("tag", "-a", "v0.0.9", "-m", "old");
    await assert.rejects(release({ cwd: work, log: quiet }), /does not match v0\.0\.9/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
