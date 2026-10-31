# Changelog

This file records the first release. The versions follow [Semantic Versioning](https://semver.org/). The notes for each later release are on [GitHub Releases](https://github.com/yannelli/callrail-sdk-typescript/releases). The release workflow makes them from the Conventional Commit messages.

## 0.1.0

### Added

- A typed client for 71 HTTP operations of the CallRail API v3.
- Branded id types, such as `CallId` and `CompanyId`, with constructors that reject empty strings, negative numbers, and fractions.
- `CallRailError` with a typed `problem` union for each failure kind.
- Offset and relative pagination with `for await` and `next()`.
- Retries for `GET` requests after network errors, timeouts, and 500, 502, 503, and 504 responses. Writes never retry.
- `@yannelli/callrail/webhooks`, which checks the CallRail signature before it decodes a webhook.
- `@yannelli/callrail/testing`, with a scripted `fakeFetch` that records each request.
