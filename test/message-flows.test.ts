import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, CompanyId, MessageFlowId, TagId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

const REPLY = "Thanks for reaching out to our business! Someone will respond to you shortly.";

const createdFlow = {
  id: "MFL1e9075f25b1949928b0db7323d775064",
  name: "Intake number message flow",
  updated_at: "2025-02-26T11:11:53.353-05:00",
  tracker_ids: [],
  initial_step_id: "MFS6fa29e4c8b1347fcbf2e8d9731b7061d",
  steps: {
    MFS6fa29e4c8b1347fcbf2e8d9731b7061d: {
      id: "MFS6fa29e4c8b1347fcbf2e8d9731b7061d",
      type: "tag",
      initial_step: true,
      next_step_id: "MFS0dcb13a29ae64f14a8c9eaf4e932b5d7",
      tag_ids: [993186],
    },
    MFS0dcb13a29ae64f14a8c9eaf4e932b5d7: {
      id: "MFS0dcb13a29ae64f14a8c9eaf4e932b5d7",
      type: "sms_response",
      initial_step: false,
      next_step_id: null,
      message: REPLY,
      first_text: true,
    },
  },
};

test("create sends the step list as a map keyed by id with only the first step initial", async () => {
  const fetch = fakeFetch({ status: 201, json: createdFlow });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const flow = await account.messageFlows.create({
    companyId: CompanyId("COM8154748ae6bd4e278a7cddd38a662f4f"),
    name: "Intake number message flow",
    steps: [
      { type: "tag", id: "tag-01", tagIds: [TagId(993186)], nextStepId: "response-01" },
      { type: "sms_response", id: "response-01", message: REPLY, firstText: true, nextStepId: null },
    ],
  });

  assert.deepEqual(fetch.requests[0]?.body, {
    kind: "json",
    value: {
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      name: "Intake number message flow",
      initial_step_id: "tag-01",
      steps: {
        "tag-01": { id: "tag-01", type: "tag", initial_step: true, next_step_id: "response-01", tag_ids: [993186] },
        "response-01": {
          id: "response-01",
          type: "sms_response",
          initial_step: false,
          next_step_id: null,
          message: REPLY,
          first_text: true,
        },
      },
    },
  });
  assert.deepEqual(flow, {
    id: "MFL1e9075f25b1949928b0db7323d775064",
    name: "Intake number message flow",
    updatedAt: "2025-02-26T11:11:53.353-05:00",
    trackerIds: [],
    steps: [
      {
        type: "tag",
        id: "MFS6fa29e4c8b1347fcbf2e8d9731b7061d",
        nextStepId: "MFS0dcb13a29ae64f14a8c9eaf4e932b5d7",
        tagIds: [993186],
      },
      { type: "sms_response", id: "MFS0dcb13a29ae64f14a8c9eaf4e932b5d7", nextStepId: null, message: REPLY, firstText: true },
    ],
  });
});

