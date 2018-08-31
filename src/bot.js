const nacl = require("tweetnacl");
const crypto = require("crypto");

const AsyncEmitter = require("./async_emitter.js");
const Client = require("./client.js");

const SVP_ROOT_PERMLINK = "svp-root";
const SVP_SESSIONS_PERMLINK = "svp-sessions";
const SVP_DELIVERIES_PERMLINK = "svp-deliveries";
const SVP_SERVICES_PERMLINK = "svp-services";
const SVP_TAG = "svp-tag";

class Bot extends Client {
  constructor({ keypair = nacl.box.keyPair(), ...options }) {
    super(options);

    this._keypair = {
      publicKey: Buffer.from(keypair.publicKey),
      secretKey: Buffer.from(keypair.secretKey)
    };

    this.services = [];
  }

  addService({ provider, config } = {}) {
    this.services.push(new Service(this, provider, config));
  }

  async start() {
    return Promise.all(
      this.services.map(service => service.start()).concat([super.start()])
    );
  }

  async init() {
    await this.initRoot();
    await this.initDeliveries();
    await this.initServiceRoot();
    await this.initServices();
    await this.newSession();
  }

  async initRoot() {
    this.emit("status", { detail: "fetching root post" });
    const rootpost = await this.getPost({
      author: this.username,
      permlink: SVP_ROOT_PERMLINK
    });
    this.emit("status", { detail: "initializing root post" });
    await this.post({
      permlink: SVP_ROOT_PERMLINK,
      title: "SVP ROOT",
      body: "init",
      meta: {
        tags: [SVP_TAG]
      }
    });
    this.emit("status", { detail: "done initializing root post" });
  }

  async initDeliveries() {
    const deliveries_post = await this.getPost({
      author: this.username,
      permlink: SVP_DELIVERIES_PERMLINK
    });

    if (
      !deliveries_post ||
      deliveries_post.body !== this._keypair.publicKey.toString("hex")
    ) {
      this.emit("status", { detail: "setting delivery address" });
      await this.reply({
        author: this.username,
        permlink: SVP_ROOT_PERMLINK,
        reply: {
          permlink: SVP_DELIVERIES_PERMLINK,
          title: "Deliveries",
          body: this._keypair.publicKey.toString("hex")
        }
      });
    }
  }

  async initServiceRoot() {
    this.emit("status", { detail: "fetching service root" });

    const services_post = await this.getPost({
      author: this.username,
      permlink: SVP_SERVICES_PERMLINK
    });

    if (!services_post) {
      this.emit("status", { detail: "posting service root" });
      await this.reply({
        author: this.username,
        permlink: SVP_ROOT_PERMLINK,
        reply: {
          permlink: SVP_SERVICES_PERMLINK,
          title: "Services",
          body: "Service Definitions"
        }
      });
    }
  }

  async initServices() {
    for (const service of this.services) {
      await service.init();
    }
  }

  async newSession() {
    this.emit("status", { detail: "ensuring root session post" });

    await this.reply({
      permlink: SVP_ROOT_PERMLINK,
      reply: {
        permlink: SVP_SESSIONS_PERMLINK,
        title: "Sessions",
        body: "sessions"
      }
    });

    this.emit("status", { detail: "posting new session" });

    const session_permlink = await this.reply({
      author: this.username,
      permlink: SVP_SESSIONS_PERMLINK,
      reply: {
        title: "Session",
        body: "session"
      }
    });

    console.log("new session permlink:", session_permlink);

    const services = new Map();

    for (let service of this.services) {
      console.log("service preparing new permlink", service.permlink);
      const {
        session_service_permlink,
        votables
      } = await service.prepareSession(session_permlink);
      console.log("prepared at", session_service_permlink, votables);
      services.set(service.permlink, { session_service_permlink, votables });
    }

    await this.post({
      permlink: SVP_ROOT_PERMLINK,
      title: "Root",
      meta: {
        tags: [SVP_TAG]
      },
      body: session_permlink
    });

    for (let service of this.services) {
      const { session_service_permlink, votables } = services.get(
        service.permlink
      );
      service.updateSession({
        session_permlink,
        session_service_permlink,
        votables
      });
    }

    this.emit("session", { detail: session_permlink });
  }

  async getUserPublicKey(user) {
    const post = await this.getPost({
      author: user,
      permlink: SVP_DELIVERIES_PERMLINK
    });

    const pubkey = Buffer.from(post.body, "hex");

    return pubkey;
  }

  async findSVPUsers(lastOnline = new Date()) {
    if (!(lastOnline instanceof Date)) lastOnline = new Date(lastOnline);

    return (await this.getActiveDiscussionsByTag(SVP_TAG))
      .map(({ author }) => author)
      .filter(author => author !== this.username);
  }

  async findServices(name) {
    const users = await this.findSVPUsers();
    this.emit("status", { detail: `found SVP users ${users.join(", ")}` });
    let services = [];
    for (const user of users) {
      const user_services = await this.getReplies({
        author: user,
        permlink: SVP_SERVICES_PERMLINK,
        commentor: user,
        title: name
      });
      services = services.concat(user_services);
    }
    return services.map(({ author: seller, permlink: service_permlink }) => ({
      seller,
      service_permlink
    }));
  }

  async replyEncrypted({
    priority = false,
    author,
    permlink,
    pubkeyhex,
    reply: { permlink: reply_permlink, title, body }
  }) {
    if (typeof body === 'object') body = JSON.stringify(body)

    let pubkey;

    try {
      pubkey = Buffer.from(pubkeyhex, "hex");
    } catch (e) {
      pubkey = await this.getUserPublicKey(author);
    }

    const nonce = crypto.randomBytes(24);
    const box = Buffer.from(
      nacl.box(
        bufToUint(Buffer.from(body)),
        bufToUint(nonce),
        bufToUint(pubkey),
        bufToUint(this._keypair.secretKey)
      )
    ).toString("hex");

    await this.reply({
      priority,
      author,
      permlink,
      reply: {
        permlink: nonce.toString("hex"),
        title,
        body: box,
        meta: {
          encrypted: pubkey.toString("hex"),
          nonce: nonce.toString("hex")
        }
      }
    });

    return reply_permlink;
  }

