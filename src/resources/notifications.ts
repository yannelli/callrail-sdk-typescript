/**
 * Notifications tell a user (or an email-only recipient) about calls and texts.
 *
 * CallRail spreads one idea across several flags: `call_enabled` plus
 * `alert_type`, and `send_email`, `send_push`, `send_desktop`. The SDK folds
 * them into `callAlerts` and a `channels` set. A channel set is sent as all three
 * booleans every time, so running the same update twice converges on the same state.
 */

import { CompanyId, NotificationId, TrackerId, UserId } from "../ids.js";
import type { AccountId } from "../ids.js";
import { boolean, emptyAsNull, id, nullable, object, oneOf, string, wire, type Decoder, type Shape } from "../decode.js";
import { v3, type Http, type JsonBody, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import type { NonEmpty, OffsetPaging } from "../query.js";

/** Which calls alert. `null` in a record or an input means call alerts are off. */
export type CallAlerts = "all" | "first_call" | "missed_and_vm" | "vm_only";

export type NotificationChannel = "email" | "push" | "desktop";

export type NotificationScope =
  | { readonly companyId: CompanyId; readonly trackerId?: never }
  | { readonly trackerId: TrackerId; readonly companyId?: never };

export interface Notification {
  readonly id: NotificationId;
  readonly name: string | null;
  readonly userId: UserId | null;
  /** Set for email-only recipients. */
  readonly email: string | null;
  readonly agentId: UserId | null;
  readonly agentName: string | null;
  readonly companyId: CompanyId | null;
  readonly companyName: string | null;
  readonly trackerId: TrackerId | null;
  readonly trackerName: string | null;
  readonly callAlerts: CallAlerts | null;
  readonly smsAlerts: boolean;
  readonly channels: readonly NotificationChannel[];
}

interface NotificationSettings {
  readonly callAlerts?: CallAlerts | null;
  readonly smsAlerts?: boolean;
  /** Only alert on calls and texts handled by this agent. It does not make the agent the recipient. */
  readonly agentId?: UserId;
}

/**
 * Omit `recipient` to notify the user who owns the API key. An email-only
 * recipient must be scoped to a company or tracker and can only use email.
 */
export type NotificationInput = NotificationSettings &
  (
    | {
        readonly recipient?: { readonly userId: UserId };
        readonly scope?: NotificationScope;
        readonly channels: NonEmpty<NotificationChannel>;
      }
    | {
        readonly recipient: { readonly email: string };
        readonly scope: NotificationScope;
        readonly channels: readonly ["email"];
      }
  );

export interface NotificationUpdate extends NotificationSettings {
  readonly scope?: NotificationScope;
  readonly channels?: readonly NotificationChannel[];
}

export type NotificationListQuery = OffsetPaging & {
  readonly channel?: NotificationChannel;
} & ({ readonly userId?: UserId; readonly email?: never } | { readonly email?: string; readonly userId?: never });

const notificationShape = {
  id: id(NotificationId),
  name: nullable(string),
  userId: emptyAsNull(id(UserId)),
  email: nullable(string),
  agentId: emptyAsNull(id(UserId)),
  agentName: nullable(string),
  companyId: emptyAsNull(id(CompanyId)),
  companyName: nullable(string),
  trackerId: emptyAsNull(id(TrackerId)),
  trackerName: nullable(string),
  smsAlerts: wire("sms_enabled", boolean),
} satisfies Shape<Omit<Notification, "callAlerts" | "channels">>;

const notificationRecord = object(notificationShape);

const alertFlags = object({
  callEnabled: boolean,
  sendEmail: boolean,
  sendPush: boolean,
  sendDesktop: boolean,
});

// Only read when `call_enabled` is true. A disabled record keeps a stale `alert_type`.
const alertType = object({ alertType: oneOf("all", "first_call", "missed_and_vm", "vm_only") });

const notification: Decoder<Notification> = (input, path) => {
  const flags = alertFlags(input, path);
  const channels: NotificationChannel[] = [];
  if (flags.sendEmail) channels.push("email");
  if (flags.sendPush) channels.push("push");
  if (flags.sendDesktop) channels.push("desktop");
  return {
    ...notificationRecord(input, path),
    callAlerts: flags.callEnabled ? alertType(input, path).alertType : null,
    channels,
  };
};

function encodeCallAlerts(callAlerts: CallAlerts | null | undefined): JsonBody {
  if (callAlerts === undefined) return {};
  return callAlerts === null ? { call_enabled: false } : { call_enabled: true, alert_type: callAlerts };
}

function encodeScope(scope: NotificationScope | undefined): JsonBody {
  return { company_id: scope?.companyId, tracker_id: scope?.trackerId };
}

function encodeChannels(channels: readonly NotificationChannel[] | undefined): JsonBody {
  if (channels === undefined) return {};
  return {
    send_email: channels.includes("email"),
    send_push: channels.includes("push"),
    send_desktop: channels.includes("desktop"),
  };
}

export class Notifications {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /**
   * `GET /v3/a/{account_id}/notifications.json`. The docs list `user_id` and
   * `email` under "Request Body" for this GET. They go on the query string,
   * like every GET parameter, because a GET body returns 406.
   */
  list(query: NotificationListQuery & RequestOptions = {}): PagePromise<OffsetPage<Notification>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/notifications.json`,
        query: {
          notification_type: query.channel === undefined ? undefined : `send_${query.channel}`,
          user_id: query.userId,
          email: query.email,
          page: query.page,
          per_page: query.perPage,
        },
      },
      "notifications",
      notification,
      query,
    );
  }

  /** `POST /v3/a/{account_id}/notifications.json`. */
  create(input: NotificationInput, options?: RequestOptions): Promise<Notification> {
    const { recipient } = input;
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/notifications.json`,
        body: {
          kind: "json",
          value: {
            ...(recipient === undefined ? {} : "email" in recipient ? { email: recipient.email } : { user_id: recipient.userId }),
            ...encodeScope(input.scope),
            ...encodeCallAlerts(input.callAlerts),
            sms_enabled: input.smsAlerts,
            agent_id: input.agentId,
            ...encodeChannels(input.channels),
          },
        },
      },
      notification,
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/notifications/{notification_id}.json`. */
  update(id: NotificationId, changes: NotificationUpdate, options?: RequestOptions): Promise<Notification> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/notifications/${id}.json`,
        body: {
          kind: "json",
          value: {
            ...encodeScope(changes.scope),
            ...encodeCallAlerts(changes.callAlerts),
            sms_enabled: changes.smsAlerts,
            agent_id: changes.agentId,
            ...encodeChannels(changes.channels),
          },
        },
      },
      notification,
      options,
    );
  }

  /** `DELETE /v3/a/{account_id}/notifications/{notification_id}.json`. 204. */
  delete(id: NotificationId, options?: RequestOptions): Promise<void> {
    return this.#http.empty({ method: "DELETE", path: v3`a/${this.#accountId}/notifications/${id}.json` }, options);
  }
}
