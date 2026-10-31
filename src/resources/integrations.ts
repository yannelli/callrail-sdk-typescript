/**
 * Integrations. A company has at most one integration of each type. The API can
 * create and update only `Webhooks` and `Custom` (cookie capture). Every other
 * type is OAuth, managed in the CallRail app, and arrives here read-only as
 * `{ type: "other", wireType }`.
 *
 * Webhook URLs are keyed by the same event names that `readWebhook` takes, so
 * the URL you register for `post_call` is the one whose handler calls
 * `readWebhook("post_call", ...)`.
 */

import { IntegrationId } from "../ids.js";
import type { AccountId, CompanyId } from "../ids.js";
import {
  array,
  id,
  json,
  nullable,
  object,
  oneOf,
  open,
  present,
  selected,
  string,
  tagged,
  wire,
  type Decoder,
  type JsonValue,
  type Open,
  type Shape,
} from "../decode.js";
import { v3, type Http, type JsonBody, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeFields, type NonEmpty, type OffsetPaging } from "../query.js";

/** Events CallRail can POST. Wire config keys are `${kind}_webhook`. */
export type WebhookKind =
  | "pre_call"
  | "answered_call"
  | "post_call"
  | "updated_call"
  | "post_outbound_call"
  | "updated_outbound_call"
  | "sms_received"
  | "sms_sent"
  | "form_captured"
  | "convert_assist_complete";

/** The docs publish no config key for Convert Assist, so its URL cannot be set through the API. */
export type ConfigurableWebhookKind = Exclude<WebhookKind, "convert_assist_complete">;

export type WebhookUrls = { readonly [K in ConfigurableWebhookKind]?: readonly string[] };

export type IntegrationState = Open<"active" | "disabled">;

export interface WebhooksIntegration {
  readonly id: IntegrationId;
  readonly type: "Webhooks";
  readonly state: IntegrationState;
  readonly webhooks: WebhookUrls;
}

export interface CustomIntegration {
  readonly id: IntegrationId;
  readonly type: "Custom";
  readonly state: IntegrationState;
  /** Cookie names captured onto calls as `custom`. */
  readonly grabCookies: readonly string[];
}

export interface OtherIntegration {
  readonly id: IntegrationId;
  readonly type: "other";
  /** CallRail's type name, such as `GoogleAnalytics` or `Slack`. */
  readonly wireType: string;
  readonly state: IntegrationState;
  readonly config: JsonValue;
}

export type IntegrationRecord = WebhooksIntegration | CustomIntegration | OtherIntegration;

export interface IntegrationExtras {
  /** The company signing key that verifies webhook signatures. See `@yannelli/callrail/webhooks`. */
  readonly signingKey: string | null;
}

export type IntegrationField = keyof IntegrationExtras;
export type Integration<F extends IntegrationField = never> = IntegrationRecord & Pick<IntegrationExtras, F>;

export type IntegrationInput =
  | { readonly companyId: CompanyId; readonly type: "Webhooks"; readonly webhooks: WebhookUrls }
  | { readonly companyId: CompanyId; readonly type: "Custom"; readonly grabCookies: NonEmpty<string> };

/** `webhooks` and `grabCookies` are sent as the whole config. One integration has only one of them. */
export type IntegrationUpdate = { readonly state?: "active" | "disabled" } & (
  | { readonly webhooks?: WebhookUrls; readonly grabCookies?: never }
  | { readonly grabCookies?: NonEmpty<string>; readonly webhooks?: never }
);

const urls = array(string);

const webhookUrls: Decoder<WebhookUrls> = present<object, Required<WebhookUrls>>(
  {},
  {
    pre_call: wire("pre_call_webhook", urls),
    answered_call: wire("answered_call_webhook", urls),
    post_call: wire("post_call_webhook", urls),
    updated_call: wire("updated_call_webhook", urls),
    post_outbound_call: wire("post_outbound_call_webhook", urls),
    updated_outbound_call: wire("updated_outbound_call_webhook", urls),
    sms_received: wire("sms_received_webhook", urls),
    sms_sent: wire("sms_sent_webhook", urls),
    form_captured: wire("form_captured_webhook", urls),
  },
);

const cookieConfig = object({ grabCookies: urls });

const integrationState = open("active", "disabled");

const integrationRecord = tagged<WebhooksIntegration | CustomIntegration, OtherIntegration>(
  "type",
  {
    Webhooks: object<WebhooksIntegration>({
      id: id(IntegrationId),
      type: oneOf("Webhooks"),
      state: integrationState,
      webhooks: wire("config", webhookUrls),
    }),
    Custom: object<CustomIntegration>({
      id: id(IntegrationId),
      type: oneOf("Custom"),
      state: integrationState,
      grabCookies: wire("config", (input, path) => cookieConfig(input, path).grabCookies),
    }),
  },
  object<OtherIntegration>({
    id: id(IntegrationId),
    type: () => "other",
    wireType: wire("type", string),
    state: integrationState,
    config: json,
  }),
);

const integrationExtrasShape = { signingKey: nullable(string) } satisfies Shape<IntegrationExtras>;

function integration<F extends IntegrationField>(fields: readonly F[] | undefined): Decoder<Integration<F>> {
  const extras = selected({}, integrationExtrasShape, fields);
  return (input, path) => ({ ...integrationRecord(input, path), ...extras(input, path) });
}

function encodeConfig(source: {
  readonly webhooks?: WebhookUrls;
  readonly grabCookies?: readonly string[];
}): JsonBody | undefined {
  if (source.webhooks !== undefined) {
    return Object.fromEntries(Object.entries(source.webhooks).map(([kind, list]) => [`${kind}_webhook`, list]));
  }
  return source.grabCookies === undefined ? undefined : { grab_cookies: source.grabCookies };
}

export class Integrations {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/integrations.json`. `companyId` is required by CallRail. */
  list<const F extends IntegrationField = never>(
    query: { readonly companyId: CompanyId; readonly fields?: readonly F[] } & OffsetPaging & RequestOptions,
  ): PagePromise<OffsetPage<Integration<F>>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/integrations.json`,
        query: {
          company_id: query.companyId,
          ...encodeFields(query.fields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "integrations",
      integration(query.fields),
      query,
    );
  }

  /** `GET /v3/a/{account_id}/integrations/{integration_id}.json`. */
  get<const F extends IntegrationField = never>(
    id: IntegrationId,
    options: { readonly fields?: readonly F[] } & RequestOptions = {},
  ): Promise<Integration<F>> {
    return this.#http.json(
      { method: "GET", path: v3`a/${this.#accountId}/integrations/${id}.json`, query: encodeFields(options.fields) },
      integration(options.fields),
      options,
    );
  }

  /** `POST /v3/a/{account_id}/integrations.json`. The response always carries the signing key. */
  create(input: IntegrationInput, options?: RequestOptions): Promise<Integration<"signingKey">> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/integrations.json`,
        body: {
          kind: "json",
          value: { type: input.type, company_id: input.companyId, config: encodeConfig(input) },
        },
      },
      integration(["signingKey"]),
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/integrations/{integration_id}.json`. The docs table drops the leading slash. The real path has it. */
  update(id: IntegrationId, changes: IntegrationUpdate, options?: RequestOptions): Promise<Integration> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/integrations/${id}.json`,
        body: { kind: "json", value: { state: changes.state, config: encodeConfig(changes) } },
      },
      integration(undefined),
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/integrations/{integration_id}.json`. Disables it. 204. */
  disable(id: IntegrationId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/integrations/${id}.json` }, options);
  }
}