  async getEncryptedReplies({ permlink, commentor, title }) {
    const replies = (await this.getReplies({
      permlink,
      commentor,
      title
    })).filter(
      ({ json_metadata }) =>
        JSON.parse(json_metadata).encrypted ===
        this._keypair.publicKey.toString("hex")
    );

    if (!replies.length) return [];

    const decrypted = [];
    for (let reply of replies) {
      const { author, permlink, body } = reply;
      const decrypted_body = await this.decryptBody({ author, permlink, body });

      decrypted.push({ ...reply, body: decrypted_body });
    }

    return decrypted;
  }

  async decryptBody({ author, permlink, body }) {
    const box = bufToUint(Buffer.from(body, "hex"));
    const nonce = bufToUint(Buffer.from(permlink, "hex"));
    const pubkey = bufToUint(await this.getUserPublicKey(author));
    const decrypted = Buffer.from(
      nacl.box.open(box, nonce, pubkey, bufToUint(this._keypair.secretKey))
    );

    return decrypted.toString();
  }

  async placeOrder({ seller: author, service_permlink }) {
    const { body: session_permlink } = await this.getPost({
      author,
      permlink: SVP_ROOT_PERMLINK
    });

    const session_service_permlink = `${session_permlink}-${service_permlink}`;

    const votables = (await this.getReplies({
      author,
      permlink: session_service_permlink,
      commentor: author
    })).map(({ permlink }) => permlink);

    await Promise.all(
      votables.map(permlink =>
        this.vote(this.username, author, permlink, 10000)
      )
    );

    await this.vote(this.username, author, session_service_permlink, 10000);

    return session_service_permlink;
  }

  async receiveDelivery({ seller, order }) {
    do {
      const deliveries = await this.getEncryptedReplies({
        author: this.username,
        permlink: SVP_DELIVERIES_PERMLINK,
        reply_permlink: `delivery-${order}`,
        commentor: seller,
        title: `DELIVERY-${order}`
      });

      if (deliveries.length) {
        return deliveries[0];
      }
    } while (await this._waitStarted(1000));
  }

  async purchase({ seller, service_permlink }) {
    const order = await this.placeOrder({
      seller,
      service_permlink
    });

    const delivery = await this.receiveDelivery({ seller, order });
    const json = JSON.parse(delivery.body);
    return json;
  }
}

class Service extends AsyncEmitter {
  constructor(
    bot,
    provider = username => ({username}),
    { title, description = "No Description", tags = [], terms, permlink } = {
      title: "Echo",
      description: "Echo Service",
      tags: [],
      terms: { cost: 1 },
      permlink: "echo-service"
    }
  ) {
    super();
    this.bot = bot;
    this.title = title;
    this.description = description;
    this.tags = [SVP_TAG].concat(tags);
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
    this.bot.emit("status", {
      detail: `checking service definition for ${this.service_definition.title}`
    });
    const service_definition = await this.bot.getPost({
      author: this.bot.username,
      permlink: this.permlink
    });
    if (!service_definition) {
      this.bot.emit("status", {
        detail: `posting service definition for ${
          this.service_definition.title
        }, permlink ${this.permlink}`
      });
      this.permlink = await this.bot.reply({
        author: this.bot.username,
        permlink: SVP_SERVICES_PERMLINK,
        reply: this.service_definition
      });
    }
  }

  async prepareSession(session_permlink) {
    const session_service_permlink = `${session_permlink}-${this.permlink}`;

    this.bot.emit("status", {
      detail: `preparing session ${session_service_permlink}`
    });

    await this.bot.reply({
      author: this.bot.username,
      permlink: session_permlink,
      reply: {
        permlink: session_service_permlink,
        title: this.permlink,
        body: this.permlink
      }
    });

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

  async _process() {
    const orders = await this.getNewPaidOrders();
    for (let buyer of orders) {
      console.log("fulfill order from", buyer);
      this.fulfillOrder(buyer);
    }
  }

  async getNewPaidOrders() {
    if (!this.session_service_permlink) return [];
    const votes = await this.bot.getActiveVotes({
      author: this.bot.username,
      permlink: this.session_service_permlink
    });

    const new_orders = votes
      .map(({ voter }) => voter)
      .filter(voter => !this.orders.has(voter));

    return Promise.all(
      new_orders
        .map(async voter => {
          const paid = (await Promise.all(
            this.votables.map(permlink =>
              this.bot.getActiveVotes({
                author: this.bot.username,
                permlink,
                voter
              })
            )
          )).reduce((_paid, _votes) => _paid && _votes.length, true);
          if (!paid) {
            return false;
          }

          this.orders.add(voter);
          return voter;
        })
        .filter(_truthy => _truthy)
    );
  }

  async fulfillOrder(buyer) {
    const body = await this.provider(buyer, this);
    if (!body) return;

    await this.bot.replyEncrypted({
      priority: true,
      author: buyer,
      permlink: SVP_DELIVERIES_PERMLINK,
      reply: {
        title: `DELIVERY-${this.session_service_permlink}`,
        body
      }
    });
    this.emit("order");
  }
}

function bufToUint(buf) {
  const uint = new Uint8Array(buf.byteLength);
  for (let i = 0; i < buf.byteLength; i++) {
    uint[i] = buf[i];
  }
  return uint;
}

module.exports = Bot;
