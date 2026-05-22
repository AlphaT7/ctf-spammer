import geckos from '@geckos.io/client'

const $ = (sel) => document.querySelector(sel)
const canvas = $('#game-canvas')
const ctx = canvas.getContext('2d')
const hudScore = $('#hud-score')
const hudPlayers = $('#hud-players')

const params = new URLSearchParams(location.search)
const gameId = params.get('id')

if (!gameId) {
  document.body.innerHTML = '<p style="color:var(--accent-red);padding:2rem">Missing game id</p>'
  throw new Error('Missing game id')
}

function resize() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
window.addEventListener('resize', resize)
resize()

const channel = geckos({ port: 3000 })

channel.onConnect((error) => {
  if (error) {
    console.error(error)
    return
  }
})

channel.onDisconnect(() => {
})

function draw() {
  ctx.fillStyle = '#0a0e17'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#22d3ee'
  ctx.font = '11px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`GAME ${gameId}`, canvas.width / 2, canvas.height / 2)

  requestAnimationFrame(draw)
}

draw()
