import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CallRailError, CompanyId, SourceTrackerId, TrackerId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const company = { id: "COM8154748ae6bd4e278a7cddd38a662f4f", name: "Bob's Auto Shop" };
const GREETING = "This call will be recorded for quality assurance";

const sessionTracker = {
  id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  name: "Website Call Tracker",
  type: "session",
  status: "active",
  destination_number: "+15553104554",
  tracking_numbers: ["+14045551111", "+14045552222", "+14045553333", "+14045554444"],
  whisper_message: "Call from [source]",
  sms_supported: true,
  sms_enabled: true,
  company,
  call_flow: { type: "basic", recording_enabled: true, destination_number: "+15553104554", greeting_text: GREETING },
  source: { google: ["paid", "organic"], bing: ["paid", "organic"], yahoo: ["paid", "organic"] },
  created_at: "2011-07-05T19:06:10Z",
  disabled_at: null,
};

const sourceTracker = {
  id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
  name: "My Billboard",
  type: "source",
  status: "active",
  destination_number: "+15553104554",
  tracking_numbers: ["+14045551114"],
  whisper_message: null,
  sms_supported: true,
  sms_enabled: true,
  company,
  call_flow: {
    type: "basic",
    recording_enabled: false,
    destination_number: "+15553104554",
    greeting_text: GREETING,
    greeting_recording_url: null,
  },
  source: { type: "search", search_engine: "google", search_type: "organic" },
  created_at: "2011-07-05T19:06:10Z",
  disabled_at: null,
};

test("createSession sends the pool request, the session rules, and a text greeting", async () => {
  const fetch = fakeFetch({ status: 201, json: sessionTracker });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const tracker = await account.trackers.createSession({
    name: "Website Call Tracker",
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    swapTargets: ["7704761456", "7705551234"],
    whisperMessage: "Call from [source]",
    smsEnabled: true,
    poolSize: 10,
    callFlow: { type: "basic", recordingEnabled: true, destinationNumber: "+15553104554", greeting: { text: GREETING } },
    poolNumbers: { kind: "local", near: "+15553104554", areaCode: "555" },
    source: { google: ["paid", "organic"], bing: ["paid", "organic"], yahoo: ["paid", "organic"] },
  });

  assert.deepEqual(fetch.requests[0]?.body, {
    kind: "json",
    value: {
      type: "session",
      name: "Website Call Tracker",
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      call_flow: { type: "basic", destination_number: "+15553104554", recording_enabled: true, greeting_text: GREETING },
      whisper_message: "Call from [source]",
      swap_targets: ["7704761456", "7705551234"],
      sms_enabled: true,
      pool_size: 10,
      pool_numbers: { local: "+15553104554", area_code: "555" },
      source: { google: ["paid", "organic"], bing: ["paid", "organic"], yahoo: ["paid", "organic"] },
    },
  });
  assert.deepEqual(tracker, {
    id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
    name: "Website Call Tracker",
    type: "session",
    status: "active",
    destinationNumber: "+15553104554",
    trackingNumbers: ["+14045551111", "+14045552222", "+14045553333", "+14045554444"],
    whisperMessage: "Call from [source]",
    smsSupported: true,
    smsEnabled: true,
    company: { id: "COM8154748ae6bd4e278a7cddd38a662f4f", name: "Bob's Auto Shop" },
    callFlow: { type: "basic", destinationNumber: "+15553104554", recordingEnabled: true, greeting: { text: GREETING } },
    messageFlow: null,
    source: { google: ["paid", "organic"], bing: ["paid", "organic"], yahoo: ["paid", "organic"] },
    createdAt: "2011-07-05T19:06:10Z",
    disabledAt: null,
  });
});

test("createSource sends a toll-free request, a search source, and a recorded greeting with greeting_text null", async () => {
  const fetch = fakeFetch({ status: 201, json: sourceTracker });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const tracker = await account.trackers.createSource({
    name: "My Billboard",
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    callFlow: {
      type: "basic",
      recordingEnabled: false,
      destinationNumber: "+15553104554",
      greeting: { recordingUrl: "https://example.com/greeting.mp3" },
    },
    trackingNumber: { kind: "toll_free", areaCode: "888" },
    source: { type: "search", searchEngine: "google", searchType: "organic" },
    campaignName: "Summer billboard campaign",
  });

  assert.deepEqual(fetch.requests[0]?.body, {
    kind: "json",
    value: {
      type: "source",
      name: "My Billboard",
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      call_flow: {
        type: "basic",
        destination_number: "+15553104554",
        recording_enabled: false,
        greeting_text: null,
        greeting_recording_url: "https://example.com/greeting.mp3",
      },
      tracking_number: { toll_free: true, area_code: "888" },
      source: { type: "search", search_engine: "google", search_type: "organic" },
      campaign_name: "Summer billboard campaign",
    },
  });
  assert.deepEqual([tracker.type, tracker.source, tracker.callFlow], [
    "source",
    { type: "search", searchEngine: "google", searchType: "organic" },
    { type: "basic", destinationNumber: "+15553104554", recordingEnabled: false, greeting: { text: GREETING } },
  ]);
});

