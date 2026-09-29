import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, FormSubmissionId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

function wireOrganicTouch(eventDate: string) {
  return {
    event_date: eventDate,
    ad_position: null,
    campaign: null,
    device: "desktop",
    keywords: null,
    landing: "http://www.uptowndental.com/pricing?network=g",
    landing_page_url_params: { network: "g" },
    match_type: null,
    medium: "organic",
    referrer: "https://www.google.com/",
    referrer_url_params: {},
    session_browser: "Chrome",
    url_utm_params: {},
    source: "Google Organic",
  };
}

function organicTouch(eventDate: string) {
  return {
    eventDate,
    adPosition: null,
    campaign: null,
    device: "desktop",
    keywords: null,
    landing: "http://www.uptowndental.com/pricing?network=g",
    landingPageUrlParams: { network: "g" },
    matchType: null,
    medium: "organic",
    referrer: "https://www.google.com/",
    referrerUrlParams: {},
    sessionBrowser: "Chrome",
    urlUtmParams: {},
    source: "Google Organic",
  };
}

const anonymousSubmission = {
  id: "FOR8154748ae6bd4e278a7cddd38a662f4f",
  company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
  person_id: "anonymous",
  form_data: { name: "Graham Armstrong", email: "graham@example.com", phone: "(999) 999-9999" },
  form_url: "http://www.uptowndental.com/appointment",
  landing_page_url: "http://www.uptowndental.com/appointment",
  referrer: "www.google.com",
  referring_url: "www.google.com",
  submitted_at: "2017-11-17T07:46:28.000Z",
  first_form: false,
  customer_phone_number: "+19999999999",
  customer_name: "Graham Armstrong",
  customer_email: "graham@example.com",
  formatted_customer_phone_number: "999-999-9999",
  formatted_customer_name: "Graham Armstrong",
  source: "Google Ads",
  keywords: "pediatric dentist",
  campaign: "back_to_school",
  medium: "CPC",
  milestones: {
    first_touch: wireOrganicTouch("2017-10-22T19:41:45.183-04:00"),
    lead_created: wireOrganicTouch("2017-10-22T19:41:45.183-04:00"),
    qualified: wireOrganicTouch("2017-10-22T19:41:45.183-04:00"),
    last_touch: wireOrganicTouch("2017-11-17T07:46:28.000-04:00"),
  },
};

const scoredSubmission = {
  id: "FOR8154748ae6bd4e278a7cddd38a662f4f",
  company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
  person_id: "PER8154748ae6bd4e278a7cddd38a662f4f",
  form_data: {
    name: "Veronica Auer",
    email: "veronica.auer@example.com",
    phone: "888-888-8888",
    contact_method: "email",
    best_time_to_call: "evening",
  },
  form_url: "http://www.uptowndental.com/contact?network=g",
  landing_page_url: "http://www.uptowndental.com/pricing?network=g",
  referrer: "google_organic",
  referring_url: "http://www.google.com/url",
  submitted_at: "2017-12-02T12:30:09.000Z",
  first_form: false,
  customer_phone_number: "+18888888888",
  customer_name: "Veronica Auer",
  customer_email: "veronica.auer@example.com",
  formatted_customer_phone_number: "888-888-8888",
  formatted_customer_name: "Veronica Auer",
  source: "Google Organic",
  keywords: null,
  campaign: null,
  medium: "organic",
  milestones: {
    first_touch: wireOrganicTouch("2017-10-22T19:41:45.183-04:00"),
    lead_created: wireOrganicTouch("2017-10-22T19:41:45.183-04:00"),
    qualified: {
      event_date: null,
      ad_position: null,
      campaign: null,
      device: null,
      keywords: null,
      landing: null,
      landing_page_url_params: {},
      match_type: null,
      medium: null,
      referrer: null,
      referrer_url_params: {},
      session_browser: null,
      url_utm_params: {},
      source: null,
    },
    last_touch: wireOrganicTouch("2017-12-02T12:30:09.000-04:00"),
  },
};

const createdSubmission = {
  id: "FOR8154748ae6bd4e278a7cddd38a662f4f",
  company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
  person_id: "PER8154748ae6bd4e278a7cddd38a662f4f",
  form_data: {
    phone_number: "5555555555",
    report: "Carmen stole the Liberty Bell.",
    last_sighting: "Near Washington D.C.",
  },
  form_url: "missingmonuments.com/report/new",
  landing_page_url: "missingmonuments.com/info",
  referrer: "wikipedia_link",
  referring_url: "wikipedia.org/wiki/Carmen_Sandiego",
  submitted_at: "2018-02-13T17:03:33.018Z",
  first_form: false,
};

