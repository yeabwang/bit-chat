import "./helpers/env";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import FriendshipModel from "../src/models/friendship.model";
import UserModel from "../src/models/user.model";
import {
  acceptFriendRequestService,
  getPendingRequestsService,
  pairKeyFor,
  removePendingRequestService,
  sendFriendRequestService,
} from "../src/services/friend.service";
import { sendFriendRequestSchema } from "../src/validators/friend.validator";
import { callArgs, queryStub } from "./helpers/mongoose";

const ME = new Types.ObjectId("507f1f77bcf86cd799439011");
const ALICE = "507f1f77bcf86cd799439012";
const CAROL = "507f1f77bcf86cd799439013";
const REQUEST_ID = "507f1f77bcf86cd7994390ff";

const userExists = (count = 1) =>
  mock.method(UserModel, "countDocuments", (() => Promise.resolve(count)) as never);

// findOneAndUpdate with includeResultMetadata resolves to the document plus a
// flag saying whether it already existed, which is how the service tells an
// insert from a hit on an existing pair
const upsertReturns = (value: unknown, updatedExisting: boolean) =>
  mock.method(FriendshipModel, "findOneAndUpdate", (() =>
    Promise.resolve({ value, lastErrorObject: { updatedExisting } })) as never);

const lookupReturns = (friendship: unknown) =>
  mock.method(FriendshipModel, "findById", (() => Promise.resolve(friendship)) as never);

test("a request needs a valid user id", () => {
  assert.throws(() => sendFriendRequestSchema.parse({ userId: "nope" }));
  assert.throws(() => sendFriendRequestSchema.parse({ userId: "" }));
  assert.deepEqual(sendFriendRequestSchema.parse({ userId: ALICE }), {
    userId: ALICE,
  });
});

test("the pair key is the same whichever way round it is built", () => {
  // this is the whole reason two people cannot end up with two rows
  assert.equal(pairKeyFor(ALICE, String(ME)), pairKeyFor(String(ME), ALICE));
});

test("you cannot friend yourself", async () => {
  await assert.rejects(
    sendFriendRequestService(ME, { userId: String(ME) }),
    (error: { statusCode?: number }) => error.statusCode === 400,
  );
});

