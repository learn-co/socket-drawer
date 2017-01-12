const bus = require('page-bus')()
const websockets = {}
const chunkBuffer = {}
const chunker = require('./chunker')
const ReconnectingWebSocket = require('learn-reconnecting-websocket')

const openAll = () => {
  for (key in websockets) {
    if (websockets.hasOwnProperty(key)) {
      websockets[key].open()
    }
  }
}

console.log(`current process is ${process.pid}`)

setInterval(() => {
  bus.emit('manager:ready', Date.now())
}, 500)

window.onbeforeunload = () => {
  localStorage.removeItem('atom-socket:running')
  window.removeEventListener('offline', openAll)
}

window.addEventListener('offline', openAll)

getSocket = (key, url) => {
  var ws = new ReconnectingWebSocket(url, null, {timeoutInterval: 5000})
  websockets[key] = ws

  ws.onopen = () => {
    console.log(`websocket open for ${key}: ${url}`)
    bus.emit(`${key}:open`)
  }

  ws.onmessage = (msg) => {
    if (msg.data.length > chunker.CHUNK_SIZE) {
      chunker.sendChunked(`${key}:message`, msg.data)
    } else {
      console.log(`received message for ${key}: ${url}`, msg.data)
      bus.emit(`${key}:message`, msg.data)
    }
  }

  ws.onerror = (err) => {
    console.log(`error for ${key}: ${url}`, err)
    bus.emit(`${key}:error`, err)
  }

  ws.onclose = () => {
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

    chunker.onChunked(`${key}:send`, (msg) => {
      ws.send(msg)
    })

    bus.on(`${key}:close:request`, () => {
      console.log(`closing websocket for ${key}: ${url}`)
      ws.close()
    })

    bus.on(`${key}:reset:request`, () => {
      console.log(`resetting websocket for ${key}: ${url}`)
      ws.refresh()
    })
  }
})