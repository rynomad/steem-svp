const assert = require('assert')
const sc2 = require('sc2-sdk')

const Client = require('../src/client.js')

describe('Client', () => {
  it('Requires an api', () => {
    let did_error = false
    try {
      const client = new Client()
    } catch (e){
      did_error = true
    } finally{
      assert(did_error, 'Expected Client to error without api defined')
    }
  })

  it('Constructs with api', () => {
    const client = new Client({
      api : sc2.Initialize({
        app : 'test.app'
      })
    })
  })

  it('provides login url', () => {
    const client = new Client({
      api : sc2.Initialize({
        app : 'test.app',
        callbackURL : 'http://localhost:8080'
      })
    })

    assert(client.loginURL, 'no loginURL')
  })

  it('throws error on api access without access token', () => {
    const client = new Client({
      api : sc2.Initialize({
        app : 'test.app',
        callbackURL : 'http://localhost:8080'
      })
    })

    let did_error = false

    try {
      client.api
    } catch(e){
      did_error = true
    } finally {
      assert(did_error, 'expected to error on .api access without access token')
    }
  })


})