test("get reads an advanced call flow with integer step ids, a message flow sent as an array, and the all source", async () => {
  const fetch = fakeFetch({
    json: {
      ...sessionTracker,
      call_flow: {
        type: "advanced",
        recording_enabled: false,
        initial_step_id: "CRS8154748ae6bd4e278a7cddd38a662f4f",
        steps: [
          { destination_number: "+15551234567", timeout: 60, timeout_step_id: null, id: 344126405, type: "dial" },
          {
            prompt_type: "text",
            prompt_recording_id: null,
            prompt_text: "Thank you for your support call. Please leave a message.",
            transcribe: false,
            id: 250778404,
            type: "voicemail",
          },
          {
            prompt_type: "text",
            prompt_recording_id: null,
            prompt_text: "Press 1 for Sales, press 2 for Support.",
            menu_options: [
              { key: "1", description: "Forward to Sales", next_step_id: 344126405 },
              { key: "2", description: "Forward to Support", next_step_id: 250778404 },
            ],
            id: 210884509,
            type: "menu",
          },
          { id: 998877, type: "round_robin", members: ["+15550001111"] },
        ],
      },
      message_flow: [{ type: "advanced", id: "MFL0ff8f768fed24a428895dd617042c6db" }],
      source: { type: "all" },
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const tracker = await account.trackers.get(TrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"));

  assert.deepEqual(tracker.callFlow, {
    type: "advanced",
    recordingEnabled: false,
    initialStepId: "CRS8154748ae6bd4e278a7cddd38a662f4f",
    steps: [
      { type: "dial", id: "344126405", destinationNumber: "+15551234567", timeout: 60, timeoutStepId: null },
      {
        type: "voicemail",
        id: "250778404",
        promptType: "text",
        promptText: "Thank you for your support call. Please leave a message.",
        promptRecordingId: null,
        transcribe: false,
      },
      {
        type: "menu",
        id: "210884509",
        promptType: "text",
        promptText: "Press 1 for Sales, press 2 for Support.",
        promptRecordingId: null,
        menuOptions: [
          { key: "1", description: "Forward to Sales", nextStepId: "344126405" },
          { key: "2", description: "Forward to Support", nextStepId: "250778404" },
        ],
      },
      {
        type: "other",
        wireType: "round_robin",
        id: "998877",
        raw: { id: 998877, type: "round_robin", members: ["+15550001111"] },
      },
    ],
  });
  assert.deepEqual(tracker.messageFlow, { type: "advanced", id: "MFL0ff8f768fed24a428895dd617042c6db" });
  assert.equal(tracker.source, "all");
});

test("list with a type sends it, reads direct visitors from the session rules, and rejects a tracker of the other type", async () => {
  const fetch = fakeFetch(
    {
      json: {
        page: 1,
        per_page: 250,
        total_pages: 1,
        total_records: 1,
        trackers: [
          {
            ...sessionTracker,
            swap_targets: ["7704761456"],
            source: { inverted: true, type: "direct", google: ["organic"], yahoo: ["organic"], bing: ["organic"] },
          },
        ],
      },
    },
    { json: { page: 1, per_page: 250, total_pages: 1, total_records: 1, trackers: [sourceTracker] } },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.trackers.list({ type: "session", fields: ["swapTargets"] });
  const rejected = account.trackers.list({ type: "session" });

  assert.deepEqual(fetch.requests[0]?.query, { type: "session", fields: "swap_targets" });
  assert.deepEqual(
    page.items.map((tracker) => [tracker.type, tracker.source, tracker.swapTargets]),
    [["session", { inverted: true, direct: true, google: ["organic"], yahoo: ["organic"], bing: ["organic"] }, ["7704761456"]]],
  );
  await assert.rejects(rejected, (error: unknown) => {
    assert.ok(error instanceof CallRailError);
    assert.deepEqual(error.problem, { kind: "unexpected_response", status: 200, reason: "decode", path: "$.trackers[0].type" });
    return true;
  });
});

test("createSession throws TypeError for a pool size outside 4 to 50 without sending", () => {
  const fetch = fakeFetch();
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  assert.throws(
    () =>
      account.trackers.createSession({
        name: "Website visitors",
        companyId: CompanyId("COM1"),
        callFlow: { type: "basic", destinationNumber: "+13035550199", recordingEnabled: true },
        poolSize: 60,
        poolNumbers: { kind: "area_code", areaCode: "303" },
        source: "all",
      }),
    { name: "TypeError", message: "poolSize must be a whole number from 4 to 50. Got 60." },
  );
  assert.equal(fetch.requests.length, 0);
});

test("updateSource clears the whisper message with an empty string and removes the message flow with null", async () => {
  const fetch = fakeFetch({ json: sourceTracker });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const tracker = await account.trackers.updateSource(SourceTrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f"), {
    whisperMessage: null,
    smsEnabled: true,
    messageFlow: null,
    replaceTrackingNumber: "+14044556789",
  });

  assert.equal(fetch.requests[0]?.method, "PUT");
  assert.deepEqual(fetch.requests[0]?.body, {
    kind: "json",
    value: { whisper_message: "", sms_enabled: true, message_flow: null, replace_tracking_number: "+14044556789" },
  });
  assert.deepEqual([tracker.whisperMessage, tracker.messageFlow], [null, null]);
});
