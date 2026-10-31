import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const header = /^(feat|fix|perf|docs|chore|ci|build|refactor|style|test|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S[^\r\n]*$/;

export function checkPullRequest(pr: { title: string; body?: string | null }): void {
  if (!header.test(pr.title)) {
    throw new Error("Use a Conventional Commit PR title: type(scope): description, or type(scope)!: breaking change");
  }
  if (/^BREAKING[ -]CHANGE:\s*\S/m.test(pr.body ?? "") && !/!:/u.test(pr.title)) {
    throw new Error("Put ! before the colon in the PR title when the body declares a breaking change");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as { pull_request: { title: string; body?: string | null } };
  checkPullRequest(event.pull_request);
  console.log("PR title follows the release guidelines");
}
