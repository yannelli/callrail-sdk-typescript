/**
 * Text messages cover conversations and sending. Sending is the one multipart
 * request in the API. `media: { file }` builds `multipart/form-data` with
 * `media_file`. Everything else is JSON. `media_url` and `media_file` together
 * return 422 from CallRail, and the `media` union makes that request unwritable.
 */

import { CompanyId, ConversationId, TextMessageId, TrackerId, UserId } from "../ids.js";
import type { AccountId } from "../ids.js";
import {
  array,
  emptyAsNull,
  id,
  nullable,
  object,
  open,
  selected,
  string,
  type Decoder,
  type Open,
  type Shape,
} from "../decode.js";
import { v3, type Http, type RequestBody, type RequestOptions } from "../http.js";
import { offsetPages, recordWithPage, type OffsetPage, type PagePromise } from "../pagination.js";
import { encodeDateFilter, encodeFields, type DateFilter, type OffsetPaging } from "../query.js";
import { leadStatus, type LeadStatus } from "./calls.js";

export type MessageDirection = Open<"inbound" | "outbound" | "incoming" | "outgoing">;

/** Lowercased on decode. The docs show both `mms` and `MMS`. */
export type MessageType = Open<"sms" | "mms">;

/** @internal */
export const messageType: Decoder<MessageType> = (input, path) => string(input, path).toLowerCase();

export interface RecentTextMessage {
  readonly direction: MessageDirection;
  readonly content: string;
  readonly createdAt: string;
  readonly type: MessageType;
  /** Short-lived. Download with `downloadMedia` and do not store the URL. */
  readonly mediaUrls: readonly string[];
}

export interface TextMessage extends RecentTextMessage {
  readonly id: TextMessageId;
  readonly status: Open<"sent" | "failed"> | null;
  /** The user who sent it, for outbound messages. */
  readonly user: { readonly id: UserId; readonly name: string } | null;
}

export interface TextConversationBase {
  readonly id: ConversationId;
  readonly companyId: CompanyId;
  readonly initialTrackerId: TrackerId | null;
  readonly currentTrackerId: TrackerId | null;
  readonly customerName: string | null;
  readonly customerPhoneNumber: string;
  readonly initialTrackingNumber: string | null;
  readonly currentTrackingNumber: string | null;
  readonly lastMessageAt: string | null;
  readonly state: string | null;
  readonly companyTimeZone: string | null;
  readonly formattedCustomerPhoneNumber: string | null;
  readonly formattedInitialTrackingNumber: string | null;
  readonly formattedCurrentTrackingNumber: string | null;
  readonly formattedCustomerName: string | null;
}

export interface TextConversationExtras {
  readonly leadStatus: LeadStatus | null;
  readonly source: string | null;
}

export type TextConversationField = keyof TextConversationExtras;

/** The conversation plus its most recent messages, as `list` and `send` return it. */
export type TextConversation<F extends TextConversationField = never> = TextConversationBase &
  Pick<TextConversationExtras, F> & { readonly recentMessages: readonly RecentTextMessage[] };

export interface TextConversationWithMessages<F extends TextConversationField = never> {
  readonly conversation: TextConversationBase & Pick<TextConversationExtras, F>;
  readonly messages: OffsetPage<TextMessage>;
}

export type TextConversationListQuery<F extends TextConversationField> = DateFilter &
  OffsetPaging & {
    readonly companyId?: CompanyId;
    /** One term, matched against customer phone number and customer name. */
    readonly search?: string;
    readonly fields?: readonly F[];
  };

/** `never` keys make `{ url, file }` a compile error. A plain union would accept it. */
export type TextMedia =
  | { readonly url: string; readonly file?: never }
  | {
      readonly file: Blob | Uint8Array;
      readonly filename: string;
      readonly contentType: string;
      readonly url?: never;
    };

export interface TextMessageInput {
  readonly companyId: CompanyId;
  /** 10-digit US or Canadian number. */
  readonly customerPhoneNumber: string;
  /** The tracking number to send from. Optional only when a conversation with this customer already exists. */
  readonly trackingNumber?: string;
  /** CallRail limits content to 140 characters and adds opt-out text to a first message that has none. */
  readonly content: string;
  readonly media?: TextMedia;
}

