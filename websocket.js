const bus = require('page-bus')()
const websockets = {}
const managers = []
const chunkBuffer = {}
const chunk = require('./chunk')

console.log(`current process is ${process.pid}`)

bus.on('websocket:manager:start', ({pid, time}) => {
  console.log(`process ${pid} started at ${time}`)
  managers.push({pid: pid, time: time})
})

bus.emit('websocket:manager:start', {pid: process.pid, time: Date.now()})

setTimeout(() => {
  if (managers.length > 1) {
    window.close()
    return process.exit(0)
  } else {
    setInterval(() => {
      bus.emit('manager:ready')
    }, 1000)
  }

  window.onbeforeunload = () => {
    localStorage.removeItem('atom-socket:running')
  }

  getSocket = (key, url) => {
    var ws = new WebSocket(url)
    websockets[key] = ws

    ws.onopen = () => {
      console.log(`websocket open for ${key}: ${url}`)
      bus.emit(`${key}:open`)
    }

    ws.onmessage = (msg) => {
      if (msg.data.length > chunk.SIZE) {
        console.log('chunking incoming message')
        var id = Date.now()
        chunk(msg.data).forEach((chunk) => {
          console.log('emitting chunk')
          bus.emit(`${key}:message:chunk`, {id: id, chunk: chunk})
        })
        bus.emit(`${key}:message:chunk:done`, id)
      } else {
        console.log(`received message for ${key}: ${url}`, msg.data)
        bus.emit(`${key}:message`, msg.data)
      }
    }

    ws.onerror = (err) => {
      delete websockets[key]
      console.log(`error for ${key}: ${url}`, err)
      bus.emit(`${key}:error`, err)
    }

    ws.onclose = () => {
      delete websockets[key]
      console.log(`websocket close for ${key}: ${url}`)
      bus.emit(`${key}:close`)
    }

    return ws
  }

  bus.on('create', ({key, url}) => {
    console.log(`received request for ${key}: ${url}`)
    if (websockets[key]) {
      console.log(`found websocket from cache for ${key}: ${url}`)
      bus.emit(`${key}:open:cached`)
    } else {
      console.log(`creating new websocket for ${key}: ${url}`)

      var ws = getSocket(key, url)

      bus.on(`${key}:send`, (msg) => {
        console.log(`sending message for ${key}: ${url}`, msg)
        ws.send(msg)
      })

      bus.on(`${key}:send:chunk`, ({id, chunk}) => {
        console.log('chunk for id ' + id)
        chunkBuffer[id] || (chunkBuffer[id] = '')
        chunkBuffer[id] = chunkBuffer[id] + chunk
      })

      bus.on(`${key}:send:chunk:done`, (id) => {
        console.log('chunked done')
        ws.send(chunkBuffer[id])
        delete chunkBuffer[id]
      })

      bus.on(`${key}:close:request`, () => {
        console.log(`closing websocket for ${key}: ${url}`)
        ws.close()
      })

      bus.on(`${key}:reset:request`, () => {
        console.log(`resetting websocket for ${key}: ${url}`)
        ws.close()
        ws = getSocket(key, url)
      })
    }
  })
}, 1000)
