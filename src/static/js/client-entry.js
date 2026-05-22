import geckos from '@geckos.io/client'

const $ = (sel) => document.querySelector(sel)
const btnNewGame = $('#btn-new-game')
const btnJoinSmall = $('#btn-join-small')
const gameList = $('#game-list')
const connStatus = $('#connection-status')

const games = []

const channel = geckos({ port: 3000 })

channel.onConnect((error) => {
  if (error) {
    connStatus.textContent = 'CONNECTION ERROR'
    connStatus.style.color = 'var(--accent-red)'
    console.error(error)
    return
  }
  connStatus.textContent = 'CONNECTED'
  connStatus.style.color = 'var(--accent-green)'
})

channel.onDisconnect(() => {
  connStatus.textContent = 'DISCONNECTED'
  connStatus.style.color = 'var(--accent-red)'
})

channel.on('game-list', (data) => {
  games.length = 0
  games.push(...data)
  renderGameList()
})

channel.on('game-created', (data) => {
  location.href = `/game.html?id=${data.id}`
})

channel.on('game-joined', (data) => {
  location.href = `/game.html?id=${data.id}`
})

channel.on('join-error', (data) => {
  connStatus.textContent = `ERROR: ${data.message}`
  connStatus.style.color = 'var(--accent-red)'
})

function renderGameList() {
  gameList.innerHTML = ''

  if (games.length === 0) {
    gameList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◈</span>
        <span>No games detected</span>
      </div>
    `
    return
  }

  for (const g of games) {
    const el = document.createElement('div')
    el.className = 'game-item'
    el.dataset.gameId = g.id
    el.innerHTML = `
      <label class="game-radio">
        <input type="radio" name="selected-game" value="${g.id}" />
        <span class="radio-dot"></span>
      </label>
      <div class="game-info">
        <div class="game-name">${g.name}</div>
        <div class="game-meta">host: ${g.host}</div>
      </div>
      <div class="game-players">${g.players}/${g.maxPlayers}</div>
    `
    el.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        el.querySelector('input').checked = true
      }
    })
    gameList.appendChild(el)
  }
}

function joinGame(gameId) {
  channel.emit('join-game', { gameId })
  connStatus.textContent = 'JOINING...'
  connStatus.style.color = 'var(--accent-cyan)'
}

btnNewGame.addEventListener('click', () => {
  connStatus.textContent = 'CREATING GAME...'
  connStatus.style.color = 'var(--accent-cyan)'
  channel.emit('new-game')
})

const doJoin = () => {
  const checked = document.querySelector('input[name="selected-game"]:checked')
  if (!checked) return
  joinGame(checked.value)
}

btnJoinSmall.addEventListener('click', doJoin)

renderGameList()
