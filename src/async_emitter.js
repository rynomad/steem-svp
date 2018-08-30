const {EventEmitter} = require('events')

const defer = () => new Promise((res) => setImmediate(res)) 
const waitStarted = async ({__started}, ms) => new Promise((resolve) => setTimeout(() => resolve(__started),ms))
const waitStopping = async ({__stopping}, ms) => new Promise((resolve) => setTimeout(() => resolve(__stopping),ms))



class AsyncEmitter extends EventEmitter{
  async _process(){
    throw new Error('must overwrite _process function')
  }

  async process(){
    let result = null

    try {
      result = await this._process()
    } catch (e) {
      this.emit('error',e)
      this.started = false
    }

    return result
  }

  async start(cycle = 500){
    this.started = true
    this.emit('start')

    do {
      const result = await this.process()
      this.emit('process', result)
    } while (await waitStarted(this, cycle))

    if (this.stopping){
      this.stopping = false
      this.emit('stop')
    }
  }

  async stop(cycle = 500){
    this.stopping = true
    this.started = false
    while (await waitStopping(this, cycle)){}
  }
}

module.exports = AsyncEmitter