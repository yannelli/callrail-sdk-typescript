/**
 * SMS threads are the thread-centric view of texting, with notes, tags, value, and
 * lead qualification. `get` returns the thread and one page of its messages.
 * CallRail pages those messages inside the thread response, so
 * `messages.next()` re-requests the thread with the next `page`.
 */

import { CompanyId, SmsThreadId, TextMessageId, TrackerId } from "../ids.js";
import type { AccountId } from "../ids.js";
import { array, emptyAsNull, id, json, money, nullable, object, open, string, type JsonValue, type Open } from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, recordWithPage, type OffsetPage, type PagePromise } from "../pagination.js";
import {
  encodeDateFilter,
  encodeFields,
  encodeMoney,
  encodeTagChange,
  type DateFilter,
  type OffsetPaging,
  type TagChange,
} from "../query.js";
import { leadStatus, tagName, type LeadStatus } from "./calls.js";
import { messageType } from "./text-messages.js";

export interface SmsThread {
  readonly id: SmsThreadId;
  readonly companyId: CompanyId;
  readonly initialTrackerId: TrackerId | null;
  readonly currentTrackerId: TrackerId | null;
  readonly customerName: string | null;
  readonly customerPhoneNumber: string;
  readonly initialTrackingNumber: string | null;
  readonly currentTrackingNumber: string | null;
  readonly state: Open<"active" | "archived">;
  readonly companyTimeZone: string | null;
  readonly lastMessageAt: string | null;
  readonly formattedCustomerPhoneNumber: string | null;
  readonly formattedInitialTrackingNumber: string | null;
  readonly formattedCurrentTrackingNumber: string | null;
  readonly formattedCustomerName: string | null;
  readonly notes: string | null;
  readonly tags: readonly string[] | null;
  /** Dollars. */
  readonly value: number | null;
  readonly leadQualification: LeadStatus | null;
}

export interface SmsThreadMessage {
  readonly id: TextMessageId;
  readonly content: string;
  readonly createdAt: string;
  readonly status: Open<"sent" | "failed"> | null;
  readonly direction: Open<"inbound" | "outbound" | "incoming" | "outgoing">;
  /** Lowercased. The docs show both `mms` and `MMS`. */
  readonly messageType: Open<"sms" | "mms">;
  /** Short-lived. Download with `textMessages.downloadMedia(url)` and do not store the URL. */
  readonly mediaUrls: readonly string[];
  /** Delivery error details. Always `null` unless `withMessageErrors` was set. */
  readonly error: JsonValue | null;
}

export interface SmsThreadWithMessages {
  readonly thread: SmsThread;
  readonly messages: OffsetPage<SmsThreadMessage>;
}

export type SmsThreadListQuery = DateFilter &
  OffsetPaging & {
    readonly companyId?: CompanyId;
    /** One term, matched against customer phone number, customer name, and tag names. */
    readonly search?: string;
  };

export interface SmsThreadUpdate {
  readonly notes?: string | null;
  readonly tags?: TagChange;
  readonly value?: number | null;
  readonly leadQualification?: "good_lead" | "not_a_lead" | null;
}

const smsThread = object<SmsThread>({
  id: id(SmsThreadId),
  companyId: id(CompanyId),
  initialTrackerId: emptyAsNull(id(TrackerId)),
  currentTrackerId: emptyAsNull(id(TrackerId)),
  customerName: nullable(string),
  customerPhoneNumber: string,
  initialTrackingNumber: nullable(string),
  currentTrackingNumber: nullable(string),
  state: open("active", "archived"),
  companyTimeZone: nullable(string),
  lastMessageAt: nullable(string),
  formattedCustomerPhoneNumber: nullable(string),
  formattedInitialTrackingNumber: nullable(string),
  formattedCurrentTrackingNumber: nullable(string),
  formattedCustomerName: nullable(string),
  notes: nullable(string),
  tags: emptyAsNull(array(tagName)),
  value: money,
  leadQualification: leadStatus,
});

/** `SmsThread` has no field selection, so every list request asks for the fields the list omits by default. */
const listFields = [
  "lastMessageAt",
  "formattedCustomerPhoneNumber",
  "formattedInitialTrackingNumber",
  "formattedCurrentTrackingNumber",
  "formattedCustomerName",
] as const;

const smsThreadMessage = object<SmsThreadMessage>({
  id: id(TextMessageId),
  content: string,
  createdAt: string,
  status: nullable(open("sent", "failed")),
  direction: open("inbound", "outbound", "incoming", "outgoing"),
  messageType,
  mediaUrls: array(string),
  error: nullable(json),
});

export class SmsThreads {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/sms-threads.json`. */
  list(query: SmsThreadListQuery & RequestOptions = {}): PagePromise<OffsetPage<SmsThread>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/sms-threads.json`,
        query: {
          ...encodeDateFilter(query),
          company_id: query.companyId,
          search: query.search,
          ...encodeFields(listFields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "sms_threads",
      smsThread,
      query,
    );
  }

  /** `GET /v3/a/{account_id}/sms-threads/{thread_id}.json`. At most 100 messages per page. */
  async get(
    id: SmsThreadId,
    options: OffsetPaging & { readonly withMessageErrors?: boolean } & RequestOptions = {},
  ): Promise<SmsThreadWithMessages> {
    const { record, page } = await recordWithPage(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/sms-threads/${id}.json`,
        query: { page: options.page, per_page: options.perPage, with_msg_errors: options.withMessageErrors },
      },
      smsThread,
      "messages",
      smsThreadMessage,
      options,
    );
    return { thread: record, messages: page };
  }

  /** `PUT /v3/a/{account_id}/sms-threads/{thread_id}.json`. */
  update(id: SmsThreadId, changes: SmsThreadUpdate, options?: RequestOptions): Promise<SmsThread> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/sms-threads/${id}.json`,
        body: {
          kind: "json",
          value: {
            notes: changes.notes,
            ...encodeTagChange(changes.tags),
            value: encodeMoney(changes.value),
            lead_qualification: changes.leadQualification,
          },
        },
      },
      smsThread,
      options,
    );
  }
}
