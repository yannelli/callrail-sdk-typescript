import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  WebhookError,
  isWebhookKind,
  readWebhook,
  signWebhook,
  verifyWebhook,
  type WebhookRequest,
} from "../src/webhooks.js";

const signingKey = "072e77e426f92738a72fe23c4d1953b4";
const signature = "UZAHbUdfm3GqL7qzilGozGzWV64=";
const body = readFileSync(new URL("../../test/fixtures/webhook-test-vector.txt", import.meta.url));
const vector = JSON.parse(body.toString("utf8")) as Record<string, unknown>;

function signed(payload: unknown): WebhookRequest {
  const bytes = Buffer.from(JSON.stringify(payload));
  return { body: bytes, signature: signWebhook(bytes, signingKey), signingKey };
}

const textReceived = {
  id: 879204976,
  resource_id: "SCI0c14896tw1b64fb970ab62aaf4fbefd9",
  source_number: "770-555-5555",
  destination_number: "770-123-4567",
  content: "CallRail is the best! ",
  message_type: "sms",
  media_urls: [],
  timestamp: "2017-10-23T15:57:18.826-04:00",
  lead_status: null,
  conversation_id: "crpLH",
  company_resource_id: "COM834847e9f4bb4f9h8ll29eb173fe658e",
  person_resource_id: "PERb122rc301ec45f5yy021d4jj180c1a79",
};

test("the published test vector verifies and decodes as a post-call event", () => {
  const event = readWebhook("post_call", { body, signature, signingKey });
  const { call } = event;

  assert.equal(event.event, "post_call");
  assert.equal(event.timestamp, "2018-02-19T13:41:00.236-05:00");
  assert.deepEqual(
    {
      id: call.id,
      duration: call.duration,
      recordingDuration: call.recordingDuration,
      value: call.value,
      companyId: call.companyId,
      trackerId: call.trackerId,
      goodLeadCallId: call.goodLeadCallId,
      custom: call.custom,
      speakerPercent: call.speakerPercent,
      tags: call.tags,
      leadStatus: call.leadStatus,
      startTime: call.startTime,
    },
    {
      id: "766970532",
      duration: 13,
      recordingDuration: 8,
      value: null,
      companyId: "155920786",
      trackerId: "354024023",
      goodLeadCallId: "715587840",
      custom: null,
      speakerPercent: null,
      tags: [],
      leadStatus: "previously_marked_good_lead",
      startTime: "2018-02-19T13:41:00.236-05:00",
    },
  );
  assert.equal("milestones" in call, false);
});

test("signWebhook reproduces the published signature", () => {
  assert.equal(signWebhook(body, signingKey), signature);
});

test("a body one byte off is rejected even though it is still valid JSON", () => {
  const withNewline = Buffer.concat([body, Buffer.from("\n")]);
  assert.equal(signWebhook(withNewline, signingKey), "slJqKZkCtpJp2y989jy0zSM7tz4=");
  assert.throws(
    () => readWebhook("post_call", { body: withNewline, signature, signingKey }),
    (error: unknown) => error instanceof WebhookError && error.reason === "bad_signature",
  );
});

test("a missing or repeated Signature header is rejected", () => {
  assert.throws(
    () => verifyWebhook({ body, signature: undefined, signingKey }),
    (error: unknown) => error instanceof WebhookError && error.reason === "missing_signature",
  );
  assert.throws(
    () => verifyWebhook({ body, signature: [signature, signature], signingKey }),
    (error: unknown) => error instanceof WebhookError && error.reason === "bad_signature",
  );
});

test("the documented text payloads decode, and a received text has no agent", () => {
  assert.deepEqual(readWebhook("sms_received", signed(textReceived)), {
    event: "sms_received",
    timestamp: "2017-10-23T15:57:18.826-04:00",
    message: {
      id: "879204976",
      resourceId: "SCI0c14896tw1b64fb970ab62aaf4fbefd9",
      agent: null,
      sourceNumber: "770-555-5555",
      destinationNumber: "770-123-4567",
      content: "CallRail is the best! ",
      messageType: "sms",
      mediaUrls: [],
      leadStatus: null,
      conversationId: "crpLH",
      companyId: "COM834847e9f4bb4f9h8ll29eb173fe658e",
      personId: "PERb122rc301ec45f5yy021d4jj180c1a79",
    },
  });

  const sent = readWebhook(
    "sms_sent",
    signed({
      id: 980561249,
      resource_id: "SCI0c14896tw1b64fb970ab62aaf4fbefd9",
      agent: "Keith Rail",
      source_number: "770-123-4567",
      destination_number: "770-555-5555",
      content: "Well, that is good to know!",
      message_type: "sms",
      media_urls: [],
      timestamp: "2017-10-23T16:00:53.286-04:00",
      lead_status: null,
      conversation_id: "crpLH",
      company_resource_id: "COM834847e9f4bb4f9h8ll29eb173fe658e",
      person_resource_id: "PERb122rc301ec45f5yy021d4jj180c1a79",
    }),
  );
  assert.deepEqual([sent.event, sent.message.id, sent.message.agent], ["sms_sent", "980561249", "Keith Rail"]);
});

