import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, SmsThreadId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const wireThread = {
  id: "KkMhr",
  notes: null,
  tags: ["Urgent"],
  value: 5.0,
  lead_qualification: "good_lead",
  company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
  initial_tracker_id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  current_tracker_id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  customer_name: "MANN KEVIN",
  customer_phone_number: "+14042223333",
  initial_tracking_number: "+14045556677",
  current_tracking_number: "+17703334455",
  last_message_at: "2016-07-28T19:26:43.578Z",
  state: "active",
  company_time_zone: "America/New_York",
  formatted_customer_phone_number: "404-222-3333",
  formatted_initial_tracking_number: "404-555-6677",
  formatted_current_tracking_number: "770-333-4455",
  formatted_customer_name: "Mann Kevin",
};

const thread = {
  id: "KkMhr",
  companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
  initialTrackerId: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  currentTrackerId: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  customerName: "MANN KEVIN",
  customerPhoneNumber: "+14042223333",
  initialTrackingNumber: "+14045556677",
  currentTrackingNumber: "+17703334455",
  state: "active",
  companyTimeZone: "America/New_York",
  lastMessageAt: "2016-07-28T19:26:43.578Z",
  formattedCustomerPhoneNumber: "404-222-3333",
  formattedInitialTrackingNumber: "404-555-6677",
  formattedCurrentTrackingNumber: "770-333-4455",
  formattedCustomerName: "Mann Kevin",
  notes: null,
  tags: ["Urgent"],
  value: 5,
  leadQualification: "good_lead",
};

test("list always asks for the fields the index leaves out, so every thread has the same shape", async () => {
  const fetch = fakeFetch({ json: { page: 1, per_page: 100, total_pages: 1, total_records: 1, sms_threads: [wireThread] } });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.smsThreads.list({ companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"), search: "Mann" });

  assert.deepEqual([fetch.requests[0]?.path, fetch.requests[0]?.query], [
    "/v3/a/ACC1/sms-threads.json",
    {
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      search: "Mann",
      fields:
        "last_message_at,formatted_customer_phone_number,formatted_initial_tracking_number,formatted_current_tracking_number,formatted_customer_name",
    },
  ]);
  assert.deepEqual(page.items, [thread]);
});

test("get returns the thread with a page of its messages, and next() asks for the thread again with the next page", async () => {
  const fetch = fakeFetch(
    {
      json: {
        ...wireThread,
        page: 1,
        per_page: 1,
        total_pages: 2,
        total_records: 2,
        messages: [
          {
            id: "SCIdef84068eb9a6679b40abc9bd1718a2c",
            content: "These aren't the droids you're looking for.",
            created_at: "2016-07-28T19:28:21.578Z",
            status: null,
            direction: "incoming",
            message_type: "mms",
            media_urls: [
              "https://api.callrail.com/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/text-messages/SCIdef84068eb9a6679b40abc9bd1718a2c/media/0",
            ],
          },
        ],
      },
    },
    {
      json: {
        ...wireThread,
        page: 2,
        per_page: 1,
        total_pages: 2,
        total_records: 2,
        messages: [
          {
            id: "SCI2",
            content: "Move along.",
            created_at: "2016-07-28T19:27:00.000Z",
            status: "failed",
            direction: "outgoing",
            message_type: "SMS",
            media_urls: [],
            error: { code: 30006 },
          },
        ],
      },
    },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const { thread: fetched, messages } = await account.smsThreads.get(SmsThreadId("KkMhr"), {
    perPage: 1,
    withMessageErrors: true,
  });
  const older = await messages.next();
  const afterLast = await older?.next();

  assert.deepEqual(
    fetch.requests.map((request) => [request.path, request.query]),
    [
      ["/v3/a/ACC1/sms-threads/KkMhr.json", { per_page: "1", with_msg_errors: "true" }],
      ["/v3/a/ACC1/sms-threads/KkMhr.json", { per_page: "1", with_msg_errors: "true", page: "2" }],
    ],
  );
  assert.deepEqual(fetched, thread);
  assert.deepEqual(messages.items, [
    {
      id: "SCIdef84068eb9a6679b40abc9bd1718a2c",
      content: "These aren't the droids you're looking for.",
      createdAt: "2016-07-28T19:28:21.578Z",
      status: null,
      direction: "incoming",
      messageType: "mms",
      mediaUrls: [
        "https://api.callrail.com/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/text-messages/SCIdef84068eb9a6679b40abc9bd1718a2c/media/0",
      ],
      error: null,
    },
  ]);
  assert.deepEqual(
    older?.items.map((message) => [message.id, message.status, message.messageType, message.error]),
    [["SCI2", "failed", "sms", { code: 30006 }]],
  );
  assert.equal(afterLast, null);
});

test("update sends notes, the tag change, dollars as CallRail's string, and lead_qualification", async () => {
  const fetch = fakeFetch({ json: { ...wireThread, notes: "Updated note", tags: ["Follow-up", "Urgent"] } });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const updated = await account.smsThreads.update(SmsThreadId("KkMhr"), {
    notes: "Updated note",
    value: 5,
    tags: { replace: ["Urgent", "Follow-up"] },
    leadQualification: "good_lead",
  });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    [
      "PUT",
      "/v3/a/ACC1/sms-threads/KkMhr.json",
      {
        kind: "json",
        value: {
          notes: "Updated note",
          tags: ["Urgent", "Follow-up"],
          append_tags: false,
          value: "5.00",
          lead_qualification: "good_lead",
        },
      },
    ],
  );
  assert.deepEqual([updated.notes, updated.tags], ["Updated note", ["Follow-up", "Urgent"]]);
});
