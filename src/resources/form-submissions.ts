/**
 * The form submissions resource covers list, create, update, ignore fields, and summary.
 * The summary lives at `/forms/summary.json`, not under `form_submissions`.
 */

import { CompanyId, FormSubmissionId } from "../ids.js";
import type { AccountId, PersonId } from "../ids.js";
import {
  array,
  boolean,
  dict,
  emptyAsNull,
  id,
  integer,
  json,
  listOrEmpty,
  money,
  nullable,
  object,
  selected,
  string,
  wire,
  type Decoder,
  type JsonValue,
  type Shape,
} from "../decode.js";
import { v3, type Http, type RequestOptions } from "../http.js";
import { offsetPages, type OffsetPage, type PagePromise } from "../pagination.js";
import {
  encodeDateFilter,
  encodeFields,
  encodeMoney,
  encodeSort,
  encodeTagChange,
  type DateFilter,
  type NonEmpty,
  type OffsetPaging,
  type Sort,
  type TagChange,
} from "../query.js";
import { leadStatus, milestones, personId, tagName, type LeadStatus, type Milestones } from "./calls.js";

export interface FormSubmissionBase {
  readonly id: FormSubmissionId;
  readonly companyId: CompanyId;
  readonly personId: PersonId | null;
  /** Field name to submitted value, keys verbatim. */
  readonly formData: Readonly<Record<string, JsonValue>>;
  readonly formUrl: string | null;
  readonly landingPageUrl: string | null;
  readonly referrer: string | null;
  readonly referringUrl: string | null;
  readonly submittedAt: string;
  readonly firstForm: boolean;
  readonly customerPhoneNumber: string | null;
  readonly customerName: string | null;
  readonly customerEmail: string | null;
  readonly formattedCustomerPhoneNumber: string | null;
  readonly formattedCustomerName: string | null;
  readonly source: string | null;
  readonly keywords: string | null;
  readonly campaign: string | null;
  readonly medium: string | null;
}

export interface FormSubmissionExtras {
  readonly companyName: string | null;
  readonly leadStatus: LeadStatus | null;
  /** Dollars. */
  readonly value: number | null;
  readonly note: string | null;
  readonly tags: readonly string[] | null;
  readonly utmSource: string | null;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly formName: string | null;
  readonly timelineUrl: string | null;
  readonly milestones: Milestones | null;
}

export type FormSubmissionField = keyof FormSubmissionExtras;
export type FormSubmission<F extends FormSubmissionField = never> = FormSubmissionBase & Pick<FormSubmissionExtras, F>;

/** What `create` returns. CallRail sends back only the submission's own fields, before attribution runs. */
export type CreatedFormSubmission = Pick<
  FormSubmissionBase,
  | "id"
  | "companyId"
  | "personId"
  | "formData"
  | "formUrl"
  | "landingPageUrl"
  | "referrer"
  | "referringUrl"
  | "submittedAt"
  | "firstForm"
>;

export type FormSubmissionListQuery<F extends FormSubmissionField> = DateFilter &
  OffsetPaging & {
    readonly companyId?: CompanyId;
    /** `true` returns only submissions that have a lead. */
    readonly personLead?: boolean;
    readonly leadStatus?: "good_lead" | "not_a_lead" | "not_scored";
    readonly tags?: readonly string[];
    readonly sort?: Sort<"submittedAt" | "formUrl">;
    readonly fields?: readonly F[];
  };

/** Attribution comes from a tracked session, or from the three referrer fields. Both may be sent. */
export type FormAttribution =
  | {
      readonly sessionId: string;
      readonly referrer?: string;
      readonly referringUrl?: string;
      readonly landingPageUrl?: string;
    }
  | {
      readonly sessionId?: never;
      readonly referrer: string;
      readonly referringUrl: string;
      readonly landingPageUrl: string;
    };

