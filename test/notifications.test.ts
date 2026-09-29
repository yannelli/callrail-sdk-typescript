import assert from "node:assert/strict";
import { test } from "node:test";
import { CallRail, NotificationId, TrackerId, UserId } from "../src/index.js";
import { fakeFetch } from "../src/testing.js";

test("list puts the filters on the query string and folds the send flags into channels", async () => {
  const fetch = fakeFetch({
    json: {
      page: 1,
      per_page: 100,
      total_pages: 1,
      total_records: 2,
      notifications: [
        {
          id: 100,
          user_id: "USR8154748ae6bd4e278a7cddd38a662f4f",
          alert_type: "all",
          call_enabled: true,
          company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
          name: "All Calls and All Texts for Katherine's Ice Cream",
          send_desktop: false,
          send_email: true,
          send_push: false,
          sms_enabled: true,
          tracker_id: null,
        },
        {
          id: 101,
          user_id: "USR8154748ae6bd4e278a7cddd38a662f4f",
          alert_type: "all",
          call_enabled: true,
          company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
          name: "All Calls and All Texts for Google Organic",
          send_desktop: false,
          send_email: true,
          send_push: true,
          sms_enabled: true,
          tracker_id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
        },
      ],
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const page = await account.notifications.list({ userId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f"), channel: "email" });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.query, fetch.requests[0]?.body],
    [
      "GET",
      "/v3/a/ACC1/notifications.json",
      { notification_type: "send_email", user_id: "USR8154748ae6bd4e278a7cddd38a662f4f" },
      { kind: "none" },
    ],
  );
  assert.deepEqual(page.items, [
    {
      id: 100,
      name: "All Calls and All Texts for Katherine's Ice Cream",
      userId: "USR8154748ae6bd4e278a7cddd38a662f4f",
      email: null,
      agentId: null,
      agentName: null,
      companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
      companyName: null,
      trackerId: null,
      trackerName: null,
      callAlerts: "all",
      smsAlerts: true,
      channels: ["email"],
    },
    {
      id: 101,
      name: "All Calls and All Texts for Google Organic",
      userId: "USR8154748ae6bd4e278a7cddd38a662f4f",
      email: null,
      agentId: null,
      agentName: null,
      companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
      companyName: null,
      trackerId: "TRK8154748ae6bd4e278a7cddd38a662f4f",
      trackerName: null,
      callAlerts: "all",
      smsAlerts: true,
      channels: ["email", "push"],
    },
  ]);
});

test("create spells callAlerts and channels as CallRail's flags", async () => {
  const fetch = fakeFetch({
    status: 201,
    json: {
      id: 127,
      user_id: "USR8154748ae6bd4e278a7cddd38a662f4f",
      alert_type: "vm_only",
      call_enabled: true,
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      company_name: "Katherine's Ice Cream",
      send_desktop: true,
      send_email: true,
      send_push: true,
      sms_enabled: true,
      tracker_id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
      tracker_name: "Google Organic",
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const created = await account.notifications.create({
    recipient: { userId: UserId("USR8154748ae6bd4e278a7cddd38a662f4f") },
    scope: { trackerId: TrackerId("TRK8154748ae6bd4e278a7cddd38a662f4f") },
    channels: ["email", "push", "desktop"],
    callAlerts: "vm_only",
    smsAlerts: true,
  });

  assert.deepEqual(fetch.requests[0]?.body, {
    kind: "json",
    value: {
      user_id: "USR8154748ae6bd4e278a7cddd38a662f4f",
      tracker_id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
      call_enabled: true,
      alert_type: "vm_only",
      sms_enabled: true,
      send_email: true,
      send_push: true,
      send_desktop: true,
    },
  });
  assert.deepEqual(created, {
    id: 127,
    name: null,
    userId: "USR8154748ae6bd4e278a7cddd38a662f4f",
    email: null,
    agentId: null,
    agentName: null,
    companyId: "COM8154748ae6bd4e278a7cddd38a662f4f",
    companyName: "Katherine's Ice Cream",
    trackerId: "TRK8154748ae6bd4e278a7cddd38a662f4f",
    trackerName: "Google Organic",
    callAlerts: "vm_only",
    smsAlerts: true,
    channels: ["email", "push", "desktop"],
  });
});

test("turning call alerts off sends call_enabled false and reads the stale alert_type as no call alerts", async () => {
  const fetch = fakeFetch({
    json: {
      id: 127,
      user_id: "USR8154748ae6bd4e278a7cddd38a662f4f",
      alert_type: "vm_only",
      call_enabled: false,
      company_id: "COM8154748ae6bd4e278a7cddd38a662f4f",
      company_name: "Katherine's Ice Cream",
      send_desktop: true,
      send_email: true,
      send_push: true,
      sms_enabled: true,
      tracker_id: "TRK8154748ae6bd4e278a7cddd38a662f4f",
      tracker_name: "Google Organic",
    },
  });
  const account = new CallRail({ apiKey: "key-1", fetch }).account("ACC1");

  const updated = await account.notifications.update(NotificationId(127), { callAlerts: null, smsAlerts: true });

  assert.deepEqual(
    [fetch.requests[0]?.method, fetch.requests[0]?.path, fetch.requests[0]?.body],
    ["PUT", "/v3/a/ACC1/notifications/127.json", { kind: "json", value: { call_enabled: false, sms_enabled: true } }],
  );
  assert.deepEqual([updated.callAlerts, updated.smsAlerts, updated.channels], [null, true, ["email", "push", "desktop"]]);
});