test("the documented form payload decodes without a timestamp", () => {
  const payload = {
    id: 123456789,
    company_id: 987654321,
    form_data: {
      form_field1: "this is the message",
      form_field2: "support@callrail.com",
      form_field3: "John Q. Customer",
    },
    form_url: "http://www.example.com/form",
    landing_page_url: "http://www.example.com/",
    referrer: "direct",
    referring_url: "www.google.com",
    submitted_at: "2017-10-24T09:40:18.000-04:00",
    first_form: true,
    source: "Google Organic",
    keywords: "clinic hospital",
    campaign: "Website",
    medium: "Organic",
    utm_source: "search",
    utm_medium: "organic",
    utm_campaign: "Google Organic",
  };

  assert.deepEqual(readWebhook("form_captured", signed(payload)), {
    event: "form_captured",
    submission: {
      id: "123456789",
      companyId: "987654321",
      formData: {
        form_field1: "this is the message",
        form_field2: "support@callrail.com",
        form_field3: "John Q. Customer",
      },
      formUrl: "http://www.example.com/form",
      landingPageUrl: "http://www.example.com/",
      referrer: "direct",
      referringUrl: "www.google.com",
      submittedAt: "2017-10-24T09:40:18.000-04:00",
      firstForm: true,
      source: "Google Organic",
      keywords: "clinic hospital",
      campaign: "Website",
      medium: "Organic",
      utmSource: "search",
      utmMedium: "organic",
      utmCampaign: "Google Organic",
    },
  });
});

test("the documented Convert Assist payload decodes", () => {
  const payload = {
    person_resource_id: "PERb122rc301ec45f5yy021d4jj180c1a79",
    last_interaction_resource_id: "CALc14896tw1b64fb970ab62aaf4fbefd9",
    last_interaction_type: "Call",
    answers: [
      {
        answer_key: "Action plan",
        answer_text: "1. Confirm the reservation\n2. Send the confirmation email\n3. Follow up with the customer",
      },
      {
        answer_key: "Smart follow-up",
        answer_text: "Dear Bob, I wanted to follow up on our conversation. Please let me know if you have any questions.",
      },
    ],
    interaction_count: 5,
    timestamp: "2024-10-23T16:00:53.286-04:00",
  };

  assert.deepEqual(readWebhook("convert_assist_complete", signed(payload)), {
    event: "convert_assist_complete",
    timestamp: "2024-10-23T16:00:53.286-04:00",
    convertAssist: {
      personId: "PERb122rc301ec45f5yy021d4jj180c1a79",
      lastInteractionId: "CALc14896tw1b64fb970ab62aaf4fbefd9",
      lastInteractionType: "Call",
      interactionCount: 5,
      answers: [
        {
          answerKey: "Action plan",
          answerText: "1. Confirm the reservation\n2. Send the confirmation email\n3. Follow up with the customer",
        },
        {
          answerKey: "Smart follow-up",
          answerText: "Dear Bob, I wanted to follow up on our conversation. Please let me know if you have any questions.",
        },
      ],
    },
  });
});

test("a modified-call payload holds the new values and names the changed fields", () => {
  const note = "this is a note written after the call was completed";
  const event = readWebhook("updated_call", signed({ ...vector, note, changes: ["note"] }));

  assert.deepEqual([event.event, event.call.id, event.call.note, event.changes], ["updated_call", "766970532", note, ["note"]]);
});

test("an in-progress call reads a missing answered or voicemail as false, and an ended call rejects it", () => {
  const ringing: Record<string, unknown> = { ...vector, duration: null };
  delete ringing["answered"];
  delete ringing["voicemail"];

  const { call } = readWebhook("pre_call", signed(ringing));
  assert.deepEqual([call.answered, call.voicemail, call.duration], [false, false, null]);
  assert.throws(
    () => readWebhook("post_call", signed(ringing)),
    (error: unknown) => error instanceof WebhookError && error.reason === "malformed_body" && error.path === "$.answered",
  );
});

test("maxAgeMs accepts an event exactly that old and rejects one a millisecond older", () => {
  const sentAt = Date.parse(textReceived.timestamp);
  const readAt = (ageMs: number) =>
    readWebhook("sms_received", signed(textReceived), { maxAgeMs: 300_000, now: () => sentAt + ageMs });

  assert.equal(readAt(300_000).message.id, "879204976");
  assert.throws(
    () => readAt(300_001),
    (error: unknown) => error instanceof WebhookError && error.reason === "stale",
  );
});

test("isWebhookKind accepts documented kinds and rejects inherited property names", () => {
  assert.deepEqual(
    ["post_call", "convert_assist_complete", "toString", "__proto__", "page_view"].map(isWebhookKind),
    [true, true, false, false, false],
  );
});
