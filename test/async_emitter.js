const AsyncEmitter = require('../src/async_emitter.js')

describe ('AsyncEmitter', () => {
  it('instantiates', () => {
    const a = new AsyncEmitter()
  })

  it('throws error when _process not defined', async () => {
    let noError = true
    try {
      const a = new AsyncEmitter()
      await a.process()
    } catch (e) {
      noError = false
    } finally {
      if (noError){
        throw new Error('should have errored')
      }
    }
  })

  it('starts and stops in correct order',(done) => {
    const a = new AsyncEmitter()
    a._process = async () => new Promise((resolve, reject) => setTimeout(resolve, 1000))
    let stopped = false

    a.start().then(() => {
      let res
      if (!stopped){
        res = new Error('start resolved before stop')
      }
      done(res)
    })

    a.stop().then(() => {
      stopped = true
    })
  })
})