const direction = open("inbound", "outbound", "incoming", "outgoing");

const recentTextMessageShape = {
  direction,
  content: string,
  createdAt: string,
  type: messageType,
  mediaUrls: array(string),
} satisfies Shape<RecentTextMessage>;

const textMessage = object<TextMessage>({
  ...recentTextMessageShape,
  id: id(TextMessageId),
  status: nullable(open("sent", "failed")),
  user: nullable(object({ id: id(UserId), name: string })),
});

const conversationShape = {
  id: id(ConversationId),
  companyId: id(CompanyId),
  initialTrackerId: emptyAsNull(id(TrackerId)),
  currentTrackerId: emptyAsNull(id(TrackerId)),
  customerName: nullable(string),
  customerPhoneNumber: string,
  initialTrackingNumber: nullable(string),
  currentTrackingNumber: nullable(string),
  lastMessageAt: nullable(string),
  state: nullable(string),
  companyTimeZone: nullable(string),
  formattedCustomerPhoneNumber: nullable(string),
  formattedInitialTrackingNumber: nullable(string),
  formattedCurrentTrackingNumber: nullable(string),
  formattedCustomerName: nullable(string),
} satisfies Shape<TextConversationBase>;

const conversationExtrasShape = { leadStatus, source: nullable(string) } satisfies Shape<TextConversationExtras>;

const withRecentMessages = { ...conversationShape, recentMessages: array(object(recentTextMessageShape)) };

function sendBody(input: TextMessageInput): RequestBody {
  const fields = {
    company_id: input.companyId,
    customer_phone_number: input.customerPhoneNumber,
    tracking_number: input.trackingNumber,
    content: input.content,
  };
  const media = input.media;
  if (media?.file === undefined) return { kind: "json", value: { ...fields, media_url: media?.url } };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) if (value !== undefined) form.append(name, value);
  form.append("media_file", new Blob([media.file], { type: media.contentType }), media.filename);
  return { kind: "multipart", value: form };
}

export class TextMessages {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/text-messages.json`. */
  list<const F extends TextConversationField = never>(
    query: TextConversationListQuery<F> & RequestOptions = {},
  ): PagePromise<OffsetPage<TextConversation<F>>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/text-messages.json`,
        query: {
          ...encodeDateFilter(query),
          company_id: query.companyId,
          search: query.search,
          ...encodeFields(query.fields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "conversations",
      selected(withRecentMessages, conversationExtrasShape, query.fields),
      query,
    );
  }

  /** `GET /v3/a/{account_id}/text-messages/{conversation_id}.json`. */
  async get<const F extends TextConversationField = never>(
    id: ConversationId,
    options: OffsetPaging & { readonly fields?: readonly F[] } & RequestOptions = {},
  ): Promise<TextConversationWithMessages<F>> {
    const { record, page } = await recordWithPage(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/text-messages/${id}.json`,
        query: { ...encodeFields(options.fields), page: options.page, per_page: options.perPage },
      },
      selected(conversationShape, conversationExtrasShape, options.fields),
      "messages",
      textMessage,
      options,
    );
    return { conversation: record, messages: page };
  }

  /**
   * `POST /v3/a/{account_id}/text-messages.json`. 201. Draws from the SMS budget
   * (150 per hour, 1,000 per day) and is never retried, because a retry after a
   * lost response would text the customer twice.
   */
  send(input: TextMessageInput, options?: RequestOptions): Promise<TextConversation> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/text-messages.json`,
        body: sendBody(input),
        bucket: "sms_send",
      },
      object(withRecentMessages),
      options,
    );
  }

  /**
   * Downloads a message's media with the API key. It is not a catalog endpoint.
   * The URLs come from `mediaUrls` and expire quickly. Refuses a URL whose origin
   * is not the configured base URL.
   */
  downloadMedia(url: string, options?: RequestOptions): Promise<Blob> {
    return this.#http.blobAt(url, options);
  }
}
