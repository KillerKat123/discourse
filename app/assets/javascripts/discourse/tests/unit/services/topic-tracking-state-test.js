import { module, test } from "qunit";
import DiscourseURL from "discourse/lib/url";
import { getProperties } from "@ember/object";
import Category from "discourse/models/category";
import {
  currentUser,
  fakeTime,
  publishToMessageBus,
  updateCurrentUser,
} from "discourse/tests/helpers/qunit-helpers";
import { NotificationLevels } from "discourse/lib/notification-levels";
import Topic from "discourse/models/topic";
import createStore from "discourse/tests/helpers/create-store";
import sinon from "sinon";
import User from "discourse/models/user";
import { setupTest } from "ember-qunit";

module("Unit | Service | topic-tracking-state", function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.clock = fakeTime("2012-12-31 12:00");

    this.currentUser = User.resetCurrent(currentUser());
    this.owner.register("service:current-user", currentUser, {
      instantiate: false,
    });

    this.trackingState = this.owner.lookup("service:topic-tracking-state");
    // this.trackingState.currentUser is undefined because the service
    // was instantiated before this
  });

  hooks.afterEach(function () {
    this.clock.restore();
  });

  test("ZZZ bulk loading states only calls onStateChange callback once", function (assert) {
    let stateCallbackCalled = 0;

    this.trackingState.onStateChange(() => {
      stateCallbackCalled += 1;
    });

    this.trackingState.loadStates([
      { topic_id: 1 },
      { topic_id: 2 },
      { topic_id: 3 },
    ]);

    assert.strictEqual(stateCallbackCalled, 1, "callback is only called once");
  });

  test("tag counts", function (assert) {
    this.trackingState.loadStates([
      {
        topic_id: 1,
        last_read_post_number: null,
        tags: ["foo", "baz"],
        created_in_new_period: true,
      },
      {
        topic_id: 2,
        last_read_post_number: null,
        tags: ["baz"],
        created_in_new_period: true,
      },
      {
        topic_id: 3,
        last_read_post_number: null,
        tags: ["random"],
      },
      {
        topic_id: 4,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: ["pending"],
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 5,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: ["bar", "pending"],
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 6,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: null,
        notification_level: NotificationLevels.TRACKING,
      },
    ]);

    const tagCounts = this.trackingState.countTags(["baz", "pending"]);

    assert.strictEqual(tagCounts["baz"].newCount, 2, "baz tag new counts");
    assert.strictEqual(
      tagCounts["baz"].unreadCount,
      0,
      "baz tag unread counts"
    );
    assert.strictEqual(
      tagCounts["pending"].unreadCount,
      2,
      "pending tag unread counts"
    );
    assert.strictEqual(
      tagCounts["pending"].newCount,
      0,
      "pending tag new counts"
    );
  });

  test("tag counts - with total", function (assert) {
    this.trackingState.loadStates([
      {
        topic_id: 1,
        last_read_post_number: null,
        tags: ["foo", "baz"],
        created_in_new_period: true,
      },
      {
        topic_id: 2,
        last_read_post_number: null,
        tags: ["baz"],
        created_in_new_period: true,
      },
      {
        topic_id: 3,
        last_read_post_number: null,
        tags: ["random"],
      },
      {
        topic_id: 4,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: ["pending"],
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 5,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: ["bar", "pending"],
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 6,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: null,
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 7,
        last_read_post_number: 7,
        highest_post_number: 7,
        tags: ["foo", "baz"],
      },
      {
        topic_id: 8,
        last_read_post_number: 4,
        highest_post_number: 4,
        tags: ["pending"],
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 9,
        last_read_post_number: 88,
        highest_post_number: 88,
        tags: ["pending"],
        notification_level: NotificationLevels.TRACKING,
      },
    ]);

    const states = this.trackingState.countTags(["baz", "pending"], {
      includeTotal: true,
    });

    assert.strictEqual(states["baz"].newCount, 2, "baz tag new counts");
    assert.strictEqual(states["baz"].unreadCount, 0, "baz tag unread counts");
    assert.strictEqual(states["baz"].totalCount, 3, "baz tag total counts");
    assert.strictEqual(
      states["pending"].unreadCount,
      2,
      "pending tag unread counts"
    );
    assert.strictEqual(states["pending"].newCount, 0, "pending tag new counts");
    assert.strictEqual(
      states["pending"].totalCount,
      4,
      "pending tag total counts"
    );
  });

  test("forEachTracked", function (assert) {
    this.trackingState.loadStates([
      {
        topic_id: 1,
        last_read_post_number: null,
        tags: ["foo", "new"],
      },
      {
        topic_id: 2,
        last_read_post_number: null,
        tags: ["new"],
      },
      {
        topic_id: 3,
        last_read_post_number: null,
        tags: ["random"],
        created_in_new_period: true,
      },
      {
        topic_id: 4,
        last_read_post_number: 1,
        highest_post_number: 7,
        category_id: 7,
        tags: ["bug"],
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 5,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: ["bar", "bug"],
        category_id: 7,
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 6,
        last_read_post_number: 1,
        highest_post_number: 7,
        tags: null,
        notification_level: NotificationLevels.TRACKING,
      },
    ]);

    let randomUnread = 0;
    let randomNew = 0;
    let sevenUnread = 0;
    let sevenNew = 0;

    this.trackingState.forEachTracked((topic, isNew, isUnread) => {
      if (topic.category_id === 7) {
        if (isNew) {
          sevenNew += 1;
        }
        if (isUnread) {
          sevenUnread += 1;
        }
      }

      if (topic.tags?.includes("random")) {
        if (isNew) {
          randomNew += 1;
        }
        if (isUnread) {
          randomUnread += 1;
        }
      }
    });

    assert.strictEqual(randomNew, 1, "random tag new");
    assert.strictEqual(randomUnread, 0, "random tag unread");
    assert.strictEqual(sevenNew, 0, "category seven new");
    assert.strictEqual(sevenUnread, 2, "category seven unread");
  });

  test("sync - delayed new topics for backend list are removed", function (assert) {
    this.trackingState.loadStates([
      { last_read_post_number: null, topic_id: 111 },
    ]);

    this.trackingState.updateSeen(111, 7);
    const list = {
      topics: [
        {
          highest_post_number: null,
          id: 111,
          unread_posts: 10,
        },
      ],
    };

    this.trackingState.sync(list, "new");
    assert.strictEqual(
      list.topics.length,
      0,
      "expect new topic to be removed as it was seen"
    );
  });

  test("sync - delayed unread topics for backend list are marked seen", function (assert) {
    this.trackingState.loadStates([
      { last_read_post_number: null, topic_id: 111 },
    ]);

    this.trackingState.updateSeen(111, 7);
    const list = {
      topics: [
        Topic.create({
          highest_post_number: null,
          id: 111,
          unread_posts: 10,
          unseen: true,
          prevent_sync: false,
        }),
      ],
    };

    this.trackingState.sync(list, "unread");
    assert.strictEqual(
      list.topics[0].unseen,
      false,
      "expect unread topic to be marked as seen"
    );
    assert.strictEqual(
      list.topics[0].prevent_sync,
      true,
      "expect unread topic to be marked as prevent_sync"
    );
  });

  test("sync - remove topic from state for performance if it is seen and has no unread or new posts and there are too many tracked topics in memory", function (assert) {
    this.trackingState.loadStates([{ topic_id: 111 }, { topic_id: 222 }]);
    this.trackingState.set("_trackedTopicLimit", 1);

    const list = {
      topics: [
        Topic.create({
          id: 111,
          unseen: false,
          seen: true,
          unread_posts: 0,
          prevent_sync: false,
        }),
      ],
    };

    this.trackingState.sync(list, "unread");
    assert.notOk(
      this.trackingState.states.has("t111"),
      "expect state for topic 111 to be deleted"
    );

    this.trackingState.loadStates([{ topic_id: 111 }, { topic_id: 222 }]);
    this.trackingState.set("_trackedTopicLimit", 5);
    this.trackingState.sync(list, "unread");
    assert.ok(
      this.trackingState.states.has("t111"),
      "expect state for topic 111 not to be deleted"
    );
  });

  test("sync - no changes to state", function (assert) {
    this.trackingState.loadStates([
      { topic_id: 111, last_read_post_number: null },
      { topic_id: 222, last_read_post_number: null },
    ]);

    let stateCallbackCalled = 0;

    this.trackingState.onStateChange(() => {
      stateCallbackCalled += 1;
    });

    const list = {
      topics: [
        Topic.create({
          id: 111,
          last_read_post_number: null,
          unseen: true,
        }),
        Topic.create({
          id: 222,
          last_read_post_number: null,
          unseen: true,
        }),
      ],
    };

    this.trackingState.sync(list, "unread");

    assert.strictEqual(stateCallbackCalled, 0, "callback is not called");
  });

  test("sync - updates state to match list topic for unseen and unread/new topics", function (assert) {
    this.trackingState.loadStates([
      { topic_id: 111, last_read_post_number: 0 },
      { topic_id: 222, last_read_post_number: 1 },
    ]);

    let stateCallbackCalled = 0;

    this.trackingState.onStateChange(() => {
      stateCallbackCalled += 1;
    });

    const list = {
      topics: [
        Topic.create({
          id: 111,
          unseen: true,
          seen: false,
          unread_posts: 0,
          highest_post_number: 20,
          category_id: 1,
          tags: ["pending"],
        }),
        Topic.create({
          id: 222,
          unseen: false,
          seen: true,
          unread_posts: 3,
          highest_post_number: 20,
        }),
      ],
    };

    this.trackingState.sync(list, "unread");

    let state111 = this.trackingState.findState(111);
    let state222 = this.trackingState.findState(222);
    assert.strictEqual(
      state111.last_read_post_number,
      null,
      "unseen topics get last_read_post_number reset to null"
    );
    assert.propEqual(
      getProperties(state111, "highest_post_number", "tags", "category_id"),
      { highest_post_number: 20, tags: ["pending"], category_id: 1 },
      "highest_post_number, category, and tags are set for a topic"
    );
    assert.strictEqual(
      state222.last_read_post_number,
      17,
      "last_read_post_number is highest_post_number - (unread + new)"
    );

    assert.strictEqual(stateCallbackCalled, 1, "callback is only called once");
  });

  test("sync - states missing from the topic list are updated based on the selected filter", function (assert) {
    this.trackingState.loadStates([
      {
        topic_id: 111,
        last_read_post_number: 4,
        highest_post_number: 5,
        notification_level: NotificationLevels.TRACKING,
      },
      {
        topic_id: 222,
        last_read_post_number: null,
        seen: false,
        notification_level: NotificationLevels.TRACKING,
        created_in_new_period: true,
      },
    ]);

    const list = {
      topics: [],
    };

    this.trackingState.sync(list, "unread");
    assert.strictEqual(
      this.trackingState.findState(111).last_read_post_number,
      5,
      "last_read_post_number set to highest post number to pretend read"
    );

    this.trackingState.sync(list, "new");
    assert.strictEqual(
      this.trackingState.findState(222).last_read_post_number,
      1,
      "last_read_post_number set to 1 to pretend not new"
    );
  });

  module(
    "establishChannels - /unread MessageBus channel payloads processed",
    function (unreadHooks) {
      let unreadTopicPayload = {
        topic_id: 111,
        message_type: "unread",
        payload: {
          category_id: 123,
          topic_tag_ids: [44],
          tags: ["pending"],
          highest_post_number: 10,
          created_at: "2012-11-31 12:00:00 UTC",
          archetype: "regular",
        },
      };

      unreadHooks.beforeEach(function () {
        updateCurrentUser({
          username: "chuck",
        });

        this.trackingState.establishChannels();
        this.trackingState.loadStates([
          {
            topic_id: 111,
            last_read_post_number: 4,
            highest_post_number: 4,
            notification_level: NotificationLevels.TRACKING,
          },
        ]);
      });

      test("message count is incremented", async function (assert) {
        await publishToMessageBus(`/unread`, unreadTopicPayload);

        assert.strictEqual(
          this.trackingState.messageCount,
          1,
          "message count incremented"
        );
      });

      test("state is modified and callback is called", async function (assert) {
        let stateCallbackCalled = 0;

        this.trackingState.onStateChange(() => {
          stateCallbackCalled += 1;
        });

        await publishToMessageBus(`/unread`, unreadTopicPayload);

        assert.deepEqual(
          this.trackingState.findState(111),
          {
            topic_id: 111,
            category_id: 123,
            topic_tag_ids: [44],
            tags: ["pending"],
            last_read_post_number: 4,
            highest_post_number: 10,
            notification_level: NotificationLevels.TRACKING,
            created_at: "2012-11-31 12:00:00 UTC",
            archetype: "regular",
          },
          "topic state updated"
        );

        assert.strictEqual(
          stateCallbackCalled,
          1,
          "state change callback called"
        );
      });

      test("adds incoming so it is counted in topic lists", async function (assert) {
        this.trackingState.trackIncoming("all");
        await publishToMessageBus(`/unread`, unreadTopicPayload);

        assert.deepEqual(
          this.trackingState.newIncoming,
          [111],
          "unread topic is incoming"
        );
        assert.strictEqual(
          this.trackingState.incomingCount,
          1,
          "incoming count is increased"
        );
      });

      test("correct tag and category filters for different lists", function (assert) {
        this.trackingState.trackIncoming("unread");
        assert.strictEqual(this.trackingState.filterCategory, undefined);
        assert.strictEqual(this.trackingState.filterTag, undefined);
        assert.strictEqual(this.trackingState.filter, "unread");

        this.trackingState.trackIncoming("tag/test/l/latest");
        assert.strictEqual(this.trackingState.filterCategory, undefined);
        assert.strictEqual(this.trackingState.filterTag, "test");
        assert.strictEqual(this.trackingState.filter, "latest");

        this.trackingState.trackIncoming("c/cat/sub-cat/6/l/latest");
        assert.strictEqual(this.trackingState.filterCategory.id, 6);
        assert.strictEqual(this.trackingState.filterTag, undefined);
        assert.strictEqual(this.trackingState.filter, "latest");

        this.trackingState.trackIncoming("tags/c/cat/sub-cat/6/test/l/latest");
        assert.strictEqual(this.trackingState.filterCategory.id, 6);
        assert.strictEqual(this.trackingState.filterTag, "test");
        assert.strictEqual(this.trackingState.filter, "latest");
      });

      test("correctly infers missing information", async function (assert) {
        await publishToMessageBus(`/unread`, {
          ...unreadTopicPayload,
          topic_id: 999,
        });

        assert.deepEqual(
          this.trackingState.findState(999),
          {
            category_id: 123,
            topic_tag_ids: [44],
            tags: ["pending"],
            last_read_post_number: 9,
            highest_post_number: 10,
            notification_level: NotificationLevels.TRACKING,
            created_at: "2012-11-31 12:00:00 UTC",
            archetype: "regular",
          },
          "topic state updated with guesses for last_read_post_number and notification_level"
        );
      });

      test("adds incoming in the categories latest topics list", async function (assert) {
        this.trackingState.trackIncoming("categories");
        const unreadCategoriesLatestTopicsPayload = {
          ...unreadTopicPayload,
          message_type: "latest",
        };

        await publishToMessageBus(
          `/latest`,
          unreadCategoriesLatestTopicsPayload
        );
        assert.deepEqual(
          this.trackingState.newIncoming,
          [111],
          "unread topic is incoming"
        );
        assert.strictEqual(
          this.trackingState.incomingCount,
          1,
          "incoming count is increased"
        );
      });

      test("dismisses new topic", async function (assert) {
        this.trackingState.loadStates([
          {
            last_read_post_number: null,
            topic_id: 112,
            notification_level: NotificationLevels.TRACKING,
            category_id: 1,
            is_seen: false,
            tags: ["foo"],
          },
        ]);

        await publishToMessageBus(`/unread/${this.currentUser.id}`, {
          message_type: "dismiss_new",
          payload: { topic_ids: [112] },
        });

        assert.strictEqual(this.trackingState.findState(112).is_seen, true);
      });

      test("marks a topic as read", async function (assert) {
        this.trackingState.loadStates([
          {
            last_read_post_number: null,
            topic_id: 112,
            notification_level: NotificationLevels.TRACKING,
            category_id: 1,
            is_seen: false,
            tags: ["foo"],
          },
        ]);
        await publishToMessageBus(`/unread/${this.currentUser.id}`, {
          message_type: "read",
          topic_id: 112,
          payload: {
            last_read_post_number: 4,
            highest_post_number: 4,
            notification_level: NotificationLevels.TRACKING,
          },
        });

        assert.propEqual(
          getProperties(
            this.trackingState.findState(112),
            "highest_post_number",
            "last_read_post_number"
          ),
          { highest_post_number: 4, last_read_post_number: 4 },
          "highest_post_number and last_read_post_number are set for a topic"
        );
        assert.deepEqual(
          this.trackingState.findState(112).tags,
          ["foo"],
          "tags are not accidentally cleared"
        );
      });
    }
  );

  module(
    "establishChannels - /new MessageBus channel payloads processed",
    function (establishChannelsHooks) {
      let newTopicPayload = {
        topic_id: 222,
        message_type: "new_topic",
        payload: {
          category_id: 123,
          topic_tag_ids: [44],
          tags: ["pending"],
          last_read_post_number: null,
          highest_post_number: 1,
          created_at: "2012-11-31 12:00:00 UTC",
          archetype: "regular",
        },
      };

      establishChannelsHooks.beforeEach(function () {
        updateCurrentUser({
          username: "chuck",
        });

        this.trackingState.establishChannels();
      });

      test("topics in muted categories do not get added to the state", async function (assert) {
        this.currentUser.set("muted_category_ids", [123]);
        await publishToMessageBus("/new", newTopicPayload);

        assert.strictEqual(
          this.trackingState.findState(222),
          undefined,
          "the new topic is not in the state"
        );
      });

      test("topics in indirectly muted categories do not get added to the state", async function (assert) {
        this.currentUser.setProperties({
          muted_category_ids: [],
          indirectly_muted_category_ids: [123],
        });
        await publishToMessageBus("/new", newTopicPayload);

        assert.strictEqual(
          this.trackingState.findState(222),
          undefined,
          "the new topic is not in the state"
        );
      });

      test("watched topics in muted categories are added to the state", async function (assert) {
        this.currentUser.setProperties({
          muted_category_ids: [123],
        });

        this.trackingState.trackMutedOrUnmutedTopic({
          topic_id: 222,
          message_type: "unmuted",
        });

        await publishToMessageBus("/new", newTopicPayload);

        assert.deepEqual(
          this.trackingState.findState(222),
          {
            category_id: 123,
            topic_tag_ids: [44],
            tags: ["pending"],
            last_read_post_number: null,
            highest_post_number: 1,
            created_at: "2012-11-31 12:00:00 UTC",
            archetype: "regular",
          },
          "topic state updated"
        );
      });

      test("topics in muted tags do not get added to the state", async function (assert) {
        this.currentUser.set("muted_tags", ["pending"]);

        await publishToMessageBus("/new", newTopicPayload);

        assert.strictEqual(
          this.trackingState.findState(222),
          undefined,
          "the new topic is not in the state"
        );
      });

      test("message count is incremented", async function (assert) {
        await publishToMessageBus("/new", newTopicPayload);

        assert.strictEqual(
          this.trackingState.messageCount,
          1,
          "message count incremented"
        );
      });

      test("state is modified and callback is called", async function (assert) {
        let stateCallbackCalled = false;
        this.trackingState.onStateChange(() => {
          stateCallbackCalled = true;
        });
        await publishToMessageBus("/new", newTopicPayload);

        assert.deepEqual(
          this.trackingState.findState(222),
          {
            category_id: 123,
            topic_tag_ids: [44],
            tags: ["pending"],
            last_read_post_number: null,
            highest_post_number: 1,
            created_at: "2012-11-31 12:00:00 UTC",
            archetype: "regular",
          },
          "new topic loaded into state"
        );
        assert.strictEqual(
          stateCallbackCalled,
          true,
          "state change callback called"
        );
      });

      test("adds incoming so it is counted in topic lists", async function (assert) {
        this.trackingState.trackIncoming("all");
        await publishToMessageBus("/new", newTopicPayload);

        assert.deepEqual(
          this.trackingState.newIncoming,
          [222],
          "new topic is incoming"
        );
        assert.strictEqual(
          this.trackingState.incomingCount,
          1,
          "incoming count is increased"
        );
      });
    }
  );

  test("establishChannels - /delete MessageBus channel payloads processed", async function (assert) {
    this.trackingState.establishChannels();

    this.trackingState.loadStates([
      {
        topic_id: 111,
        deleted: false,
      },
    ]);

    await publishToMessageBus("/delete", { topic_id: 111 });

    assert.strictEqual(
      this.trackingState.findState(111).deleted,
      true,
      "marks the topic as deleted"
    );
    assert.strictEqual(
      this.trackingState.messageCount,
      1,
      "increments message count"
    );
  });

  test("establishChannels - /recover MessageBus channel payloads processed", async function (assert) {
    this.trackingState.establishChannels();

    this.trackingState.loadStates([
      {
        topic_id: 111,
        deleted: true,
      },
    ]);

    await publishToMessageBus("/recover", { topic_id: 111 });

    assert.strictEqual(
      this.trackingState.findState(111).deleted,
      false,
      "marks the topic as not deleted"
    );
    assert.strictEqual(
      this.trackingState.messageCount,
      1,
      "increments message count"
    );
  });

  test("establishChannels - /destroy MessageBus channel payloads processed", async function (assert) {
    sinon.stub(DiscourseURL, "router").value({
      currentRoute: { parent: { name: "topic", params: { id: 111 } } },
    });
    sinon.stub(DiscourseURL, "redirectTo");

    this.trackingState.establishChannels();
    this.trackingState.loadStates([
      {
        topic_id: 111,
        deleted: false,
      },
    ]);

    await publishToMessageBus("/destroy", { topic_id: 111 });

    assert.strictEqual(
      this.trackingState.messageCount,
      1,
      "increments message count"
    );
    assert.ok(
      DiscourseURL.redirectTo.calledWith("/"),
      "redirect to / because topic is destroyed"
    );
  });

  test("subscribe to category", function (assert) {
    this.trackingState.trackIncoming("c/feature/2/l/latest");

    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 1,
      payload: { category_id: 2 },
    });
    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 2,
      payload: { category_id: 3 },
    });
    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 3,
      payload: { category_id: 26 },
    });

    assert.strictEqual(
      this.trackingState.get("incomingCount"),
      2,
      "expect to properly track incoming for category"
    );

    this.trackingState.resetTracking();
    this.trackingState.trackIncoming("c/feature/spec/26/l/latest");

    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 1,
      payload: { category_id: 2 },
    });
    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 2,
      payload: { category_id: 3 },
    });

    assert.strictEqual(
      this.trackingState.get("incomingCount"),
      0,
      "parent or other category doesn't affect subcategory"
    );

    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 3,
      payload: { category_id: 26 },
    });

    assert.strictEqual(
      this.trackingState.get("incomingCount"),
      1,
      "expect to properly track incoming for subcategory"
    );

    this.trackingState.resetTracking();
    this.trackingState.trackIncoming("c/feature/spec/26/none/l/latest");

    this.trackingState.notifyIncoming({
      message_type: "new_topic",
      topic_id: 3,
      payload: { category_id: 26 },
    });

    assert.strictEqual(
      this.trackingState.get("incomingCount"),
      1,
      "expect to properly track incoming for subcategory using none tags route"
    );
  });

  test("getSubCategoryIds", function (assert) {
    const store = createStore();
    const foo = store.createRecord("category", { id: 1, slug: "foo" });
    const bar = store.createRecord("category", {
      id: 2,
      slug: "bar",
      parent_category_id: foo.id,
    });
    const baz = store.createRecord("category", {
      id: 3,
      slug: "baz",
      parent_category_id: bar.id,
    });
    sinon.stub(Category, "list").returns([foo, bar, baz]);

    assert.deepEqual(
      Array.from(this.trackingState.getSubCategoryIds(1)),
      [1, 2, 3]
    );
    assert.deepEqual(
      Array.from(this.trackingState.getSubCategoryIds(2)),
      [2, 3]
    );
    assert.deepEqual(Array.from(this.trackingState.getSubCategoryIds(3)), [3]);
  });

  test("countNew", function (assert) {
    const store = createStore();
    const foo = store.createRecord("category", {
      id: 1,
      slug: "foo",
    });
    const bar = store.createRecord("category", {
      id: 2,
      slug: "bar",
      parent_category_id: foo.id,
    });
    const baz = store.createRecord("category", {
      id: 3,
      slug: "baz",
      parent_category_id: bar.id,
    });
    const qux = store.createRecord("category", {
      id: 4,
      slug: "qux",
    });
    sinon.stub(Category, "list").returns([foo, bar, baz, qux]);

    updateCurrentUser({
      username: "chuck",
      muted_category_ids: [4],
    });

    assert.strictEqual(this.trackingState.countNew({ categoryId: 1 }), 0);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 2 }), 0);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 3 }), 0);

    this.trackingState.states.set("t112", {
      last_read_post_number: null,
      id: 112,
      notification_level: NotificationLevels.TRACKING,
      category_id: 2,
      created_in_new_period: true,
    });

    assert.strictEqual(this.trackingState.countNew({ categoryId: 1 }), 1);

    assert.strictEqual(
      this.trackingState.countNew({ categoryId: 1, noSubcategories: true }),
      0
    );
    assert.strictEqual(
      this.trackingState.countNew({ categoryId: 1, tagId: "missing-tag" }),
      0
    );
    assert.strictEqual(this.trackingState.countNew({ categoryId: 2 }), 1);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 3 }), 0);

    this.trackingState.states.set("t113", {
      last_read_post_number: null,
      id: 113,
      notification_level: NotificationLevels.TRACKING,
      category_id: 3,
      tags: ["amazing"],
      created_in_new_period: true,
    });

    assert.strictEqual(this.trackingState.countNew({ categoryId: 1 }), 2);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 2 }), 2);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 3 }), 1);
    assert.strictEqual(
      this.trackingState.countNew({
        categoryId: 3,
        tagId: "amazing",
      }),
      1
    );
    assert.strictEqual(
      this.trackingState.countNew({
        categoryId: 3,
        tagId: "missing",
      }),
      0
    );

    this.trackingState.states.set("t111", {
      last_read_post_number: null,
      id: 111,
      notification_level: NotificationLevels.TRACKING,
      category_id: 1,
      created_in_new_period: true,
    });

    assert.strictEqual(this.trackingState.countNew({ categoryId: 1 }), 3);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 2 }), 2);
    assert.strictEqual(this.trackingState.countNew({ categoryId: 3 }), 1);

    this.trackingState.states.set("t115", {
      last_read_post_number: null,
      id: 115,
      category_id: 4,
    });

    assert.strictEqual(this.trackingState.countNew({ categoryId: 4 }), 0);
  });

  test("mute and unmute topic", function (assert) {
    updateCurrentUser({
      username: "chuck",
      muted_category_ids: [],
    });

    this.trackingState.trackMutedOrUnmutedTopic({
      topic_id: 1,
      message_type: "muted",
    });
    assert.strictEqual(this.currentUser.muted_topics[0].topicId, 1);

    this.trackingState.trackMutedOrUnmutedTopic({
      topic_id: 2,
      message_type: "unmuted",
    });
    assert.strictEqual(this.currentUser.unmuted_topics[0].topicId, 2);

    this.trackingState.pruneOldMutedAndUnmutedTopics();
    assert.strictEqual(this.trackingState.isMutedTopic(1), true);
    assert.strictEqual(this.trackingState.isUnmutedTopic(2), true);

    this.clock.tick(60000);
    this.trackingState.pruneOldMutedAndUnmutedTopics();
    assert.strictEqual(this.trackingState.isMutedTopic(1), false);
    assert.strictEqual(this.trackingState.isUnmutedTopic(2), false);
  });
});