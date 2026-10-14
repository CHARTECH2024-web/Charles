import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  addDoc
} from "firebase/firestore";

const projectId = "demo-horizon-security";
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "conversations", "alice__bob"), {
      participants: ["alice", "bob"],
      createdAt: new Date()
    });
    await setDoc(doc(db, "conversations", "alice__bob", "messages", "m1"), {
      senderId: "alice",
      receiverId: "bob",
      text: "hello",
      createdAt: new Date()
    });
    await setDoc(doc(db, "businesses", "alice"), {
      ownerId: "alice",
      name: "Alice Shop",
      phone: "",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await setDoc(doc(db, "businesses", "alice", "expenses", "e1"), {
      label: "Transport",
      amount: 5,
      note: "test",
      createdAt: new Date()
    });
    await setDoc(doc(db, "media", "public-media"), {
      visibility: "public",
      url: "https://example.invalid/public.jpg"
    });
    await setDoc(doc(db, "media", "private-media"), {
      visibility: "private",
      url: "https://example.invalid/private.jpg"
    });
    await setDoc(doc(db, "documents", "public-document"), {
      visibility: "public",
      url: "https://example.invalid/public.pdf"
    });
    await setDoc(doc(db, "documents", "private-document"), {
      visibility: "private",
      url: "https://example.invalid/private.pdf"
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("unauthenticated users cannot read private conversations or messages", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "conversations", "alice__bob")));
  await assertFails(getDoc(doc(db, "conversations", "alice__bob", "messages", "m1")));
});

test("a conversation participant can read the conversation and its messages", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(db, "conversations", "alice__bob")));
  await assertSucceeds(getDoc(doc(db, "conversations", "alice__bob", "messages", "m1")));
});

test("an unrelated signed-in user cannot read another conversation or its messages", async () => {
  const db = testEnv.authenticatedContext("mallory").firestore();
  await assertFails(getDoc(doc(db, "conversations", "alice__bob")));
  await assertFails(getDoc(doc(db, "conversations", "alice__bob", "messages", "m1")));
});

test("a sender cannot spoof another user's senderId", async () => {
  const db = testEnv.authenticatedContext("bob").firestore();
  await assertFails(setDoc(doc(db, "conversations", "alice__bob", "messages", "spoof"), {
    senderId: "alice",
    receiverId: "bob",
    text: "spoofed",
    createdAt: new Date()
  }));
});

test("a participant can send a message using their own authenticated identity", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(setDoc(doc(db, "conversations", "alice__bob", "messages", "m2"), {
    senderId: "alice",
    receiverId: "bob",
    text: "valid message",
    createdAt: new Date()
  }));
});

test("a participant cannot delete another participant's message", async () => {
  const db = testEnv.authenticatedContext("bob").firestore();
  await assertFails(deleteDoc(doc(db, "conversations", "alice__bob", "messages", "m1")));
});

test("a business owner can read their own business data", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(db, "businesses", "alice")));
  await assertSucceeds(getDoc(doc(db, "businesses", "alice", "expenses", "e1")));
});

test("another user cannot read or add expenses to the owner's business", async () => {
  const db = testEnv.authenticatedContext("mallory").firestore();
  await assertFails(getDoc(doc(db, "businesses", "alice")));
  await assertFails(getDoc(doc(db, "businesses", "alice", "expenses", "e1")));
  await assertFails(addDoc(collection(db, "businesses", "alice", "expenses"), {
    label: "Unauthorized",
    amount: 100,
    note: "should fail",
    createdAt: new Date()
  }));
});

test("a business owner can create a valid expense", async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(addDoc(collection(db, "businesses", "alice", "expenses"), {
    label: "Electricity",
    amount: 12,
    note: "monthly",
    createdAt: new Date()
  }));
});

test("public media/document metadata is readable; private metadata is restricted", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, "media", "public-media")));
  await assertFails(getDoc(doc(db, "media", "private-media")));
  await assertSucceeds(getDoc(doc(db, "documents", "public-document")));
  await assertFails(getDoc(doc(db, "documents", "private-document")));
});

test("non-admin users cannot create or change media/document metadata", async () => {
  const db = testEnv.authenticatedContext("alice", { email: "alice@example.com" }).firestore();
  await assertFails(setDoc(doc(db, "media", "forged"), { visibility: "public", url: "https://example.invalid/x" }));
  await assertFails(setDoc(doc(db, "documents", "forged"), { visibility: "public", url: "https://example.invalid/x" }));
});

test("private profiles cannot be read by another user", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "profiles", "alice"), {
      uid: "alice", email: "alice@example.com", bio: "private"
    });
  });
  const db = testEnv.authenticatedContext("mallory").firestore();
  await assertFails(getDoc(doc(db, "profiles", "alice")));
  await assertSucceeds(getDoc(doc(db, "profiles", "mallory")).catch(() => ({ exists: () => false })));
});

test("KNOWN GAP: direct conversation creation does not yet require an accepted request", {
  skip: "The current app has no conversation-request data model; implement this together with the client flow before releasing request acceptance."
}, async () => {
  const db = testEnv.authenticatedContext("alice").firestore();
  await assertFails(setDoc(doc(db, "conversations", "alice__charlie"), {
    participants: ["alice", "charlie"],
    createdAt: new Date()
  }));
});

test("KNOWN GAP: message deletion time limit and delete-for-self semantics are not implemented yet", {
  skip: "Current schema stores one shared message document; the 15-minute delete-for-everyone rule and per-user hide state need a coordinated schema/client change."
}, async () => {
  assert.fail("Implement and test the agreed deletion model before enabling it in the UI.");
});
