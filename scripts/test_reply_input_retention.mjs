/**
 * Automated Verification Script: Universal Reply Modal Input Retention
 * Simulates React state, ref guards, and DOM innerHTML across background heartbeat cycles
 */

import assert from 'node:assert';

console.log('🧪 Starting Universal Reply Modal Input Retention Test Suite...\n');

// Mock component harness replicating ReplyModal.tsx logic
class MockReplyModalHarness {
  constructor(item, accounts, initialDraft = '') {
    this.item = item;
    this.accounts = accounts;
    this.initialDraft = initialDraft;
    this.isWhatsApp = item?.channel === 'whatsapp';

    const defaultAccount =
      accounts.find((a) => a.id === item?.account_id) || accounts[0] || null;
    this.selectedAccountId = defaultAccount?.id || '';

    // Refs
    this.editorElement = { innerHTML: '' };
    this.initializedItemIdRef = { current: null };
    this.userHasEditedRef = { current: false };
    this.currentSignatureRef = { current: '' };
    this.activeAccountIdRef = { current: this.selectedAccountId };
    this.bodyHtml = initialDraft || '';

    // Trigger initial render effect
    this.runEffect();
  }

  runEffect() {
    if (!this.item) return;

    // 1. Initial load for this item/modal
    if (this.initializedItemIdRef.current !== this.item.id) {
      this.initializedItemIdRef.current = this.item.id;
      this.userHasEditedRef.current = false;
      this.activeAccountIdRef.current = this.selectedAccountId;

      const activeAccount = this.accounts.find((a) => a.id === this.selectedAccountId);
      const sig = !this.isWhatsApp && activeAccount?.signature ? activeAccount.signature : '';
      this.currentSignatureRef.current = sig;

      let initialText = this.initialDraft || '';
      if (sig) {
        initialText = initialText ? `${initialText}<br><br>${sig}` : `<br><br>${sig}`;
      }

      this.bodyHtml = initialText;
      this.editorElement.innerHTML = initialText;
      return;
    }

    // 2. User explicitly switched email account in dropdown
    if (!this.isWhatsApp && this.activeAccountIdRef.current !== this.selectedAccountId) {
      this.activeAccountIdRef.current = this.selectedAccountId;
      const activeAccount = this.accounts.find((a) => a.id === this.selectedAccountId);
      const newSig = activeAccount?.signature || '';
      const oldSig = this.currentSignatureRef.current;
      this.currentSignatureRef.current = newSig;

      let currentHtml = this.editorElement.innerHTML;
      if (oldSig && currentHtml.includes(oldSig)) {
        currentHtml = currentHtml.replace(oldSig, newSig);
      } else if (newSig) {
        currentHtml = currentHtml ? `${currentHtml}<br><br>${newSig}` : `<br><br>${newSig}`;
      }
      this.editorElement.innerHTML = currentHtml;
      this.bodyHtml = currentHtml;
      return;
    }

    // Guard: heartbeat or accounts re-render does not overwrite active typing
  }

  userType(text) {
    this.userHasEditedRef.current = true;
    this.editorElement.innerHTML = text;
    this.bodyHtml = text;
  }

  changeAccount(newAccountId) {
    this.selectedAccountId = newAccountId;
    this.runEffect();
  }

  simulateHeartbeat(newAccounts) {
    this.accounts = newAccounts;
    this.runEffect();
  }
}

// -----------------------------------------------------------------------------
// Test 1: WhatsApp active user typing preservation across 10 heartbeat cycles
// -----------------------------------------------------------------------------
console.log('▶ Test 1: WhatsApp Typing Retention across 10 Heartbeat Cycles');
const waItem = {
  id: 'wa-thread-001',
  channel: 'whatsapp',
  contact_name: 'Carlos Gomez',
  title: 'Contract review',
};
const baseAccounts = [
  { id: 'acc-1', email: 'vlad@example.com', signature: '<p>Best regards,<br>Vlad</p>' },
  { id: 'acc-2', email: 'support@example.com', signature: '<p>Support Team</p>' },
];

const waModal = new MockReplyModalHarness(waItem, baseAccounts, '');
assert.strictEqual(waModal.editorElement.innerHTML, '', 'Initial WhatsApp draft should be empty');

const userTypedWhatsApp = 'Buenos días Carlos, recibí el documento adjunto y lo revisaré hoy mismo.';
waModal.userType(userTypedWhatsApp);
assert.strictEqual(waModal.editorElement.innerHTML, userTypedWhatsApp);

// Simulate 10 background sync heartbeats with newly allocated accounts arrays
for (let i = 1; i <= 10; i++) {
  const clonedAccounts = JSON.parse(JSON.stringify(baseAccounts));
  waModal.simulateHeartbeat(clonedAccounts);
  assert.strictEqual(
    waModal.editorElement.innerHTML,
    userTypedWhatsApp,
    `Heartbeat ${i} wiped active WhatsApp typing!`
  );
}
console.log('  ✔ PASS: WhatsApp typing completely intact after 10 heartbeats.\n');

// -----------------------------------------------------------------------------
// Test 2: Email active user typing preservation across 10 heartbeat cycles
// -----------------------------------------------------------------------------
console.log('▶ Test 2: Email Typing & Signature Retention across 10 Heartbeat Cycles');
const emailItem = {
  id: 'email-thread-999',
  channel: 'email',
  account_id: 'acc-1',
  sender_email: 'finance@vendor.com',
  title: 'Invoice #4029',
};

const emailModal = new MockReplyModalHarness(emailItem, baseAccounts, '');
const initialExpected = `<br><br>${baseAccounts[0].signature}`;
assert.strictEqual(emailModal.editorElement.innerHTML, initialExpected);

const userTypedEmail = `Thank you for sending the updated invoice.<br><br>${baseAccounts[0].signature}`;
emailModal.userType(userTypedEmail);

for (let i = 1; i <= 10; i++) {
  const clonedAccounts = JSON.parse(JSON.stringify(baseAccounts));
  emailModal.simulateHeartbeat(clonedAccounts);
  assert.strictEqual(
    emailModal.editorElement.innerHTML,
    userTypedEmail,
    `Heartbeat ${i} wiped active Email typing!`
  );
}
console.log('  ✔ PASS: Email typing completely intact after 10 heartbeats.\n');

// -----------------------------------------------------------------------------
// Test 3: Email Account Switch gracefully swaps signatures while keeping message
// -----------------------------------------------------------------------------
console.log('▶ Test 3: Account Switch preserves typed text while updating signature');
emailModal.changeAccount('acc-2');
const expectedAfterSwitch = `Thank you for sending the updated invoice.<br><br>${baseAccounts[1].signature}`;
assert.strictEqual(
  emailModal.editorElement.innerHTML,
  expectedAfterSwitch,
  'Account switch did not preserve typed message or update signature correctly!'
);

// Another 5 heartbeats on the new account
for (let i = 1; i <= 5; i++) {
  const clonedAccounts = JSON.parse(JSON.stringify(baseAccounts));
  emailModal.simulateHeartbeat(clonedAccounts);
  assert.strictEqual(
    emailModal.editorElement.innerHTML,
    expectedAfterSwitch,
    `Heartbeat ${i} after switch corrupted text!`
  );
}
console.log('  ✔ PASS: Account switch updated signature and preserved typed text across heartbeats.\n');

console.log('🎉 All 3 Universal Reply Input Retention tests passed successfully!');
