import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { operations, type Operation } from "../test/operations.js";

export interface Example {
  readonly chapter: string;
  readonly index: number;
  readonly file: string;
  readonly source: string;
}

const tsFence = /^```ts\n([\s\S]*?)^```$/gm;
const fileComment = /^\/\/ ([\w.-]+\.ts)\n/;
const uncheckedFence = /^```(typescript|tsx|js|jsx|javascript|mjs)\s*$/gm;

export function extractExamples(chapter: string, markdown: string): readonly Example[] {
  const text = markdown.replaceAll("\r\n", "\n");
  return [...text.matchAll(tsFence)].map((match, position) => {
    const source = match[1] ?? "";
    const index = position + 1;
    return { chapter, index, file: fileComment.exec(source)?.[1] ?? `${chapter}-${index}.ts`, source };
  });
}

export function chapterFor(operation: Operation): string {
  const resource = operation.name.slice(0, operation.name.indexOf("."));
  return resource.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function untaught(examples: readonly Example[], operations: readonly Operation[]): readonly string[] {
  return operations
    .filter((operation) => {
      const chapter = chapterFor(operation);
      const call = `.${operation.name}(`;
      return !examples.some((example) => example.chapter === chapter && example.source.includes(call));
    })
    .map((operation) => operation.name);
}

export interface Page {
  readonly path: string;
  readonly markdown: string;
}

export function anchorOf(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/ /g, "-");
}

function unfencedLines(markdown: string): readonly { readonly line: number; readonly text: string }[] {
  let fenced = false;
  return markdown.split("\n").flatMap((text, index) => {
    if (text.startsWith("```")) {
      fenced = !fenced;
      return [];
    }
    return fenced ? [] : [{ line: index + 1, text }];
  });
}

export function brokenLinks(pages: readonly Page[], files: ReadonlySet<string> = new Set()): readonly string[] {
  const anchors = new Map(
    pages.map((page) => [
      page.path,
      new Set(unfencedLines(page.markdown).flatMap(({ text }) => (/^#{1,6} /.test(text) ? [anchorOf(text.replace(/^#+ /, ""))] : []))),
    ]),
  );
  return pages.flatMap((page) =>
    unfencedLines(page.markdown).flatMap(({ line, text }) =>
      [...text.replace(/`[^`]*`/g, "").matchAll(/\]\(([^)\s]+)\)/g)].flatMap(([, target = ""]) => {
        if (/^[a-z]+:/.test(target)) return [];
        const [file = "", anchor] = target.split("#");
        const resolved = file === "" ? page.path : posix.normalize(posix.join(posix.dirname(page.path), file));
        const headings = anchors.get(resolved);
        if (headings === undefined && files.has(resolved)) {
          return anchor === undefined ? [] : [`${page.path}:${line} links to ${target}, but ${resolved} is not a checked page, so it has no headings.`];
        }
        if (headings === undefined) return [`${page.path}:${line} links to ${target}, but ${resolved} is not a checked page or a file in the repository.`];
        if (anchor !== undefined && !headings.has(anchor)) return [`${page.path}:${line} links to ${target}, but ${resolved} has no heading with that anchor.`];
        return [];
      }),
    ),
  );
}

const punctuation: readonly (readonly [RegExp, string])[] = [
  [/[\u2013\u2014]/, "uses a long dash. Use a period or a comma instead."],
  [/;/, "uses a semicolon. Split it into two sentences."],
  [/[\u2018\u2019\u201c\u201d]/, "uses a curly quote. Use a straight quote."],
  [/:(?!\s*$)/, "uses a colon mid-line. End the sentence instead, or put the value in code."],
];

export function styleViolations(page: Page): readonly string[] {
  return unfencedLines(page.markdown).flatMap(({ line, text }) => {
    const prose = text
      .replace(/`[^`]*`/g, "code")
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/https?:\/\/\S+/g, "url");
    return punctuation.flatMap(([pattern, problem]) => (pattern.test(prose) ? [`${page.path}:${line} ${problem}`] : []));
  });
}

export function main(): void {
  const root = process.cwd();
  const topLevel = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile());
  const pagesAtRoot = topLevel
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort()
    .map((name) => ({ chapter: name.slice(0, -".md".length).toLowerCase(), path: name }));
  const chapters = readdirSync(join(root, "docs"))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({ chapter: name.slice(0, -".md".length), path: join("docs", name) }));
  const sources = [{ chapter: "readme", path: "README.md" }, ...pagesAtRoot, ...chapters].map((source) => ({
    ...source,
    markdown: readFileSync(join(root, source.path), "utf8").replaceAll("\r\n", "\n"),
  }));

  const failures: string[] = [];
  for (const { path, markdown } of sources) {
    for (const [, language] of markdown.matchAll(uncheckedFence)) {
      failures.push(`${path} fences code as ${language}. Use ts so the example is compiled.`);
    }
  }
  const examples = sources.flatMap(({ chapter, markdown }) => extractExamples(chapter, markdown));
  const owners = new Map<string, string[]>();
  for (const example of examples) owners.set(example.file, [...(owners.get(example.file) ?? []), example.chapter]);
  for (const [file, chapterNames] of owners) {
    if (chapterNames.length > 1) failures.push(`${file} is declared by more than one example, in ${chapterNames.join(", ")}.`);
  }
  for (const name of untaught(examples, operations)) {
    const operation = operations.find((row) => row.name === name);
    const chapter = operation === undefined ? "its chapter" : `docs/${chapterFor(operation)}.md`;
    failures.push(`${name} has no example in ${chapter}. Call it as .${name}( in a ts block there.`);
  }
  const pages = sources.map(({ path, markdown }) => ({ path: path.split("\\").join("/"), markdown }));
  const files = new Set(topLevel.map((entry) => entry.name).filter((name) => !name.endsWith(".md")));
  failures.push(...brokenLinks(pages, files), ...pages.flatMap(styleViolations));

  const out = join(root, ".docs-check");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const example of examples) writeFileSync(join(out, example.file), example.source);

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return;
  }
  console.log(
    `docs:check found ${examples.length} examples in ${sources.length} files and ${operations.length} of ${operations.length} operations taught. Compiling .docs-check next.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