export type FormSubmissionInput = FormAttribution & {
  readonly companyId: CompanyId;
  readonly formUrl: string;
  /** CallRail parses phone numbers out of these values to find or create the lead. */
  readonly formData: Readonly<Record<string, string>>;
};

export interface FormSubmissionUpdate {
  readonly note?: string | null;
  readonly tags?: TagChange;
  readonly value?: number | null;
  readonly leadStatus?: "good_lead" | "not_a_lead" | null;
}

export interface IgnoreFieldsInput {
  readonly companies: NonEmpty<CompanyId> | "all";
  readonly fieldNames: NonEmpty<string>;
}

export interface FormMetrics {
  readonly totalForms: number;
  readonly firstForms: number;
  readonly leads: number;
}

export type FormMetricField = Exclude<keyof FormMetrics, "totalForms">;
export type SelectedFormMetrics<F extends FormMetricField> = Pick<FormMetrics, "totalForms" | F>;

export type FormGroupBy = "source" | "keywords" | "campaign" | "referrer" | "landing_page" | "form_name";

export type FormSummaryQuery<F extends FormMetricField> = DateFilter &
  (
    | { readonly companyId: CompanyId; readonly groupBy?: FormGroupBy }
    | { readonly companyId?: never; readonly groupBy?: FormGroupBy | "company" }
  ) & {
    readonly fields?: readonly F[];
    readonly tags?: readonly string[];
    readonly customFormIds?: readonly string[];
    /** Sent as `form_URL`, CallRail's spelling. */
    readonly formUrl?: string;
    readonly leadStatus?: "good_lead" | "not_a_lead" | "not_scored";
  };

export interface FormSummary<F extends FormMetricField = never> {
  readonly startDate: string;
  readonly endDate: string;
  readonly timeZone: string;
  readonly total: SelectedFormMetrics<F>;
  readonly groupedBy: string | null;
  readonly groups: readonly (SelectedFormMetrics<F> & { readonly key: string })[];
}

const createdShape = {
  id: id(FormSubmissionId),
  companyId: id(CompanyId),
  personId,
  formData: dict(json),
  formUrl: nullable(string),
  landingPageUrl: nullable(string),
  referrer: nullable(string),
  referringUrl: nullable(string),
  submittedAt: string,
  firstForm: boolean,
} satisfies Shape<CreatedFormSubmission>;

const formSubmissionShape = {
  ...createdShape,
  customerPhoneNumber: nullable(string),
  customerName: nullable(string),
  customerEmail: nullable(string),
  formattedCustomerPhoneNumber: nullable(string),
  formattedCustomerName: nullable(string),
  source: nullable(string),
  keywords: nullable(string),
  campaign: nullable(string),
  medium: nullable(string),
} satisfies Shape<FormSubmissionBase>;

const formSubmissionExtrasShape = {
  companyName: nullable(string),
  leadStatus,
  value: money,
  note: nullable(string),
  tags: emptyAsNull(array(tagName)),
  utmSource: nullable(string),
  utmMedium: nullable(string),
  utmCampaign: nullable(string),
  formName: nullable(string),
  timelineUrl: nullable(string),
  milestones: emptyAsNull(milestones),
} satisfies Shape<FormSubmissionExtras>;

const formMetricShape = { totalForms: integer, firstForms: integer, leads: integer } satisfies Shape<FormMetrics>;

/** `total_forms` comes back whatever `fields` says, so it is always decoded. */
function formMetrics<X, F extends FormMetricField>(
  base: Shape<X>,
  fields: readonly F[] | undefined,
): Decoder<X & SelectedFormMetrics<F>> {
  return selected<X, FormMetrics, "totalForms" | F>(base, formMetricShape, ["totalForms", ...(fields ?? [])]);
}

export class FormSubmissions {
  readonly #http: Http;
  readonly #accountId: AccountId;

  /** @internal */
  constructor(http: Http, accountId: AccountId) {
    this.#http = http;
    this.#accountId = accountId;
  }

