# Contributing to callrail

Thank you for your help with `callrail`, the TypeScript client for the CallRail API v3. This guide tells you how to report a problem, set up the project, and send a pull request.

## Report a bug or ask for a feature

Open an issue on [GitHub](https://github.com/yannelli/callrail-sdk-typescript/issues/new/choose) and select a template. For a bug, give the package version, the Node.js version, the method you called, and the result you expected.

Remove API keys, account ids, phone numbers, and customer names from logs before you paste them.

To report a security vulnerability, do not open a public issue. Follow the steps in [SECURITY.md](SECURITY.md).

## Set up the project

You need Node.js 20 or later and npm.

```bash
git clone https://github.com/yannelli/callrail-sdk-typescript.git
cd callrail-sdk-typescript
npm ci
```

The package has no runtime dependencies. The development dependencies are TypeScript and the type declarations for Node.js and Express.

## Run the checks

Run these four commands before you send a pull request. Each one must pass.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Compiles `src/`, `test/`, and `scripts/`, with the type tests in `test/illegal-states.test-d.ts`. |
| `npm test` | Compiles the tests to `.test-dist/` and runs them with the Node.js test runner. |
| `npm run build` | Compiles `src/` to `dist/`, with type declarations. |
| `npm run docs:check` | Compiles each `ts` example in the Markdown files and checks links, API coverage, and punctuation. |

The tests do not send requests to CallRail. Each test gives the client the scripted `fakeFetch` from `src/testing.ts`, then compares the recorded request and the decoded result with the expected values.

## Know the project layout

| Path | Contents |
| --- | --- |
| `src/client.ts` | The `CallRail` class and the `AccountClient` that `callrail.account(id)` returns. |
| `src/http.ts` | Requests, timeouts, retries, and options. |
| `src/errors.ts` | `CallRailError` and the `Problem` union. |
| `src/decode.ts` | The decoders that change CallRail's JSON into typed records. |
| `src/ids.ts` | The branded id types and their constructors. |
| `src/pagination.ts` | Offset and relative pages. |
| `src/query.ts` | Shared query types, such as dates, sorts, and tag changes. |
| `src/resources/` | One file for each API resource. |
| `src/webhooks.ts` | The `callrail/webhooks` entry point. |
| `src/testing.ts` | The `callrail/testing` entry point. |
| `test/operations.ts` | The catalog of all API operations, with the HTTP method and path of each. |
| `docs/` | One chapter for each topic and each resource. |
| `scripts/check-docs.ts` | The checker that `npm run docs:check` runs. |

## Add or change an API operation

1. Add or change the method in the resource file in `src/resources/`.
2. Add a row to `test/operations.ts` with the method name, the HTTP method, and the path.
3. Change the operation count in `test/catalog.test.ts`.
4. Add tests to the resource test file. Check the request that the client sends and the result that it decodes.
5. Add an example that calls the method to the chapter of the resource in `docs/`.
6. Run the four checks.

The chapter for an operation has the kebab-case name of its resource. For example, `formSubmissions.create` goes in `docs/form-submissions.md`. If a chapter has no example that calls the operation, `npm run docs:check` fails.

## Write the documentation

Write the documentation in [ASD-STE100 Simplified Technical English](https://asd-ste100.org/), with US spelling. Obey these rules:

- Write short sentences. Use a maximum of 20 words in an instruction and 25 words in a description.
- Use the imperative for an instruction, such as "Pass `signal` in the query."
- Use the active voice and the simple present tense.
- Use one term for one thing. For example, always write "API key", not "token" or "secret".
- Give facts. Do not add filler words, hedges, or promotional words.
- Put a condition before the action, such as "If the request fails, read `problem.kind`."

The checker also rejects long dashes, semicolons, curly quotes, and colons in the middle of a line.

Fence each TypeScript example as `ts`. The checker compiles each `ts` block under `strict`. To let other examples import a block, start the block with a file comment, such as `// callrail.ts`. Then other blocks import it as `./callrail.js`. A file name can belong to only one example.

## Send a pull request

1. Fork the repository and make a branch from `main`.
2. Make one change in each pull request.
3. Add an entry under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for a change that users can see.
4. Write the commit message in the [Conventional Commits](https://www.conventionalcommits.org/) format, such as `fix(calls): send value as a two-decimal string`.
5. Run the four checks.
6. Open the pull request and complete the template.

## License

When you send a contribution, you agree to license it under the [MIT License](LICENSE) of this project.
