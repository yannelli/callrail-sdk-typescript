import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, PersonId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("list returns every field by default, and fields narrows the lead while still sending id", async () => {
  const fetch = fakeFetch(
    {
      json: {
        page: 1,
        per_page: 100,
        total_pages: 1,
        total_records: 2,
        leads: [
          {
            id: "PER8154748ae6bd4e278a7cddd38a662f4f",
            name: "Jane Smith",
            phone: "+14045551234",
            email: "jane@example.com",
            created_at: "2024-01-15T10:30:00.000Z",
            company_id: "COM1234567890abcdef",
            company_name: "Acme Corp",
          },
          {
            id: "PER9265859bf7ce5f389b8deee49b773g5g",
            name: "John Doe",
            phone: "+14045555678",
            email: "john@example.com",
            created_at: "2024-01-14T08:15:00.000Z",
            company_id: "COM1234567890abcdef",
            company_name: "Acme Corp",
          },
        ],
      },
    },
    {
      json: {
        page: 1,
        per_page: 100,
        total_pages: 1,
        total_records: 1,
        leads: [{ id: "PER8154748ae6bd4e278a7cddd38a662f4f", name: "Jane Smith" }],
      },
    },
  );
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const everything = await account.leads.list();
  const named = await account.leads.list({ fields: ["name"], sort: { by: "name", order: "asc" } });

  assert.deepEqual(
    fetch.requests.map((request) => [request.path, request.query]),
    [
      ["/v3/a/ACC1/leads.json", {}],
      ["/v3/a/ACC1/leads.json", { fields: "id,name", sort: "name", order: "asc" }],
    ],
  );
  assert.deepEqual(everything.items, [
    {
      id: "PER8154748ae6bd4e278a7cddd38a662f4f",
      name: "Jane Smith",
      phone: "+14045551234",
      email: "jane@example.com",
      createdAt: "2024-01-15T10:30:00.000Z",
      companyId: "COM1234567890abcdef",
      companyName: "Acme Corp",
    },
    {
      id: "PER9265859bf7ce5f389b8deee49b773g5g",
      name: "John Doe",
      phone: "+14045555678",
      email: "john@example.com",
      createdAt: "2024-01-14T08:15:00.000Z",
      companyId: "COM1234567890abcdef",
      companyName: "Acme Corp",
    },
  ]);
  assert.deepEqual(named.items, [{ id: "PER8154748ae6bd4e278a7cddd38a662f4f", name: "Jane Smith" }]);
});