  /** `GET /v3/a/{account_id}/form_submissions.json`. */
  list<const F extends FormSubmissionField = never>(
    query: FormSubmissionListQuery<F> & RequestOptions = {},
  ): PagePromise<OffsetPage<FormSubmission<F>>> {
    return offsetPages(
      this.#http,
      {
        method: "GET",
        path: v3`a/${this.#accountId}/form_submissions.json`,
        query: {
          ...encodeDateFilter(query),
          company_id: query.companyId,
          person_lead: query.personLead,
          lead_status: query.leadStatus,
          tags: query.tags,
          ...encodeSort(query.sort),
          ...encodeFields(query.fields),
          page: query.page,
          per_page: query.perPage,
        },
      },
      "form_submissions",
      selected(formSubmissionShape, formSubmissionExtrasShape, query.fields),
      query,
    );
  }

  /** `POST /v3/a/{account_id}/form_submissions.json`. The body is wrapped in `form_submission`, as the docs example sends it. */
  create(input: FormSubmissionInput, options?: RequestOptions): Promise<CreatedFormSubmission> {
    return this.#http.json(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/form_submissions.json`,
        body: {
          kind: "json",
          value: {
            form_submission: {
              company_id: input.companyId,
              referrer: input.referrer,
              referring_url: input.referringUrl,
              landing_page_url: input.landingPageUrl,
              form_url: input.formUrl,
              session_id: input.sessionId,
              form_data: input.formData,
            },
          },
        },
      },
      object(createdShape),
      options,
    );
  }

  /** `PUT /v3/a/{account_id}/form_submissions/{form_submission_id}.json`. */
  update(id: FormSubmissionId, changes: FormSubmissionUpdate, options?: RequestOptions): Promise<FormSubmission> {
    return this.#http.json(
      {
        method: "PUT",
        path: v3`a/${this.#accountId}/form_submissions/${id}.json`,
        body: {
          kind: "json",
          value: {
            note: changes.note,
            ...encodeTagChange(changes.tags),
            value: encodeMoney(changes.value),
            lead_status: changes.leadStatus,
          },
        },
      },
      object(formSubmissionShape),
      options,
    );
  }

  /**
   * `POST /v3/a/{account_id}/form_submissions/ignored_fields.json`. Stops capturing
   * these fields and removes them from past submissions in a background job.
   * Resolves on any 2xx without reading the body.
   */
  ignoreFields(input: IgnoreFieldsInput, options?: RequestOptions): Promise<void> {
    return this.#http.empty(
      {
        method: "POST",
        path: v3`a/${this.#accountId}/form_submissions/ignored_fields.json`,
        body: {
          kind: "json",
          value: {
            company_ids: input.companies === "all" ? ["all"] : input.companies,
            field_names: input.fieldNames,
          },
        },
      },
      options,
    );
  }

  /** `GET /v3/a/{account_id}/forms/summary.json`. */
  summary<const F extends FormMetricField = never>(
    query: FormSummaryQuery<F> & RequestOptions = {},
  ): Promise<FormSummary<F>> {
    return this.#http.json(
      {
        method: "GET",
        path: v3`a/${this.#accountId}/forms/summary.json`,
        query: {
          ...encodeDateFilter(query),
          company_id: query.companyId,
          group_by: query.groupBy,
          ...encodeFields(query.fields, ["totalForms"]),
          tags: query.tags,
          custom_form_ids: query.customFormIds,
          form_URL: query.formUrl,
          lead_status: query.leadStatus,
        },
      },
      object<FormSummary<F>>({
        startDate: string,
        endDate: string,
        timeZone: string,
        total: wire("total_results", formMetrics<object, F>({}, query.fields)),
        groupedBy: nullable(string),
        groups: wire("grouped_results", listOrEmpty(formMetrics({ key: string }, query.fields))),
      }),
      query,
    );
  }
}
