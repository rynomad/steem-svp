const assert = require("assert");

const wait = ms => new Promise(res => setTimeout(res, ms));

module.exports = context => {
  let permlink;

  it("simple post", async () => {
    context.client.on("error", err => {
      console.log(err);
    });
    context.client.on("delay", err => {
      console.log(err.error_description);
    });
    const body = Math.random() + "";
    permlink = await context.client.post({
      body
    });

    const post = await context.client.getPost({
      author: context.client.username,
      permlink
    });

    assert(post.body === body, "expected post body to match");
  });

  it("Comments on post", async () => {
    const body = Math.random() + "";

    await context.client.reply({
      permlink,
      reply: {
        body
      }
    });

    await wait(5000);

    const reply = (await context.client.getReplies({
      permlink
    }))[0];

    assert(reply.body === body, "expected reply body to match");
  });
};
