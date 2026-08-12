# Human-in-the-Loop — Approval prototype

This repository contains a minimal prototype of an autonomous agent approval workflow: sensitive actions are paused and require human approval before proceeding.

Files added:
- agent/policy.json — policy examples for sensitivity rules and auto-allow rules.
- server/agent.js — minimal Node/Express approval server (in-memory store).
- web/approval-modal.html — a simple UI to view and decide on approvals.

Quick start (prototype):

1. Install dependencies

   npm install

2. Start the server (set a secret in production)

   HMAC_SECRET=replace-me npm start

3. Create an approval (example using curl):

   curl -X POST http://localhost:3000/api/approvals -H "Content-Type: application/json" -d '{"requester":"agent-1","action":{"actionType":"send_email","to":"finance@vendor.com","subject":"Invoice Payment","amount":1250}}'

   The server will respond with {"status":"pending","approvalId":"..."}.

4. Open the approval UI in your browser:

   http://localhost:3000/web/approval-modal.html?id=<approvalId>

Notes & next steps:
- This is a prototype. For production:
  - Persist approvals to a database (Postgres/Mongo/Dynamo).
  - Add authentication and role-based authorization for approvers (OAuth/SSO).
  - Replace console notifications with email/Slack/push.
  - Use signed webhooks or message queues to notify agents of decisions.
  - Add tests and monitoring.