test("get puts the initial step first, reads schedule windows, and keeps an unknown step type as other", async () => {
  const fetch = fakeFetch({
    json: {
      id: "MFL1e9075f25b1949928b0db7323d775064",
      name: "After-hours and weekend response",
      updated_at: "2025-02-26T11:11:53.353-05:00",
      tracker_ids: ["TRK4d1b8f7c9e3a42fdb625c0f94a17e380"],
      initial_step_id: "MFS6fa29e4c8b1347fcbf2e8d9731b7061d",
      steps: {
        MFSab81c45d290947e1b6ec18f0cd3a9b23: {
          id: "MFSab81c45d290947e1b6ec18f0cd3a9b23",
          type: "tag",
          initial_step: false,
          next_step_id: null,
          tag_ids: [1236698],
        },
        MFSfe01: { id: "MFSfe01", type: "ai_reply", initial_step: false, next_step_id: null, tone: "friendly" },
        MFS6fa29e4c8b1347fcbf2e8d9731b7061d: {
          id: "MFS6fa29e4c8b1347fcbf2e8d9731b7061d",
          type: "schedule",
          initial_step: true,
          next_step_id: "MFSab81c45d290947e1b6ec18f0cd3a9b23",
          branches: [
            {
              times: [
                { day: "weekdays", end_time: "2359", start_time: "1800" },
                { day: "weekends", end_time: "2300", start_time: "0000" },
              ],
              next_step_id: "MFSab81c45d290947e1b6ec18f0cd3a9b23",
            },
          ],
        },
      },
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const flow = await account.messageFlows.get(MessageFlowId("MFL1e9075f25b1949928b0db7323d775064"));

  assert.deepEqual(flow.trackerIds, ["TRK4d1b8f7c9e3a42fdb625c0f94a17e380"]);
  assert.deepEqual(flow.steps, [
    {
      type: "schedule",
      id: "MFS6fa29e4c8b1347fcbf2e8d9731b7061d",
      nextStepId: "MFSab81c45d290947e1b6ec18f0cd3a9b23",
      branches: [
        {
          times: [
            { day: "weekdays", startTime: "1800", endTime: "2359" },
            { day: "weekends", startTime: "0000", endTime: "2300" },
          ],
          nextStepId: "MFSab81c45d290947e1b6ec18f0cd3a9b23",
        },
      ],
    },
    { type: "tag", id: "MFSab81c45d290947e1b6ec18f0cd3a9b23", nextStepId: null, tagIds: [1236698] },
    {
      type: "other",
      wireType: "ai_reply",
      id: "MFSfe01",
      nextStepId: null,
      raw: { id: "MFSfe01", type: "ai_reply", initial_step: false, next_step_id: null, tone: "friendly" },
    },
  ]);
});

test("create throws TypeError without sending when step ids repeat or a nextStepId names no step", () => {
  const fetch = fakeFetch();
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");
  const companyId = CompanyId("COM1");

  assert.throws(
    () =>
      account.messageFlows.create({
        companyId,
        name: "Twice",
        steps: [
          { type: "no_response", id: "step-01", nextStepId: null },
          { type: "no_response", id: "step-01", nextStepId: null },
        ],
      }),
    { name: "TypeError", message: 'Message flow step ids must be unique. Got "step-01" twice.' },
  );
  assert.throws(
    () =>
      account.messageFlows.create({
        companyId,
        name: "Dangling branch",
        steps: [
          {
            type: "schedule",
            id: "schedule-01",
            nextStepId: null,
            branches: [{ times: [{ day: "any_day", startTime: "0800", endTime: "1700" }], nextStepId: "response-01" }],
          },
        ],
      }),
    { name: "TypeError", message: 'nextStepId must name a step in the list. Step "schedule-01" names "response-01".' },
  );
  assert.equal(fetch.requests.length, 0);
});

test("update sends initial_step_id and steps only when steps are given", async () => {
  const fetch = fakeFetch({ json: createdFlow }, { json: createdFlow });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");
  const id = MessageFlowId("MFL1e9075f25b1949928b0db7323d775064");

  await account.messageFlows.update(id, { name: "Intake number message flow" });
  await account.messageFlows.update(id, {
    steps: [{ type: "forward_message", id: "forward-01", destinationNumber: "+15558675309", nextStepId: null }],
  });

  assert.deepEqual(
    fetch.requests.map((request) => [request.method, request.path, request.body]),
    [
      ["PUT", "/v3/a/ACC1/message-flows/MFL1e9075f25b1949928b0db7323d775064.json", { kind: "json", value: { name: "Intake number message flow" } }],
      [
        "PUT",
        "/v3/a/ACC1/message-flows/MFL1e9075f25b1949928b0db7323d775064.json",
        {
          kind: "json",
          value: {
            initial_step_id: "forward-01",
            steps: {
              "forward-01": {
                id: "forward-01",
                type: "forward_message",
                initial_step: true,
                next_step_id: null,
                destination_number: "+15558675309",
              },
            },
          },
        },
      ],
    ],
  );
});
