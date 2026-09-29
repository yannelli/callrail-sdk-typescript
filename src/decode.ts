/**
 * The boundary. Every value that arrives from CallRail passes through a decoder
 * here before it becomes a domain value, and nothing past this module checks it
 * again.
 *
 * Domain interfaces are the source of truth. A resource module writes its
 * decoder table as `{ ... } satisfies Shape<Company>`, so the compiler proves
 * that every property has a decoder of exactly its type and that no property is
 * forgotten. Wire keys are derived from the domain key (`timeZone` becomes
 * `time_zone`). `wire("form_URL", string)` overrides the derivation for the few
 * keys that do not follow it.
 *
 * Leniency rules, applied in one place so resource modules stay declarative:
 * - A documented integer also accepts a numeric string (`"duration": "13"`).
 * - `""` becomes `null` only where the documented type is not a string
 *   (`"custom": ""`, `"speaker_percent": ""` in webhook payloads). Strings stay verbatim.
 * - Money accepts a number (`5.0` on SMS threads), a string with or without a
 *   dollar sign (`"$1.00"` on calls), `""`, and `null`.
 * - A nullable field that is absent decodes to `null`. A required field that is absent is an error.
 * - A summary's `grouped_results` is absent when the query had no `group_by`.
 *   `listOrEmpty` decodes that as `[]`.
 * - The tracker tables type `message_flow` as an array, and the message flow
 *   chapter shows one object. `oneOrNone` accepts either, and `[]` decodes as `null`.
 * - `falseWhenMissing` is the one exception, for documented responses that
 *   null or omit a boolean the type requires (`"answered": null` on a call
 *   that is still ringing, `"swap_ppc_override": null` on a company, no
 *   `form_capture` on a new company).
 * Anything else is a `DecodeError`, which the client reports as an
 * `unexpected_response` problem with the JSON path of the bad value.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A documented enum left open. Known values autocomplete. An unknown string still decodes. */
export type Open<T extends string> = T | (string & Record<never, never>);

export class DecodeError extends Error {
  override readonly name = "DecodeError";
  /** JSON path of the offending value, such as `$.calls[3].start_time`. */
  readonly path: string;
  readonly expected: string;
  constructor(path: string, expected: string, received: unknown) {
    super(`expected ${expected} at ${path}, got ${describe(received)}`);
    this.path = path;
    this.expected = expected;
  }
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (value === "") return "an empty string";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

export type Decoder<T> = (input: unknown, path: string) => T;

export interface Field<T> {
  readonly wire: string;
  readonly decode: Decoder<T>;
}

/** Decoder table for `T`. Use with `satisfies` so a missing or mistyped property is a compile error. */
export type Shape<T> = { readonly [K in keyof T]-?: Decoder<T[K]> | Field<T[K]> };

export function wire<T>(key: string, decode: Decoder<T>): Field<T> {
  return { wire: key, decode };
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function fieldsOf(shape: object): readonly (readonly [string, Field<unknown>])[] {
  return Object.entries(shape).map(([key, spec]: [string, Decoder<unknown> | Field<unknown>]) => [
    key,
    typeof spec === "function" ? { wire: snakeCase(key), decode: spec } : spec,
  ]);
}

function child(path: string, key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/**
 * Reads each property from its wire key and ignores unknown wire keys. The
 * result has exactly the keys of `shape`, so a record decoded for some `fields`
 * carries no others.
 */
export function object<T>(shape: Shape<T>): Decoder<T> {
  const fields = fieldsOf(shape);
  return (input, path) => {
    if (!isRecord(input)) throw new DecodeError(path, "an object", input);
    const result: Record<string, unknown> = {};
    for (const [key, field] of fields) result[key] = field.decode(input[field.wire], child(path, field.wire));
    return result as T;
  };
}

/**
 * `base` plus the requested keys of `extras`, for `fields` selection. The
 * decoded object has no other keys, so a property the type omits is absent at
 * runtime too.
 */
export function selected<B, E, F extends keyof E>(
  base: Shape<B>,
  extras: Shape<E>,
  fields: readonly F[] | undefined,
): Decoder<B & Pick<E, F>> {
  const shape: Record<string, unknown> = { ...base };
  for (const field of fields ?? []) shape[field as string] = extras[field];
  return object(shape as Shape<B & Pick<E, F>>);
}

/** `base` plus whichever keys of `extras` are on the wire, for payloads whose extras depend on the plan. */
export function present<B, E>(base: Shape<B>, extras: Shape<E>): Decoder<B & Partial<E>> {
  const required = fieldsOf(base);
  const optional = fieldsOf(extras);
  return (input, path) => {
    if (!isRecord(input)) throw new DecodeError(path, "an object", input);
    const result: Record<string, unknown> = {};
    for (const [key, field] of required) result[key] = field.decode(input[field.wire], child(path, field.wire));
    for (const [key, field] of optional) {
      if (input[field.wire] !== undefined) result[key] = field.decode(input[field.wire], child(path, field.wire));
    }
    return result as B & Partial<E>;
  };
}

/** Keeps keys verbatim. For maps whose keys are data, such as `form_data` and `custom`. */
export function dict<T>(decode: Decoder<T>): Decoder<Readonly<Record<string, T>>> {
  return (input, path) => {
    if (!isRecord(input)) throw new DecodeError(path, "an object", input);
    // `fromEntries` keeps a `__proto__` key as data. Assigning it would replace the result's prototype.
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, decode(value, child(path, key))]));
  };
}

