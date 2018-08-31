const crypto = require("crypto");
const steem = require("steem");
const AsyncEmitter = require("./async_emitter.js");

class Client extends AsyncEmitter {
  constructor({ username, api } = {}) {
    super();
    this.username = username;

    if (!api) throw new Error("must instantiate with a steemconnect api");

    this._api = api;

    this._comment_fifo = [];
  }

  async _process(){

  }

  async_cb(name, resolve, reject) {
    return (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    };
  }

  get api() {
    if (!this.access_token) {
      throw new Error("cannot use api without access token");
    }
    return this._api;
  }

  get access_token() {
    return this.api_options.accessToken;
  }

  get api_options() {
    return this._api.options;
  }

  get app() {
    return this.api_options.app;
  }

  get loginURL() {
    return this._api.getLoginURL();
  }

  setAccessToken(access_token) {
    this._api.setAccessToken(access_token);
  }

  async me() {
    return new Promise((resolve, reject) => {
      this.api.me(this.async_cb("me"));
    });
  }

  async vote(voter, author, permlink, weight) {
    return new Promise((resolve, reject) => {
      this.api.vote(
        voter,
        author,
        permlink,
        weight,
        this.async_cb("vote", resolve, reject, () =>
          this.vote(voter, author, permlink, weight)
        )
      );
    });
  }

  async __comment({
    parentAuthor,
    parentPermlink,
    author,
    permlink,
    title,
    body,
    jsonMetadata
  }) {
    return new Promise((resolve, reject) => {
      this.api.comment(
        parentAuthor,
        parentPermlink,
        author,
        permlink,
        title,
        body,
        jsonMetadata,
        this.async_cb("comment", resolve, reject)
      );
    });
  }

  async _comment() {
    if (this._commenting) return;
    this._commenting = true;
    while (this._comment_fifo.length) {
      const job = this._comment_fifo.shift();
      try {
        const res = await this.__comment(job.args);
        job.promise.resolve(res);
      } catch (e) {
        if (
          e.error_description &&
          (e.error_description.indexOf("STEEM_MIN_ROOT_COMMENT_INTERVAL") >=
            0 ||
            e.error_description.indexOf("STEEM_MIN_REPLY_INTERVAL") >= 0)
        ) {
          this.emit('delay', e)
          this._comment_fifo.unshift(job);
        } else {
          job.promise.reject(e);
        }
      }
      await this._waitStarted(1000);
    }

    this._commenting = false;
  }

  async comment(
    parentAuthor = '',
    parentPermlink = this.username,
    author = this.username,
    permlink = crypto.randomBytes(16).toString("hex"),
    title = "",
    body = "",
    jsonMetadata = {},
    priority = false
  ) {
    return new Promise(async (resolve, reject) => {
      let fifo_op = priority ? "unshift" : "push";
      this._comment_fifo[fifo_op]({
        promise: {
          resolve,
          reject
        },
        args: {
          parentAuthor,
          parentPermlink,
          author,
          permlink,
          title,
          body,
          jsonMetadata
        }
      });
      await this._comment();
    });
  }

  async revokeToken() {
    return new Promise((resolve, reject) => {
      this.api.revokeToken(this.async_cb("revokeToken", resolve, reject));
    });
  }

  async reblog(account, author, permlink) {
    return new Promise((resolve, reject) => {
      this.api.reblog(
        account,
        author,
        permlink,
        this.async_cb("reblog", resolve, reject)
      );
    });
  }

  async follow(follower, following) {
    return new Promise((resolve, reject) => {
      this.api.follow(
        follower,
        following,
        this.async_cb("follow", resolve, reject)
      );
    });
  }

  async unfollow(unfollower, unfollowing) {
    return new Promise((resolve, reject) => {
      this.api.unfollow(
        unfollower,
        unfollowing,
        this.async_cb("unfollow", resolve, reject)
      );
    });
  }

  async ignore(follower, following) {
    return new Promise((resolve, reject) => {
      this.api.ignore(
        follower,
        following,
        this.async_cb("ignore", resolve, reject)
      );
    });
  }

  async claimRewardBalance(account, rewardSteem, rewardSbd, rewardVests) {
    return new Promise((resolve, reject) => {
      this.api.claimRewardBalance(
        account,
        rewardSteem,
        rewardSbd,
        rewardVests,
        this.async_cb("claimRewardBalance", resolve, reject)
      );
    });
  }

  async updateUserMetadata(metadata) {
    return new Promise((resolve, reject) => {
      this.api.updateUserMetadata(
        metadata,
        this.async_cb("updateUserMetadata", resolve, reject)
      );
    });
  }

  async post({
    permlink = crypto.randomBytes(16).toString("hex"),
    title = "self post",
    body,
    meta = null
  }) {
    await this.comment(
      "",
      this.username,
      this.username,
      permlink,
      title,
      body,
      meta
    );
    return permlink;
  }

  async reply({
    priority,
    author = this.username,
    permlink,
    reply: {
      permlink: reply_permlink = crypto.randomBytes(16).toString("hex"),
      title = "reply",
      body = "body",
      meta,
    }
  }) {
    console.log(      author,
      permlink,
      this.username,
      reply_permlink,
      title,
      body,
      meta || null,
      priority)
    await this.comment(
      author,
      permlink,
      this.username,
      reply_permlink,
      title,
      body,
      meta || null,
      priority
    );
    return reply_permlink;
  }

  async getPost({ author, permlink }) {
    return new Promise((resolve, reject) => {
      steem.api.getContent(author, permlink, (err, res) => {
        if (err) return reject(err);
        if (res.id) return resolve(res);
        console.log(res)
        resolve(null);
      });
    });
  }

  async getReplies({ author = this.username, permlink, commentor, title }) {
    return new Promise((resolve, reject) =>
      steem.api.getContentReplies(author, permlink, (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(
          res.filter(
            ({ title: _title, author: _commentor }) =>
              (!commentor || commentor === _commentor) &&
              (!title || title === _title)
          )
        );
      })
    );
  }

  async getActiveVotes({ author, permlink, voter }) {
    return new Promise((resolve, reject) => {
      steem.api.getActiveVotes(author, permlink, (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res.filter(({ voter: _voter }) => !voter || voter === _voter));
      });
    });
  }

  async getActiveDiscussionsByTag(tag) {
    return new Promise((resolve, reject) => {
      steem.api.getDiscussionsByActive(
        { tag: tag, limit: 100 },
        this.async_cb("getActiveDiscussionsByTag", resolve, reject)
      );
    });
  }
}

module.exports = Client;
