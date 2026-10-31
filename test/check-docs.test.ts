import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anchorOf,
  brokenLinks,
  chapterFor,
  extractExamples,
  styleViolations,
  untaught,
  type Example,
  type Page,
} from "../scripts/check-docs.js";
import { operations, type Operation } from "./operations.js";

function row(name: string): Operation {
  const operation = operations.find((candidate) => candidate.name === name);
  assert.ok(operation, `operations.ts has a ${name} row`);
  return operation;
}

test("extractExamples keeps ts blocks in order and names a block by its file comment", () => {
  const markdown = [
    "# Calls",
    "",
    "```bash",
    "npm install callrail",
    "```",
    "",
    "```ts",
    "// callrail.ts",
    "export const x = 1;",
    "```",
    "",
    "Prose between examples.",
    "",
    "```ts",
    'import { x } from "./callrail.js";',
    "console.log(x);",
    "```",
    "",
  ].join("\n");

  assert.deepEqual(extractExamples("calls", markdown), [
    { chapter: "calls", index: 1, file: "callrail.ts", source: "// callrail.ts\nexport const x = 1;\n" },
    { chapter: "calls", index: 2, file: "calls-2.ts", source: 'import { x } from "./callrail.js";\nconsole.log(x);\n' },
  ]);
  assert.deepEqual(extractExamples("calls", markdown.replaceAll("\n", "\r\n")), [
    { chapter: "calls", index: 1, file: "callrail.ts", source: "// callrail.ts\nexport const x = 1;\n" },
    { chapter: "calls", index: 2, file: "calls-2.ts", source: 'import { x } from "./callrail.js";\nconsole.log(x);\n' },
  ]);
});

test("chapterFor kebab-cases the resource before the dot", () => {
  assert.deepEqual(
    ["formSubmissions.create", "accounts.list", "integrationFilters.get", "callerIds.delete"].map((name) => chapterFor(row(name))),
    ["form-submissions", "accounts", "integration-filters", "caller-ids"],
  );
});

test("untaught counts only a resource-qualified call inside the operation's own chapter", () => {
  const example = (chapter: string, source: string): Example => ({ chapter, index: 1, file: `${chapter}-1.ts`, source });
  const examples = [
    example("calls", "await account.calls.list();\nawait account.tags.list();\n"),
    example("tags", "await account.tags.delete(TagId(1));\nawait list();\n"),
  ];

  assert.deepEqual(untaught(examples, [row("calls.list"), row("tags.list"), row("tags.delete"), row("calls.get")]), [
    "tags.list",
    "calls.get",
  ]);
});

test("anchorOf matches the anchor GitHub gives a heading", () => {
  assert.deepEqual(
    ["Read a conversation's lead status", "Handle a missing `company_id`", "Receive a webhook in a route handler"].map(anchorOf),
    ["read-a-conversations-lead-status", "handle-a-missing-company_id", "receive-a-webhook-in-a-route-handler"],
  );
});

test("brokenLinks reports a missing page or heading and skips URLs, inline code, and fences", () => {
  const pages: Page[] = [
    {
      path: "README.md",
      markdown: [
        "# callrail",
        "",
        "## Install",
        "",
        "- [Calls](docs/calls.md)",
        "- [List calls](docs/calls.md#list-calls)",
        "- [Gone](docs/gone.md)",
        "- [Stale](docs/calls.md#get-a-call)",
        "- [Comment](#install-it)",
        "- [CallRail](https://apidocs.callrail.com/)",
        "- `[Code](docs/nowhere.md)` is code.",
        "",
        "```bash",
        "# install it",
        "echo [Fenced](docs/nowhere.md)",
        "```",
      ].join("\n"),
    },
    {
      path: "docs/calls.md",
      markdown: ["# Calls", "", "## List calls", "", "See [install](../README.md#install), [below](#list-calls), and [tags](tags.md#apply-tags)."].join("\n"),
    },
  ];

  assert.deepEqual(brokenLinks(pages), [
    "README.md:7 links to docs/gone.md, but docs/gone.md is not a checked page or a file in the repository.",
    "README.md:8 links to docs/calls.md#get-a-call, but docs/calls.md has no heading with that anchor.",
    "README.md:9 links to #install-it, but README.md has no heading with that anchor.",
    "docs/calls.md:5 links to tags.md#apply-tags, but docs/tags.md is not a checked page or a file in the repository.",
  ]);
});

test("brokenLinks accepts a link to a repository file without an anchor", () => {
  const pages: Page[] = [
    { path: "CONTRIBUTING.md", markdown: ["# Contributing", "", "Read the [License](LICENSE) and the [section](LICENSE#terms)."].join("\n") },
  ];

  assert.deepEqual(brokenLinks(pages, new Set(["LICENSE"])), [
    "CONTRIBUTING.md:3 links to LICENSE#terms, but LICENSE is not a checked page, so it has no headings.",
  ]);
});

test("styleViolations flags banned punctuation in prose and ignores code, link targets, URLs, and fences", () => {
  const page: Page = {
    path: "docs/calls.md",
    markdown: [
      "# Calls",
      "",
      "Each call has these fields:",
      "",
      'Pass `dateRange: "today"` or read [the table](https://apidocs.callrail.com/#calls:list).',
      "Open https://app.callrail.com:443/calls in a browser.",
      "Calls are listed newest first; texts are not.",
      "A call \u2014 or a text.",
      "Set \u201cdirection\u201d to inbound.",
      "Note: the list is paginated.",
      "",
      "```ts",
      "const a = { b: 1 }; // \u2014 \u201cc\u201d",
      "```",
    ].join("\n"),
  };

  assert.deepEqual(styleViolations(page), [
    "docs/calls.md:7 uses a semicolon. Split it into two sentences.",
    "docs/calls.md:8 uses a long dash. Use a period or a comma instead.",
    "docs/calls.md:9 uses a curly quote. Use a straight quote.",
    "docs/calls.md:10 uses a colon mid-line. End the sentence instead, or put the value in code.",
  ]);
});