export function string(input: unknown, path: string): string {
  if (typeof input !== "string") throw new DecodeError(path, "a string", input);
  return input;
}

export function boolean(input: unknown, path: string): boolean {
  if (typeof input !== "boolean") throw new DecodeError(path, "a boolean", input);
  return input;
}

/** `null` and absent decode to `false`. Only for the responses named in the header. */
export function falseWhenMissing(input: unknown, path: string): boolean {
  return input === null || input === undefined ? false : boolean(input, path);
}

/** Accepts `13` and `"13"`. */
export function integer(input: unknown, path: string): number {
  if (typeof input === "number" && Number.isInteger(input)) return input;
  if (typeof input === "string" && /^-?\d+$/.test(input)) return Number(input);
  throw new DecodeError(path, "an integer", input);
}

export function number(input: unknown, path: string): number {
  if (typeof input !== "number" || !Number.isFinite(input)) throw new DecodeError(path, "a number", input);
  return input;
}

/** Dollars. `""` and `null` mean unset. */
export function money(input: unknown, path: string): number | null {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const digits = input.trim().replace(/^(-?)\$/, "$1").replaceAll(",", "");
    if (/^-?\d+(\.\d+)?$/.test(digits)) return Number(digits);
  }
  throw new DecodeError(path, "an amount of money", input);
}

export function json(input: unknown, path: string): JsonValue {
  if (input === undefined) throw new DecodeError(path, "a JSON value", input);
  return input as JsonValue;
}

/** `null` and absent both decode to `null`. */
export function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (input, path) => (input === null || input === undefined ? null : decode(input, path));
}

/** `""`, `null`, and absent decode to `null`. Only for non-string documented types. */
export function emptyAsNull<T>(decode: Decoder<T>): Decoder<T | null> {
  return (input, path) => (input === null || input === undefined || input === "" ? null : decode(input, path));
}

export function array<T>(decode: Decoder<T>): Decoder<readonly T[]> {
  return (input, path) => {
    if (!Array.isArray(input)) throw new DecodeError(path, "an array", input);
    return input.map((item, index) => decode(item, `${path}[${index}]`));
  };
}

/** `null` and absent decode to `[]`. Only for the case named in the header. */
export function listOrEmpty<T>(decode: Decoder<T>): Decoder<readonly T[]> {
  const list = array(decode);
  return (input, path) => (input === undefined || input === null ? [] : list(input, path));
}

/** The item, or an array of at most one item. `[]`, `null`, and absent decode to `null`. Only for the case named in the header. */
export function oneOrNone<T>(decode: Decoder<T>): Decoder<T | null> {
  const single = nullable(decode);
  return (input, path) => {
    if (!Array.isArray(input)) return single(input, path);
    if (input.length > 1) throw new DecodeError(path, "at most one item", input);
    return single(input[0], `${path}[0]`);
  };
}

/** A closed enum. Only where the public type is closed, such as a discriminant or a value a write type accepts back. */
export function oneOf<const T extends readonly string[]>(...values: T): Decoder<T[number]> {
  const expected = values.map((value) => JSON.stringify(value)).join(" or ");
  return (input, path) => {
    if (typeof input !== "string" || !values.includes(input)) throw new DecodeError(path, expected, input);
    return input;
  };
}

/** An open enum. Used for descriptive values CallRail may extend. */
export function open<const T extends readonly string[]>(...values: T): Decoder<Open<T[number]>> {
  return (input, path) => string(input, path);
}

/** Maps a string or number through an id constructor from `ids.ts`, turning its `TypeError` into a `DecodeError`. */
export function id<T>(make: (raw: string | number) => T): Decoder<T> {
  return (input, path) => {
    if (typeof input === "string" || typeof input === "number") {
      try {
        return make(input);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    throw new DecodeError(path, "an id", input);
  };
}

/**
 * Picks one decoder by the value of a discriminant key. With a `fallback`, an
 * unknown tag decodes through it, so a new variant from CallRail is data, not a
 * crash. Without one, the union is closed and an unknown tag is a `DecodeError`.
 */
type Decoded<D> = D extends Decoder<infer R> ? R : never;

export function tagged<V extends Readonly<Record<string, Decoder<unknown>>>, U = never>(
  key: string,
  variants: V,
  fallback?: Decoder<U>,
): Decoder<Decoded<V[keyof V]> | U>;
export function tagged<T, U = never>(
  key: string,
  variants: Readonly<Record<string, Decoder<T>>>,
  fallback?: Decoder<U>,
): Decoder<T | U>;
export function tagged(
  key: string,
  variants: Readonly<Record<string, Decoder<unknown>>>,
  fallback?: Decoder<unknown>,
): Decoder<unknown> {
  const expected = Object.keys(variants)
    .map((tag) => JSON.stringify(tag))
    .join(" or ");
  return (input, path) => {
    if (!isRecord(input)) throw new DecodeError(path, "an object", input);
    const tag = input[key];
    const variant = typeof tag === "string" && Object.hasOwn(variants, tag) ? variants[tag] : undefined;
    if (variant) return variant(input, path);
    if (fallback) return fallback(input, path);
    throw new DecodeError(child(path, key), expected, tag);
  };
}

export function snakeCase(domainKey: string): string {
  return domainKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
