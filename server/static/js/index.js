import{t as e}from"./node_modules.js";var t=e=>document.querySelector(e),n=t(`#btn-new-game`),r=t(`#btn-join-small`),i=t(`#game-list`),a=t(`#connection-status`),o=[],s=e({port:3e3});s.onConnect(e=>{if(e){a.textContent=`CONNECTION ERROR`,a.style.color=`var(--accent-red)`,console.error(e);return}a.textContent=`CONNECTED`,a.style.color=`var(--accent-green)`}),s.onDisconnect(()=>{a.textContent=`DISCONNECTED`,a.style.color=`var(--accent-red)`}),s.on(`game-list`,e=>{o.length=0,o.push(...e),c()}),s.on(`game-created`,e=>{location.href=`/game.html?id=${e.id}`}),s.on(`game-joined`,e=>{location.href=`/game.html?id=${e.id}`}),s.on(`join-error`,e=>{a.textContent=`ERROR: ${e.message}`,a.style.color=`var(--accent-red)`});function c(){if(i.innerHTML=``,o.length===0){i.innerHTML=`
      <div class="empty-state">
        <span class="empty-icon">◈</span>
        <span>No games detected</span>
      </div>
    `;return}for(let e of o){let t=document.createElement(`div`);t.className=`game-item`,t.dataset.gameId=e.id,t.innerHTML=`
      <label class="game-radio">
        <input type="radio" name="selected-game" value="${e.id}" />
        <span class="radio-dot"></span>
      </label>
      <div class="game-info">
        <div class="game-name">${e.name}</div>
        <div class="game-meta">host: ${e.host}</div>
      </div>
      <div class="game-players">${e.players}/${e.maxPlayers}</div>
    `,t.addEventListener(`click`,e=>{e.target.tagName!==`INPUT`&&(t.querySelector(`input`).checked=!0)}),i.appendChild(t)}}function l(e){s.emit(`join-game`,{gameId:e}),a.textContent=`JOINING...`,a.style.color=`var(--accent-cyan)`}n.addEventListener(`click`,()=>{a.textContent=`CREATING GAME...`,a.style.color=`var(--accent-cyan)`,s.emit(`new-game`)}),r.addEventListener(`click`,()=>{let e=document.querySelector(`input[name="selected-game"]:checked`);e&&l(e.value)}),c();