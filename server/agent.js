// Minimal Node/Express approval server for Human-in-the-Loop
// Usage:
//   npm install
//   HMAC_SECRET=replace-me npm start

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const approvals = new Map(); // in-memory store; replace with DB in production
const HMAC_SECRET = process.env.HMAC_SECRET || 'replace-me';

function signPayload(payload) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(JSON.stringify(payload)).digest('hex');
}

function evaluatePolicy(action) {
  // Very small rule-evaluator that matches keys present in agent/policy.json logic.
  // For the prototype we hardcode a couple of rules.
  if (!action || !action.actionType) return null;

  if (action.actionType === 'charge') {
    const amount = Number(action.amount || 0);
    if (amount >= 1000) return { id: 'financial_high', approvalTTLMinutes: 120, requiredApprovals: 2 };
    if (amount < 10) return null; // auto allow
    return { id: 'financial_medium', approvalTTLMinutes: 60, requiredApprovals: 1 };
  }

  if (action.actionType === 'send_email') {
    const to = (action.to || '').toString();
    if (!to) return null;
    const domain = to.split('@')[1] || '';
    if (domain && domain !== 'example.com') return { id: 'send_email_external', approvalTTLMinutes: 120, requiredApprovals: 1 };
    return null; // internal, auto-allow
  }

  if (action.actionType === 'delete') {
    if (action.environment === 'production') return { id: 'delete_production', approvalTTLMinutes: 60, requiredApprovals: 1 };
  }

  return null;
}

function notifyApprovers(rule, record) {
  // Prototype: just log to console. In production, send email, Slack, or push notification.
  console.log(`[notify] rule=${rule.id} approvalId=${record.id} requester=${record.requester}`);
}

function isAuthorized(approver, ruleId) {
  // Prototype authorization: in a real system verify approver identity via SSO/roles.
  // Here we allow any non-empty approver string.
  return !!approver;
}

function persistApproval(rec) {
  // Prototype: already in-memory. Hook up DB persistence here.
  approvals.set(rec.id, rec);
}

function notifyAgentOfDecision(rec) {
  // Prototype: log. Replace with webhook, message queue, or agent callback.
  console.log(`[decision] approvalId=${rec.id} state=${rec.state} approver=${rec.approver}`);
}

// Create approval endpoint
app.post('/api/approvals', (req, res) => {
  const { action, requester } = req.body;
  const rule = evaluatePolicy(action);
  if (!rule) {
    // Not sensitive: immediate execution response
    return res.json({ status: 'auto', execute: true });
  }
  const id = crypto.randomUUID();
  const deadline = Date.now() + (rule.approvalTTLMinutes || 120) * 60 * 1000;
  const record = { id, action, requester: requester || 'agent', ruleId: rule.id, state: 'pending', createdAt: Date.now(), deadline };
  record.signature = signPayload(record);
  approvals.set(id, record);
  notifyApprovers(rule, record);
  return res.json({ status: 'pending', approvalId: id, signature: record.signature });
});

// Get approval metadata
app.get('/api/approvals/:id', (req, res) => {
  const id = req.params.id;
  const rec = approvals.get(id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  return res.json(rec);
});

// Post decision
app.post('/api/approvals/:id/decision', (req, res) => {
  const id = req.params.id;
  const { decision, approver, comment } = req.body; // decision: approve|deny
  const rec = approvals.get(id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  if (Date.now() > rec.deadline) return res.status(410).json({ error: 'Expired' });
  if (!isAuthorized(approver, rec.ruleId)) return res.status(403).json({ error: 'Not authorized' });

  rec.state = decision === 'approve' ? 'approved' : 'denied';
  rec.approver = approver;
  rec.comment = comment || '';
  rec.decisionAt = Date.now();
  rec.decisionSignature = signPayload({ id, decision: rec.state, approver, decisionAt: rec.decisionAt });
  persistApproval(rec);
  notifyAgentOfDecision(rec);
  return res.json({ status: 'ok', record: rec });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Approval server listening on port ${PORT}`);
});