test("a request to a user who does not exist is refused before any write", async (t) => {
  t.after(() => mock.restoreAll());
  userExists(0);
  const update = upsertReturns(null, false);

  await assert.rejects(
    sendFriendRequestService(ME, { userId: ALICE }),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
  assert.equal(update.mock.callCount(), 0);
});

test("a new request upserts on the pair key rather than inserting", async (t) => {
  t.after(() => mock.restoreAll());
  userExists();
  const update = upsertReturns(
    { _id: REQUEST_ID, requester: ME, recipient: ALICE, status: "pending" },
    false,
  );

  const { created } = await sendFriendRequestService(ME, { userId: ALICE });

  assert.equal(created, true);
  const [filter, change, options] = callArgs(update) as [
    { pairKey: string },
    { $setOnInsert: Record<string, unknown> },
    { upsert: boolean },
  ];
  // check-then-insert leaves a gap two requests can both pass through; the
  // upsert closes it, and the unique index is what actually enforces one row
  assert.equal(filter.pairKey, pairKeyFor(String(ME), ALICE));
  assert.equal(options.upsert, true);
  assert.equal(change.$setOnInsert.status, "pending");
});

test("asking the same person twice is refused", async (t) => {
  t.after(() => mock.restoreAll());
  userExists();
  upsertReturns(
    { _id: REQUEST_ID, requester: ME, recipient: ALICE, status: "pending" },
    true,
  );

  await assert.rejects(sendFriendRequestService(ME, { userId: ALICE }), /already sent/);
});

test("asking someone you are already friends with is refused", async (t) => {
  t.after(() => mock.restoreAll());
  userExists();
  upsertReturns(
    { _id: REQUEST_ID, requester: ME, recipient: ALICE, status: "accepted" },
    true,
  );

  await assert.rejects(
    sendFriendRequestService(ME, { userId: ALICE }),
    /already friends/,
  );
});

test("asking someone who already asked you accepts instead of duplicating", async (t) => {
  t.after(() => mock.restoreAll());
  userExists();

  let call = 0;
  mock.method(FriendshipModel, "findOneAndUpdate", ((...args: unknown[]) => {
    call += 1;

    // first call: the upsert finds their pending request addressed to me
    if (call === 1)
      return Promise.resolve({
        value: {
          _id: REQUEST_ID,
          requester: new Types.ObjectId(ALICE),
          recipient: ME,
          status: "pending",
        },
        lastErrorObject: { updatedExisting: true },
      });

    // second call: the conditional accept
    const [filter, change] = args as [Record<string, unknown>, Record<string, unknown>];
    assert.equal(filter.status, "pending");
    assert.equal(filter.recipient, ME);
    assert.deepEqual(change, { $set: { status: "accepted" } });
    return Promise.resolve({ _id: REQUEST_ID, status: "accepted" });
  }) as never);

  const { created } = await sendFriendRequestService(ME, { userId: ALICE });

  // both sides have now asked, which is consent from both, so they are friends
  assert.equal(created, false);
  assert.equal(call, 2);
});

test("accepting carries recipient and status in the update filter", async (t) => {
  t.after(() => mock.restoreAll());
  const update = mock.method(FriendshipModel, "findOneAndUpdate", (() =>
    Promise.resolve({ _id: REQUEST_ID, status: "accepted" })) as never);

  await acceptFriendRequestService(ME, REQUEST_ID);

  const [filter] = callArgs(update) as [Record<string, unknown>];
  // permission and write are one operation, so a second tap matches nothing
  assert.deepEqual(filter, {
    _id: REQUEST_ID,
    recipient: ME,
    status: "pending",
  });
});

test("the sender cannot accept their own request", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(FriendshipModel, "findOneAndUpdate", (() =>
    Promise.resolve(null)) as never);
  lookupReturns({
    _id: REQUEST_ID,
    requester: ME,
    recipient: new Types.ObjectId(ALICE),
    status: "pending",
  });

  await assert.rejects(
    acceptFriendRequestService(ME, REQUEST_ID),
    /received it can accept/,
  );
});

test("a stranger gets the same 404 as a request that does not exist", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(FriendshipModel, "findOneAndUpdate", (() =>
    Promise.resolve(null)) as never);
  // the row exists but belongs to two other people: telling them apart would
  // let anyone probe ids to learn who has asked whom
  lookupReturns({
    _id: REQUEST_ID,
    requester: new Types.ObjectId(ALICE),
    recipient: new Types.ObjectId(CAROL),
    status: "pending",
  });

  await assert.rejects(
    acceptFriendRequestService(ME, REQUEST_ID),
    (error: { statusCode?: number }) => error.statusCode === 404,
  );
});

test("declining and withdrawing are one delete scoped to either side", async (t) => {
  t.after(() => mock.restoreAll());
  const remove = mock.method(FriendshipModel, "findOneAndDelete", (() =>
    Promise.resolve({ _id: REQUEST_ID })) as never);

  await removePendingRequestService(ME, REQUEST_ID);

  const [filter] = callArgs(remove) as [Record<string, unknown>];
  assert.equal(filter.status, "pending");
  // deleting rather than storing "declined" frees the unique pair key so the
  // two can try again later
  assert.deepEqual(filter.$or, [{ requester: ME }, { recipient: ME }]);
});

test("pending requests are split by who sent them", async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(FriendshipModel, "find", (() =>
    queryStub([
      { _id: "sent", requester: { _id: ME }, recipient: { _id: ALICE } },
      { _id: "received", requester: { _id: ALICE }, recipient: { _id: ME } },
    ])) as never);

  const { incoming, outgoing } = await getPendingRequestsService(ME);

  assert.equal(outgoing.length, 1);
  assert.equal(incoming.length, 1);
  // each row is rendered as the other person, never the raw pair
  assert.deepEqual(outgoing[0].user, { _id: ALICE });
  assert.deepEqual(incoming[0].user, { _id: ALICE });
});
