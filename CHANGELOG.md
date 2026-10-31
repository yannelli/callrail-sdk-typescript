# Changelog

This file records each change that users can see. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- A typed client for 71 HTTP operations of the CallRail API v3.
- Branded id types, such as `CallId` and `CompanyId`, with constructors that reject empty strings, negative numbers, and fractions.
- `CallRailError` with a typed `problem` union for each failure kind.
- Offset and relative pagination with `for await` and `next()`.
- Retries for `GET` requests after network errors, timeouts, and 500, 502, 503, and 504 responses. Writes never retry.
- `callrail/webhooks`, which makes a check of the CallRail signature before it decodes a webhook.
- `callrail/testing`, with a scripted `fakeFetch` that records each request.
