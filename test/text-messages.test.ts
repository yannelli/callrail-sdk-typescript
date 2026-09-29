import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, ConversationId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const wireConversation = {
  id: "KkMhr",
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

const conversation = {
  id: "KkMhr",
  companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
  initialTrackerId: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  currentTrackerId: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  customerName: "MANN KEVIN",
  customerPhoneNumber: "+14042223333",
  initialTrackingNumber: "+14045556677",
  currentTrackingNumber: "+17703334455",
  lastMessageAt: "2016-07-28T19:26:43.578Z",
  state: "active",
  companyTimeZone: "America/New_York",
  formattedCustomerPhoneNumber: "404-222-3333",
  formattedInitialTrackingNumber: "404-555-6677",
  formattedCurrentTrackingNumber: "770-333-4455",
  formattedCustomerName: "Mann Kevin",
};

test("list with fields keeps every lead status the webhook table lists, beyond the two the REST table lists", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 2,
      conversations: [
        {
          ...wireConversation,
          lead_status: "good_lead",
          source: "Google Organic",
          recent_messages: [
            {
              direction: "outgoing",
              content: "Awww! But I was going into Tosche Station to pick up some power converters!",
              created_at: "2016-07-28T19:28:21.578Z",
              type: "sms",
              media_urls: [],
            },
          ],
        },
        { ...wireConversation, id: "KZaGY", lead_status: "previously_marked_good_lead", source: null, recent_messages: [] },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.textMessages.list({ search: "Mann", fields: ["leadStatus", "source"] });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    ["/v3/a/ACC1/text-messages.json", { search: "Mann", fields: "lead_status,source" }],
  );
  assert.deepEqual(page.items, [
    {
      ...conversation,
      leadStatus: "good_lead",
      source: "Google Organic",
      recentMessages: [
        {
          direction: "outgoing",
          content: "Awww! But I was going into Tosche Station to pick up some power converters!",
          createdAt: "2016-07-28T19:28:21.578Z",
          type: "sms",
          mediaUrls: [],
        },
      ],
    },
    { ...conversation, id: "KZaGY", leadStatus: "previously_marked_good_lead", source: null, recentMessages: [] },
  ]);
});

test("get returns the conversation with a page of messages, reading an integer id and an upper-case type", async () => {
  const fetch = fakeFetch({
    json: {
      ...wireConversation,
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 1,
      messages: [
        {
          id: 23456,
          content: "These aren't the droids you're looking for.",
          created_at: "2016-07-28T19:28:21.578Z",
          status: null,
          direction: "incoming",
          type: "MMS",
          media_urls: [
            "https://api.callrail.com/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/text-messages/SCIdef84068eb9a6679b40abc9bd1718a2c/media/0",
          ],
          user: { id: "USR8154748ae6bd4e278a7cddd38a662f4f", name: "Bob Smith" },
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const { conversation: fetched, messages } = await account.textMessages.get(ConversationId("KkMhr"));

  assert.deepEqual([fetch.requests[0]?.path, fetch.requests[0]?.query], ["/v3/a/ACC1/text-messages/KkMhr.json", {}]);
  assert.deepEqual(fetched, conversation);
  assert.deepEqual(messages.items, [
    {
      id: "23456",
      content: "These aren't the droids you're looking for.",
      createdAt: "2016-07-28T19:28:21.578Z",
      status: null,
      direction: "incoming",
      type: "mms",
      mediaUrls: [
        "https://api.callrail.com/v3/a/ACC8154748ae6bd4e278a7cddd38a662f4f/text-messages/SCIdef84068eb9a6679b40abc9bd1718a2c/media/0",
      ],
      user: { id: "USR8154748ae6bd4e278a7cddd38a662f4f", name: "Bob Smith" },
    },
  ]);
});
