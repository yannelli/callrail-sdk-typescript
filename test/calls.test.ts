import assert from "node:assert/strict";
import { test } from "node:test";
import { CallId, CallRail, CompanyId, OutboundCallerNumber, type JsonValue } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const NEXT_PAGE =
  "https://api.callrail.com/v3/a/227799611/calls?action=index&agency_id=227799611&api_sort%5B%5D%5Bstart_time%5D=desc&api_sort%5B%5D=start_time&controller=api%2Fv3%2Fcalls&format=json&no_one_to_many_associations=true&offset=1&page=1&per_page=100&relative_pagination=true";

function wireCall(id: string, extras: { readonly [key: string]: JsonValue } = {}): JsonValue {
  return {
    id,
    answered: true,
    business_phone_number: null,
    customer_city: "Denver",
    customer_country: "US",
    customer_name: "James Smith",
    customer_phone_number: "+13036231131",
    customer_state: "CO",
    direction: "inbound",
    duration: 4,
    recording: "https://api.callrail.com/v3/a/227799611/calls/213472384/recording.json",
    recording_duration: "27",
    start_time: "2017-01-24T11:27:48.119-05:00",
    tracking_phone_number: "+13038163491",
    voicemail: false,
    ...extras,
  };
}

test("relative pagination starts with relative_pagination=true and then fetches next_page exactly", async () => {
  const fetch = fakeFetch(
    {
      json: {
        calls: [wireCall("CAL1", { source: "Google Paid", tags: ["New Client"] })],
        next_page: NEXT_PAGE,
        has_next_page: true,
      },
    },
    { json: { calls: [wireCall("CAL2", { source: "Direct", tags: [] })], next_page: null, has_next_page: false } },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account(227799611);

  const first = await account.calls.list({ pagination: "relative", dateRange: "last_7_days", fields: ["source", "tags"] });
  const second = await first.next();
  const afterLast = await second?.next();

  assert.deepEqual(first.items, [
    {
      id: "CAL1",
      answered: true,
      businessPhoneNumber: null,
      customerCity: "Denver",
      customerCountry: "US",
      customerName: "James Smith",
      customerPhoneNumber: "+13036231131",
      customerState: "CO",
      direction: "inbound",
      duration: 4,
      recording: "https://api.callrail.com/v3/a/227799611/calls/213472384/recording.json",
      recordingDuration: 27,
      recordingPlayer: null,
      startTime: "2017-01-24T11:27:48.119-05:00",
      trackingPhoneNumber: "+13038163491",
      voicemail: false,
      source: "Google Paid",
      tags: ["New Client"],
    },
  ]);
  assert.equal(first.hasNextPage, true);
  assert.deepEqual(second?.items.map((call) => [call.id, call.source]), [["CAL2", "Direct"]]);
  assert.equal(second?.hasNextPage, false);
  assert.equal(afterLast, null);

  assert.equal(fetch.requests.length, 2);
  assert.equal(fetch.requests[0]?.path, "/v3/a/227799611/calls.json");
  assert.deepEqual(fetch.requests[0]?.query, {
    date_range: "last_7_days",
    fields: "source,tags",
    relative_pagination: "true",
  });
  assert.equal(fetch.requests[1]?.url, NEXT_PAGE);
});

test("for await walks pages lazily and break stops fetching", async () => {
  const fetch = fakeFetch({
    json: { calls: [wireCall("CAL1"), wireCall("CAL2")], next_page: NEXT_PAGE, has_next_page: true },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const seen: string[] = [];
  for await (const call of account.calls.list({ pagination: "relative" })) {
    seen.push(call.id);
    if (call.id === "CAL2") break;
  }

  assert.deepEqual(seen, ["CAL1", "CAL2"]);
  assert.equal(fetch.requests.length, 1);
});

test("offset pages carry totals and next() repeats the query with the following page", async () => {
  const fetch = fakeFetch(
    { json: { page: 1, per_page: 1, total_pages: 2, total_records: 2, calls: [wireCall("CAL1")] } },
    { json: { page: 2, per_page: 1, total_pages: 2, total_records: 2, calls: [wireCall("CAL2")] } },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const first = await account.calls.list({
    companyId: CompanyId("COM1"),
    perPage: 1,
    sort: { by: "startTime", order: "desc" },
  });
  const second = await first.next();
  const afterLast = await second?.next();

  assert.deepEqual([first.page, first.totalPages, first.totalRecords], [1, 2, 2]);
  assert.deepEqual(second?.items.map((call) => call.id), ["CAL2"]);
  assert.equal(afterLast, null);
  assert.deepEqual(
    fetch.requests.map((request) => request.query),
    [
      { company_id: "COM1", per_page: "1", sort: "start_time", order: "desc" },
      { company_id: "COM1", per_page: "1", sort: "start_time", order: "desc", page: "2" },
    ],
  );
});

test("update sends only the given keys, turns tags.add into append_tags, and returns the call", async () => {
  const fetch = fakeFetch({ json: wireCall("CAL1") });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const call = await account.calls.update(CallId("CAL1"), {
    note: "Call customer back tomorrow",
    tags: { add: ["New Client"] },
    value: 1,
    leadStatus: "good_lead",
  });

  const [request] = fetch.requests;
  assert.equal(request?.method, "PUT");
  assert.equal(request?.path, "/v3/a/ACC1/calls/CAL1.json");
  assert.equal(request?.headers["content-type"], "application/json");
  assert.deepEqual(request?.body, {
    kind: "json",
    value: {
      note: "Call customer back tomorrow",
      tags: ["New Client"],
      append_tags: true,
      value: "1.00",
      lead_status: "good_lead",
    },
  });
  assert.deepEqual([call.id, call.customerName, call.recordingDuration], ["CAL1", "James Smith", 27]);
});

test("sending an MMS file is the one multipart request", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      id: "SCI1",
      company_id: "COM1",
      initial_tracker_id: "TRK1",
      current_tracker_id: "TRK1",
      customer_name: "James Smith",
      customer_phone_number: "+13035550100",
      initial_tracking_number: "+13035550199",
      current_tracking_number: "+13035550199",
      last_message_at: "2026-09-29T10:00:00.000-06:00",
      state: "active",
      company_time_zone: "America/Denver",
      formatted_customer_phone_number: "303-555-0100",
      formatted_initial_tracking_number: "303-555-0199",
      formatted_current_tracking_number: "303-555-0199",
      formatted_customer_name: "James Smith",
      recent_messages: [
        {
          direction: "outgoing",
          content: "Your quote is attached.",
          created_at: "2026-09-29T10:00:00.000-06:00",
          type: "MMS",
          media_urls: [],
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const conversation = await account.textMessages.send({
    companyId: CompanyId("COM1"),
    customerPhoneNumber: "3035550100",
    trackingNumber: "3035550199",
    content: "Your quote is attached.",
    media: { file: new Uint8Array([1, 2, 3]), filename: "quote.png", contentType: "image/png" },
  });

  assert.deepEqual(fetch.requests[0]?.body, {
    kind: "multipart",
    fields: {
      company_id: "COM1",
      customer_phone_number: "3035550100",
      tracking_number: "3035550199",
      content: "Your quote is attached.",
      media_file: { filename: "quote.png", type: "image/png", size: 3 },
    },
  });
  assert.deepEqual(conversation.recentMessages, [
    {
      direction: "outgoing",
      content: "Your quote is attached.",
      createdAt: "2026-09-29T10:00:00.000-06:00",
      type: "mms",
      mediaUrls: [],
    },
  ]);
});

test("create sends the caller id as an integer and reads the call that is still ringing", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      answered: null,
      business_phone_number: "+19044567899",
      customer_city: "Atlanta",
      customer_country: "US",
      customer_name: null,
      customer_phone_number: "+14703444700",
      customer_state: "GA",
      direction: "outbound",
      duration: null,
      id: "CAL8154748ae6bd4e278a7cddd38a662f4f",
      recording: null,
      recording_duration: null,
      start_time: "2017-02-22T15:02:24.916-05:00",
      tracking_phone_number: "+19044567899",
      voicemail: false,
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const call = await account.calls.create({
    callerId: OutboundCallerNumber(7703334455),
    businessPhoneNumber: "+14045556666",
    customerPhoneNumber: "+14044442233",
    recordingEnabled: true,
    greeting: { text: "These are not the droids you are looking for." },
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "POST",
      "/v3/a/ACC1/calls.json",
      {
        kind: "json",
        value: {
          caller_id: 7703334455,
          customer_phone_number: "+14044442233",
          business_phone_number: "+14045556666",
          recording_enabled: true,
          outbound_greeting_text: "These are not the droids you are looking for.",
        },
      },
    ],
  );
  assert.deepEqual(call, {
    id: "CAL8154748ae6bd4e278a7cddd38a662f4f",
    answered: false,
    businessPhoneNumber: "+19044567899",
    customerCity: "Atlanta",
    customerCountry: "US",
    customerName: null,
    customerPhoneNumber: "+14703444700",
    customerState: "GA",
    direction: "outbound",
    duration: null,
    recording: null,
    recordingDuration: null,
    recordingPlayer: null,
    startTime: "2017-02-22T15:02:24.916-05:00",
    trackingPhoneNumber: "+19044567899",
    voicemail: false,
  });
});

test("summary without fields reads total_calls alone, even from groups that carry every metric", async () => {
  const fetch = fakeFetch({
    json: {
      start_date: "2016-10-10T00:00:00-0000",
      end_date: "2016-11-09T23:59:59-0000",
      time_zone: "UTC",
      total_results: { total_calls: 160 },
      grouped_by: "source",
      grouped_results: [
        {
          key: "Bing",
          total_calls: 130,
          missed_calls: 20,
          answered_calls: 110,
          first_time_callers: 15,
          average_duration: 179,
          formatted_average_duration: "2m 59s",
          leads: 40,
        },
        {
          key: "Billboard Ad",
          total_calls: 30,
          missed_calls: 4,
          answered_calls: 26,
          first_time_callers: 4,
          average_duration: 45,
          formatted_average_duration: "45s",
          leads: 6,
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const summary = await account.calls.summary({ groupBy: "source", answerStatus: "answered" });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    ["/v3/a/ACC1/calls/summary.json", { group_by: "source", answer_status: "answered" }],
  );
  assert.deepEqual(summary, {
    startDate: "2016-10-10T00:00:00-0000",
    endDate: "2016-11-09T23:59:59-0000",
    timeZone: "UTC",
    total: { totalCalls: 160 },
    groupedBy: "source",
    groups: [
      { key: "Bing", totalCalls: 130 },
      { key: "Billboard Ad", totalCalls: 30 },
    ],
  });
});

test("timeseries sends the requested metrics and still reads total_calls on each point", async () => {
  const fetch = fakeFetch({
    json: {
      start_date: "2016-10-01T00:00:00-0000",
      end_date: "2016-10-04T23:59:59-0000",
      time_zone: "UTC",
      total_results: {
        total_calls: 180,
        missed_calls: 20,
        answered_calls: 160,
        first_time_callers: 54,
        average_duration: 27,
        formatted_average_duration: "27s",
        leads: 12,
      },
      data: [
        {
          date: "2016-10-01",
          total_calls: 130,
          missed_calls: 4,
          answered_calls: 26,
          first_time_callers: 4,
          average_duration: 45,
          formatted_average_duration: "45s",
          leads: 6,
        },
        {
          date: "2016-10-03",
          total_calls: 0,
          missed_calls: 0,
          answered_calls: 0,
          first_time_callers: 0,
          average_duration: 0,
          formatted_average_duration: "0s",
          leads: 0,
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const series = await account.calls.timeseries({
    startDate: "2016-10-01",
    endDate: "2016-10-04",
    interval: "day",
    fields: ["missedCalls", "leads"],
    search: "google",
  });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    [
      "/v3/a/ACC1/calls/timeseries.json",
      {
        start_date: "2016-10-01",
        end_date: "2016-10-04",
        interval: "day",
        search: "google",
        fields: "missed_calls,leads",
      },
    ],
  );
  assert.deepEqual(series, {
    startDate: "2016-10-01T00:00:00-0000",
    endDate: "2016-10-04T23:59:59-0000",
    timeZone: "UTC",
    total: { totalCalls: 180, missedCalls: 20, leads: 12 },
    points: [
      { date: "2016-10-01", totalCalls: 130, missedCalls: 4, leads: 6 },
      { date: "2016-10-03", totalCalls: 0, missedCalls: 0, leads: 0 },
    ],
  });
});

test("recording returns the link, and pageViews pages through the session that led to the call", async () => {
  const fetch = fakeFetch(
    { json: { url: "http://app.callrail.com/calls/CAL11df32690b7d46123456789123456789/recording/redirect?access_key=241sa242sadqwerty123" } },
    {
      json: {
        page: 1,
        per_page: 2,
        total_pages: 3,
        total_records: 5,
        page_views: [
          {
            referrer_url: "https://www.grandsymphonyresort.com/available-suites/",
            page_url: "https://www.grandsymphonyresort.com/book-now/",
            created_at: "2017-03-09T10:17:29-08:00",
          },
          {
            referrer_url: "https://www.grandsymphonyresort.com/things-to-do",
            page_url: "https://www.grandsymphonyresort.com/available-suites/",
            created_at: "2017-03-09T10:17:21-08:00",
          },
        ],
      },
    },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");
  const id = CallId("CAL11df32690b7d46123456789123456789");

  const recording = await account.calls.recording(id);
  const views = await account.calls.pageViews(id, { perPage: 2, timeZone: "America/Los_Angeles" });

  assert.deepEqual(
    fetch.requests.map((request) => [request.path, request.query]),
    [
      ["/v3/a/ACC1/calls/CAL11df32690b7d46123456789123456789/recording.json", {}],
      [
        "/v3/a/ACC1/calls/CAL11df32690b7d46123456789123456789/page_views.json",
        { per_page: "2", time_zone: "America/Los_Angeles" },
      ],
    ],
  );
  assert.deepEqual(recording, {
    url: "http://app.callrail.com/calls/CAL11df32690b7d46123456789123456789/recording/redirect?access_key=241sa242sadqwerty123",
  });
  assert.deepEqual([views.page, views.totalPages, views.totalRecords], [1, 3, 5]);
  assert.deepEqual(views.items, [
    {
      pageUrl: "https://www.grandsymphonyresort.com/book-now/",
      referrerUrl: "https://www.grandsymphonyresort.com/available-suites/",
      createdAt: "2017-03-09T10:17:29-08:00",
    },
    {
      pageUrl: "https://www.grandsymphonyresort.com/available-suites/",
      referrerUrl: "https://www.grandsymphonyresort.com/things-to-do",
      createdAt: "2017-03-09T10:17:21-08:00",
    },
  ]);
});