test("timeline reads lead_creation_time as createdAt and keeps an unknown event type as other", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 2,
      total_records: 120,
      lead: {
        customer_name: "John Doe",
        customer_phone_number: "+15551234567",
        total_interactions: 8,
        first_touch: {
          touchpoint_type: "organic_search",
          source: "google",
          medium: "organic",
          created_at: "2024-01-15T10:30:00Z",
        },
        last_touch: { touchpoint_type: "direct", created_at: "2024-02-01T14:20:00Z" },
        lead_creation: { touchpoint_type: "organic_search", source: "google", lead_creation_time: "2024-01-15T10:35:00Z" },
        lead_qualification: { touchpoint_type: "paid_search", source: "google", created_at: "2024-01-20T09:15:00Z" },
        tags: [{ id: "TAG123", name: "Hot Lead", color: "red" }],
        convert_assist: {
          id: "CAI123",
          created_at: "2024-02-01T14:20:00Z",
          last_interaction_id: "CALL456",
          last_interaction_type: "call",
          interaction_count: 3,
          status: "answered",
          answers: [{ answer_key: "intent", answer_text: "Looking to purchase" }],
        },
        voice_assist: true,
        transcript: true,
        source: "google",
        medium: "organic",
        campaign: null,
        landing_page_url: "https://example.com/",
        referrer_url: null,
        click_id: null,
      },
      timeline: [
        {
          type: "call",
          id: "CALL123",
          event_date: "2024-02-01T14:20:00Z",
          customer_name: "John Doe",
          customer_phone_number: "+15551234567",
          direction: "inbound",
          duration: 300,
          answered: true,
        },
        {
          type: "form_submission",
          id: "FORM456",
          event_date: "2024-01-20T09:15:00Z",
          form_name: "Contact Us",
          form_url: "https://example.com/contact",
          form_fields: { name: "John Doe", email: "john@example.com", message: "I'm interested in your services" },
          form_submission_url: "https://example.com/thank-you",
        },
        {
          type: "sms",
          id: "SMS789",
          event_date: "2024-01-18T11:30:00Z",
          message_content: "Hello, I have a question about pricing",
          message_phone_number: "+15551234567",
          message_type: "sms",
          thread_id: "SMS789",
        },
        {
          type: "chat",
          id: "CHAT321",
          event_date: "2024-01-16T16:45:00Z",
          chat_subject: "Product inquiry",
          chat_id: "CHAT321",
          conversation_participant_phone_number: "+15551234567",
        },
        {
          type: "milestone",
          id: "TOUCH654",
          event_date: "2024-01-15T10:30:00Z",
          milestone_type: "lead_created",
          touchpoint_type: "organic_search",
        },
        { type: "web_session", id: "WEB1", event_date: "2024-01-15T10:29:00Z", pages: 3 },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const { lead, events } = await account.leads.timeline(PersonId("PER8154748ae6bd4e278a7cddd38a662f4f"), { perPage: 100 });

  assert.deepEqual(
    [fetch.requests[0]?.path, fetch.requests[0]?.query],
    ["/v3/a/ACC1/leads/PER8154748ae6bd4e278a7cddd38a662f4f/timeline.json", { per_page: "100" }],
  );
  assert.deepEqual(lead, {
    customerName: "John Doe",
    customerPhoneNumber: "+15551234567",
    totalInteractions: 8,
    firstTouch: { touchpointType: "organic_search", source: "google", medium: "organic", createdAt: "2024-01-15T10:30:00Z" },
    lastTouch: { touchpointType: "direct", source: null, medium: null, createdAt: "2024-02-01T14:20:00Z" },
    leadCreation: { touchpointType: "organic_search", source: "google", medium: null, createdAt: "2024-01-15T10:35:00Z" },
    leadQualification: { touchpointType: "paid_search", source: "google", medium: null, createdAt: "2024-01-20T09:15:00Z" },
    tags: [{ id: "TAG123", name: "Hot Lead", color: "red" }],
    convertAssist: {
      id: "CAI123",
      createdAt: "2024-02-01T14:20:00Z",
      lastInteractionId: "CALL456",
      lastInteractionType: "call",
      interactionCount: 3,
      status: "answered",
      answers: [{ answerKey: "intent", answerText: "Looking to purchase" }],
    },
    voiceAssist: true,
    transcript: true,
    source: "google",
    medium: "organic",
    campaign: null,
    landingPageUrl: "https://example.com/",
    referrerUrl: null,
    clickId: null,
  });
  assert.deepEqual([events.page, events.totalPages, events.totalRecords], [1, 2, 120]);
  assert.deepEqual(events.items, [
    {
      type: "call",
      id: "CALL123",
      eventDate: "2024-02-01T14:20:00Z",
      customerName: "John Doe",
      customerPhoneNumber: "+15551234567",
      direction: "inbound",
      duration: 300,
      answered: true,
    },
    {
      type: "form_submission",
      id: "FORM456",
      eventDate: "2024-01-20T09:15:00Z",
      formName: "Contact Us",
      formUrl: "https://example.com/contact",
      formFields: { name: "John Doe", email: "john@example.com", message: "I'm interested in your services" },
      formSubmissionUrl: "https://example.com/thank-you",
    },
    {
      type: "sms",
      id: "SMS789",
      eventDate: "2024-01-18T11:30:00Z",
      messageContent: "Hello, I have a question about pricing",
      messagePhoneNumber: "+15551234567",
      messageType: "sms",
      threadId: "SMS789",
    },
    {
      type: "chat",
      id: "CHAT321",
      eventDate: "2024-01-16T16:45:00Z",
      chatId: "CHAT321",
      chatSubject: "Product inquiry",
      conversationParticipantPhoneNumber: "+15551234567",
    },
    {
      type: "milestone",
      id: "TOUCH654",
      eventDate: "2024-01-15T10:30:00Z",
      milestoneType: "lead_created",
      touchpointType: "organic_search",
    },
    {
      type: "other",
      id: "WEB1",
      eventDate: "2024-01-15T10:29:00Z",
      wireType: "web_session",
      raw: { type: "web_session", id: "WEB1", event_date: "2024-01-15T10:29:00Z", pages: 3 },
    },
  ]);
});
