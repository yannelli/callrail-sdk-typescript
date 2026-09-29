/**
 * Two pagination modes, two page types, one discriminant.
 *
 * Offset pages carry totals. Relative pages carry only `hasNextPage` and follow
 * CallRail's `next_page` URL byte for byte. Only `calls.list` can produce a
 * relative page, and only when the query says `pagination: "relative"`. The
 * query types make mixing modes a compile error (`page` is `never` in a
 * relative query and `offset` is `never` in an offset query), so one query
 * cannot drift between modes across requests.
 *
 * Every list method returns a `PagePromise`:
 * - `await list(q)` is the first page.
 * - `for await (const item of list(q))` walks every item of every page, one
 *   page in memory at a time. `break` stops fetching.
 * The first request starts when `list` is called, like any async function, and
 * iteration reuses it rather than sending it twice.
 */

import { array, boolean, integer, nullable, object, string, wire, type Decoder } from "./decode.js";
import type { Endpoint, Http, RequestOptions } from "./http.js";

export interface OffsetPage<T> extends AsyncIterable<T> {
  readonly kind: "offset";
  readonly items: readonly T[];
  /** 1-based. */
  readonly page: number;
  readonly perPage: number;
  readonly totalPages: number;
  readonly totalRecords: number;
  /** The following page, or `null` on the last one. Sends the same query with `page + 1`. */
  next(): Promise<OffsetPage<T> | null>;
}

export interface RelativePage<T> extends AsyncIterable<T> {
  readonly kind: "relative";
  readonly items: readonly T[];
  readonly hasNextPage: boolean;
  /**
   * GETs `next_page` exactly as CallRail returned it, or resolves `null` when
   * `hasNextPage` is false. CallRail warns that a call arriving between
   * requests can shift the window, so page n+1 may overlap or skip one record.
   */
  next(): Promise<RelativePage<T> | null>;
}

export type Page<T> = OffsetPage<T> | RelativePage<T>;

export type ItemOf<P> = P extends Page<infer T> ? T : never;

export interface PagePromise<P extends Page<unknown>> extends Promise<P>, AsyncIterable<ItemOf<P>> {}

/** A record that carries a page of children, such as an SMS thread and its messages. */
export interface WithPage<R, T> {
  readonly record: R;
  readonly page: OffsetPage<T>;
}

interface OffsetBody<T> {
  readonly page: number;
  readonly perPage: number;
  readonly totalPages: number;
  readonly totalRecords: number;
  readonly items: readonly T[];
}

function offsetBody<T>(collection: string, item: Decoder<T>): Decoder<OffsetBody<T>> {
  return object<OffsetBody<T>>({
    page: integer,
    perPage: integer,
    totalPages: integer,
    totalRecords: integer,
    items: wire(collection, array(item)),
  });
}

function offsetPage<T>(body: OffsetBody<T>, load: (page: number) => Promise<OffsetPage<T>>): OffsetPage<T> {
  const page: OffsetPage<T> = {
    kind: "offset",
    items: body.items,
    page: body.page,
    perPage: body.perPage,
    totalPages: body.totalPages,
    totalRecords: body.totalRecords,
    next: () => (body.page < body.totalPages ? load(body.page + 1) : Promise.resolve(null)),
    [Symbol.asyncIterator]: () => walk(page),
  };
  return page;
}

async function* walk<T>(start: Page<T>): AsyncGenerator<T, void, undefined> {
  let page: Page<T> | null = start;
  while (page !== null) {
    yield* page.items;
    page = await page.next();
  }
}

async function* walkFrom<T>(first: Promise<Page<T>>): AsyncGenerator<T, void, undefined> {
  yield* walk(await first);
}

function pagePromise<T, P extends Page<T>>(first: Promise<P>): PagePromise<P> {
  return Object.assign(first, { [Symbol.asyncIterator]: () => walkFrom<T>(first) }) as unknown as PagePromise<P>;
}

/**
 * Internal. `collection` is the JSON key that holds the items (`calls`,
 * `message-flows`, `integration_criteria`). It is data per endpoint, not
 * derived from the path, because CallRail does not derive it either.
 */
export function offsetPages<T>(
  http: Http,
  endpoint: Endpoint,
  collection: string,
  item: Decoder<T>,
  options?: RequestOptions,
): PagePromise<OffsetPage<T>> {
  const decode = offsetBody(collection, item);
  const load = (page: number | undefined): Promise<OffsetPage<T>> =>
    http
      .json(page === undefined ? endpoint : { ...endpoint, query: { ...endpoint.query, page } }, decode, options)
      .then((body) => offsetPage(body, load));
  return pagePromise<T, OffsetPage<T>>(load(undefined));
}

/**
 * Internal. The first request carries `relative_pagination=true`. Every later
 * request is `http.jsonAt(next_page)`. The SDK never rebuilds, re-encodes, or
 * appends `.json` to that URL.
 */
export function relativePages<T>(
  http: Http,
  endpoint: Endpoint,
  collection: string,
  item: Decoder<T>,
  options?: RequestOptions,
): PagePromise<RelativePage<T>> {
  const decode = object({
    items: wire(collection, array(item)),
    nextPage: nullable(string),
    hasNextPage: boolean,
  });
  const toPage = (body: ReturnType<typeof decode>): RelativePage<T> => {
    const page: RelativePage<T> = {
      kind: "relative",
      items: body.items,
      hasNextPage: body.hasNextPage,
      next: () =>
        body.hasNextPage && body.nextPage !== null
          ? http.jsonAt(body.nextPage, decode, options).then(toPage)
          : Promise.resolve(null),
      [Symbol.asyncIterator]: () => walk(page),
    };
    return page;
  };
  const first = { ...endpoint, query: { ...endpoint.query, relative_pagination: true } };
  return pagePromise<T, RelativePage<T>>(http.json(first, decode, options).then(toPage));
}

/**
 * Internal. One GET whose body is a record plus page metadata plus a child
 * collection. `record` reads the whole body. Later pages re-request the same
 * endpoint with the next `page` and read only the children.
 */
export async function recordWithPage<R, T>(
  http: Http,
  endpoint: Endpoint,
  record: Decoder<R>,
  collection: string,
  item: Decoder<T>,
  options?: RequestOptions,
): Promise<WithPage<R, T>> {
  const children = offsetBody(collection, item);
  const load = (page: number): Promise<OffsetPage<T>> =>
    http
      .json({ ...endpoint, query: { ...endpoint.query, page } }, children, options)
      .then((body) => offsetPage(body, load));
  const first = await http.json(endpoint, (input, path) => ({ record: record(input, path), body: children(input, path) }), options);
  return { record: first.record, page: offsetPage(first.body, load) };
}
