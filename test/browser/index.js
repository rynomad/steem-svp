const sc2 = require('sc2-sdk')
const template = require('../../.tmp/app.json')

const BrowserClient = require('../../src/browser.js')
const shared = require('../shared.js')

describe('NodeClient', function () {
  this.timeout(60 * 1000 * 10)
  const self = this
  before(async function () {
    if (!(template.app_secret && template.app_name && template.callback_url)){
      throw new Error('must set process.env.STEEM_APP_SECRET && process.env.STEEM_APP_NAME')
    }
  
    const client = new BrowserClient({
      api : sc2.Initialize({
        app : template.app_name,
        callbackURL : template.callback_url,
        scope : [
          "vote",
          "offline",
          "comment",
          "custom_json",
          "delete_comment"
        ]
      })
    })

    client.on('login_required', (url) => {
      console.log("login required")
      console.log(url)
      this.timeout(120000)
    })
  
    await client.init()
    console.log("client", client)

    self.client = client
  })

  shared(self)

  it('gets services purchase', async () => {
    window.client = self.client
    this.services = await self.client.findServices('Echo')
    console.log("SERVICES", this.services)
  })
})
