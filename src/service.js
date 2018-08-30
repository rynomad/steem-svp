const AsyncEmitter = require("./async_emitter.js");

class Service extends AsyncEmitter {
  constructor(
    bot,
    provider = username => username,
    {
      title = "Echo",
      description = "echo_service",
      tags = [],
      terms = { cost: 1 },
      permlink = crypto.randomBytes(16).toString("hex")
    }
  ) {
    this.bot = bot;
    this.title = title;
    this.description = description;
    this.tags = ["steempay"].concat(tags);
    this.terms = terms;
    this.permlink = permlink;
    this.provider = provider;
    this.votables = [];
    this.orders = new Set();
  }

  get json() {
    return {
      title: this.title,
      description: this.description,
      tags: this.tags.slice(1),
      terms: this.terms,
      permlink: this.permlink
    };
  }

  get meta() {
    return {
      tags: this.tags,
      terms: this.terms
    };
  }

  get service_definition() {
    return {
      permlink: this.permlink,
      title: this.title,
      body: this.description,
      meta: this.meta
    };
  }

  async init() {
    await this.postServiceDefinition();
  }

  updateSession({ session_permlink, session_service_permlink, votables }) {
    this.session_permlink = session_permlink;
    this.session_service_permlink = session_service_permlink;
    this.votables = votables;
    this.orders = new Set();
  }

  async postServiceDefinition() {
    console.log("postServiceDefinition", this.service_definition);
    const service_definition = await this.bot.getPost({
      author: this.bot.username,
      permlink: this.permlink
    });
    if (!service_definition) {
      this.permlink = await this.bot.reply({
        author: this.bot.username,
        permlink: "steempay-services",
        reply: this.service_definition
      });
    }
  }

  async prepareSession(session_permlink) {
    const session_service_permlink = `${session_permlink}-${this.permlink}`;
    console.log("service.prepareSession", session_permlink);

    await this.bot.reply({
      author: this.bot.username,
      permlink: session_permlink,
      reply: {
        permlink: session_service_permlink,
        title: this.permlink,
        body: this.permlink
      }
    });

    console.log("SESSION_SERV_PERM", session_service_permlink);

    const votables = [];

    for (let i = 0; i < this.terms.cost; i++) {
      votables.push(
        await this.bot.reply({
          author: this.bot.username,
          permlink: session_service_permlink,
          reply: {
            title: this.permlink,
            body: this.permlink
          }
        })
      );
    }

    return { session_service_permlink, votables, permlink: this.permlink };
  }

  async process() {
    const orders = await this.getNewPaidOrders();
    for (let buyer of orders) {
      console.log("fulfill order from", buyer);
      this.fulfillOrder(buyer);
    }
  }

  async getNewPaidOrders() {
    if (!this.session_service_permlink) return [];
    const votes = await this.getActiveVotes({
      author: this.bot.username,
      permlink: this.session_service_permlink
    });
    const new_orders = votes
      .map(({ voter }) => voter)
      .filter(voter => !this.orders.has(voter));

    let paid_orders = [];

    for (let voter of new_orders) {
      const paid = (await Promise.all(
        this.votables.map(permlink =>
          this.getActiveVotes({
            author: this.bot.username,
            permlink,
            voter
          })
        )
      )).reduce((_paid, _votes) => _paid && _votes.length, true);

      if (paid) {
        this.orders.add(voter);
        paid_orders.push(voter);
      }
    }

    return paid_orders;
  }

  async getActiveVotes({ author, permlink, voter }) {
    return new Promise((resolve, reject) => {
      steem.api.getActiveVotes(author, permlink, (err, res) => {
        if (err) {
          console.log("active votes failed", author, permlink);
          return reject(err);
        }
        resolve(res.filter(({ voter: _voter }) => !voter || voter === _voter));
      });
    });
  }

  async fulfillOrder(buyer) {
    const body = await this.provider(buyer, this);
    if (!body) return;

    return this.bot.replyEncrypted({
      priority: true,
      author: buyer,
      permlink: STEEMBOT_DELIVERIES_PERMLINK,
      reply: {
        title: `DELIVERY-${this.session_service_permlink}`,
        body
      }
    });
  }
}
