# Security policy

## Supported versions

Security fixes go into the latest release of `@yannelli/callrail`. Upgrade to the latest release to get them.

## Report a vulnerability

Do not report a vulnerability in a public issue, a pull request, or a discussion.

1. Go to the [private vulnerability report form](https://github.com/yannelli/callrail-sdk-typescript/security/advisories/new) of this repository.
2. Describe the vulnerability and the version that has it.
3. Give the steps or the code that show the problem.
4. Remove real API keys, webhook signing keys, and customer data from the report.

The maintainer replies in the advisory. When a fix is available, the maintainer publishes a release and the advisory.

## Scope

Report problems in this package, such as these:

- An API key that goes to a host other than the configured `baseUrl`, or into a URL or a log.
- A webhook that `@yannelli/callrail/webhooks` accepts without a correct signature.
- A decoded value that does not agree with the type that the client gives it.

Report problems in the CallRail service or the CallRail app to CallRail. This package is not a CallRail product.