test("list with milestones reads an anonymous person as null and a milestone of nulls as null", async () => {
  const fetch = fakeFetch({
    json: { page: 1, per_page: 2, total_pages: 75, total_records: 150, form_submissions: [anonymousSubmission, scoredSubmission] },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.formSubmissions.list({ fields: ["milestones"] });

  assert.equal(fetch.requests[0]?.path, "/v3/a/ACC1/form_submissions.json");
  assert.deepEqual(fetch.requests[0]?.query, { fields: "milestones" });
  assert.deepEqual([page.page, page.totalPages, page.totalRecords], [1, 75, 150]);
  assert.deepEqual(
    page.items.map((submission) => submission.personId),
    [null, "PER8154748ae6bd4e278a7cddd38a662f4f"],
  );
  assert.deepEqual(page.items[1], {
    id: "FOR8154748ae6bd4e278a7cddd38a662f4f",
    companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
    personId: "PER8154748ae6bd4e278a7cddd38a662f4f",
    formData: {
      name: "Veronica Auer",
      email: "veronica.auer@example.com",
      phone: "888-888-8888",
      contact_method: "email",
      best_time_to_call: "evening",
    },
    formUrl: "http://www.uptowndental.com/contact?network=g",
    landingPageUrl: "http://www.uptowndental.com/pricing?network=g",
    referrer: "google_organic",
    referringUrl: "http://www.google.com/url",
    submittedAt: "2017-12-02T12:30:09.000Z",
    firstForm: false,
    customerPhoneNumber: "+18888888888",
    customerName: "Veronica Auer",
    customerEmail: "veronica.auer@example.com",
    formattedCustomerPhoneNumber: "888-888-8888",
    formattedCustomerName: "Veronica Auer",
    source: "Google Organic",
    keywords: null,
    campaign: null,
    medium: "organic",
    milestones: {
      firstTouch: organicTouch("2017-10-22T19:41:45.183-04:00"),
      leadCreated: organicTouch("2017-10-22T19:41:45.183-04:00"),
      qualified: null,
      lastTouch: organicTouch("2017-12-02T12:30:09.000-04:00"),
    },
  });
});

test("create wraps the body in form_submission and returns the submission before attribution", async () => {
  const fetch = fakeFetch({ status: 201, json: createdSubmission });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.formSubmissions.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    referrer: "wikipedia_link",
    referringUrl: "wikipedia.org/wiki/Carmen_Sandiego",
    landingPageUrl: "missingmonuments.com/info",
    formUrl: "missingmonuments.com/report/new",
    sessionId: "SES8154748ae6bd4e278a7cddd38a662f4f",
    formData: {
      phone_number: "5555555555",
      report: "Carmen stole the Liberty Bell.",
      last_sighting: "Near Washington D.C.",
    },
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "POST",
      "/v3/a/ACC1/form_submissions.json",
      {
        kind: "json",
        value: {
          form_submission: {
            company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
            referrer: "wikipedia_link",
            referring_url: "wikipedia.org/wiki/Carmen_Sandiego",
            landing_page_url: "missingmonuments.com/info",
            form_url: "missingmonuments.com/report/new",
            session_id: "SES8154748ae6bd4e278a7cddd38a662f4f",
            form_data: {
              phone_number: "5555555555",
              report: "Carmen stole the Liberty Bell.",
              last_sighting: "Near Washington D.C.",
            },
          },
        },
      },
    ],
  );
  assert.deepEqual(created, {
    id: "FOR8154748ae6bd4e278a7cddd38a662f4f",
    companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
    personId: "PER8154748ae6bd4e278a7cddd38a662f4f",
    formData: {
      phone_number: "5555555555",
      report: "Carmen stole the Liberty Bell.",
      last_sighting: "Near Washington D.C.",
    },
    formUrl: "missingmonuments.com/report/new",
    landingPageUrl: "missingmonuments.com/info",
    referrer: "wikipedia_link",
    referringUrl: "wikipedia.org/wiki/Carmen_Sandiego",
    submittedAt: "2018-02-13T17:03:33.018Z",
    firstForm: false,
  });
});

test("update replaces tags, clears the value, and reads the documented response that omits the customer fields", async () => {
  const fetch = fakeFetch({ json: createdSubmission });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const updated = await account.formSubmissions.update(FormSubmissionId("FOR8154748ae6bd4e278a7cddd38a662f4f"), {
    note: "Call customer back tomorrow",
    tags: { replace: ["New Client"] },
    value: null,
    leadStatus: "good_lead",
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "PUT",
      "/v3/a/ACC1/form_submissions/FOR8154748ae6bd4e278a7cddd38a662f4f.json",
      {
        kind: "json",
        value: {
          note: "Call customer back tomorrow",
          tags: ["New Client"],
          append_tags: false,
          value: null,
          lead_status: "good_lead",
        },
      },
    ],
  );
  assert.deepEqual(
    [updated.personId, updated.customerPhoneNumber, updated.customerEmail, updated.source, updated.medium],
    ["PER8154748ae6bd4e278a7cddd38a662f4f", null, null, null, null],
  );
});
