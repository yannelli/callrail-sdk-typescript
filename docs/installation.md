# Installation

The `callrail` package is a typed Node.js client for the CallRail API v3. It has no runtime dependencies.

## Check the requirements

You need the following:

- Node.js 20 or later. The client uses the global `fetch`, `FormData`, `Blob`, and `AbortSignal` that Node.js 20 provides.
- An ES module project. The package is published as ES modules only. From a CommonJS file, load it with `await import("callrail")`.
- TypeScript 5.0 or later, if you write TypeScript. The type declarations ship inside the package.

## Install the package

```bash
npm install callrail
```

## Configure TypeScript

The package's three entry points are `callrail`, `callrail/webhooks`, and `callrail/testing`. They are declared in the `exports` field of its `package.json`, and TypeScript reads that field only under the `NodeNext` and `bundler` module resolution modes. Use `NodeNext` for code that Node.js runs directly.

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  }
}
```

If a bundler builds your app, set `"moduleResolution": "bundler"` instead. Every example in these docs compiles under `strict`.

## Make a first request

CallRail API keys belong to a user and see the same data that user sees in the CallRail app. Create a key in your CallRail settings and put it in the `CALLRAIL_API_KEY` environment variable. Treat the key like a password.

Save this program as `first-request.ts`.

```ts
import { CallRail } from "callrail";

const apiKey = process.env.CALLRAIL_API_KEY;
if (!apiKey) throw new Error("Set CALLRAIL_API_KEY to an API key from your CallRail settings.");

const callrail = new CallRail({ apiKey });
const accounts = await callrail.accounts.list();

for (const account of accounts.items) {
  console.log(account.id, account.name);
}
```

Compile it with `tsc` and run the output with `node`. The program prints the id and name of every account the key can see, one per line.

Next, read [Configuration](configuration.md) to set up the client module that the rest of these docs import.
