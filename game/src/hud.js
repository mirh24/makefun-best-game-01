// The HUD: DOM over the canvas. Health, money, ammo, team scores, round
// timer, charge state, crosshair, hitmarker, damage flash, kill feed, streak
// banner, plant/defuse progress, buy menu and the title/match-end overlays.
// Buttons in the overlays are plain <button> elements (clickable because the
// overlays release the pointer lock).
export function createHud(document, callbacks) {
  const root = document.getElementById('hud');
  const hud = document.createElement('div');
  hud.className = 'hud';

  hud.innerHTML = `
    <div class="crosshair" id="crosshair"><div class="dot"></div></div>
    <div class="hitmarker" id="hitmarker"></div>
    <div class="damage" id="damage"></div>
    <div class="streak" id="streak"></div>
    <div class="timer" id="timer"></div>
    <div class="teams" id="teams"></div>
    <div class="kills" id="kills"></div>
    <div class="objective" id="objective"></div>
    <div class="progress" id="progress"><div class="bar" id="progress-bar"></div><div class="label" id="progress-label"></div></div>
    <div class="bottom-left" id="health"></div>
    <div class="bottom-right" id="ammo"></div>
    <div class="compass" id="compass"></div>
    <div class="buy-menu" id="buy-menu">
      <div class="buy-title">BUY PHASE</div>
      <div class="buy-items"></div>
      <div class="buy-hint">B to close · click a weapon to buy it</div>
    </div>
    <div class="lock-hint" id="lock-hint">Click to play</div>
    <div class="overlay" id="overlay">
      <div class="panel" id="overlay-panel"></div>
    </div>
  `;
  root.appendChild(hud);
  const el = {
    crosshair: hud.querySelector('#crosshair'),
    hitmarker: hud.querySelector('#hitmarker'),
    damage: hud.querySelector('#damage'),
    streak: hud.querySelector('#streak'),
    timer: hud.querySelector('#timer'),
    teams: hud.querySelector('#teams'),
    kills: hud.querySelector('#kills'),
    objective: hud.querySelector('#objective'),
    progress: hud.querySelector('#progress'),
    progressBar: hud.querySelector('#progress-bar'),
    progressLabel: hud.querySelector('#progress-label'),
    health: hud.querySelector('#health'),
    ammo: hud.querySelector('#ammo'),
    compass: hud.querySelector('#compass'),
    buyMenu: hud.querySelector('#buy-menu'),
    buyItems: hud.querySelector('.buy-items'),
    lockHint: hud.querySelector('#lock-hint'),
    overlay: hud.querySelector('#overlay'),
    overlayPanel: hud.querySelector('#overlay-panel'),
  };
  el.crosshair.style.display = 'none';

  const killItems = [];
  let timerWarn = false;

  function showKillFeed(shooter, victim, headshot, killerIsPlayer, victimIsPlayer) {
    const line = document.createElement('div');
    line.className = 'kill-line';
    if (killerIsPlayer) line.classList.add('me');
    if (victimIsPlayer) line.classList.add('died');
    line.innerHTML = `${shooter} ${headshot ? '◉' : '✕'} ${victim}`;
    el.kills.appendChild(line);
    killItems.push(line);
    if (killItems.length > 5) killItems.shift().remove();
    setTimeout(() => line.remove(), 5000);
  }

  function setCrosshair(visible) {
    el.crosshair.style.display = visible ? 'flex' : 'none';
  }

  return {
    setHealth(health, armor, money) {
      el.health.innerHTML = `<span class="label">HP</span><span class="value ${health <= 25 ? 'low' : ''}">${health}</span><span class="armor">${armor ? '🛡 ARMOR' : ''}</span><span class="money">$${money}</span>`;
    },
    setAmmo(weaponName, mag, reserve, grenades) {
      el.ammo.innerHTML = `<span class="weapon">${weaponName}</span><span class="mag">${mag} / ${reserve}</span><span class="nades">${grenades ? `◉ ${grenades}` : ''}</span>`;
    },
    setMoney(money) {
      const moneyEl = el.health.querySelector('.money');
      if (moneyEl) moneyEl.textContent = `$${money}`;
    },
    setTimer(text, secondsLeft, phase) {
      el.timer.textContent = text;
      const warn = secondsLeft <= 10 && phase === 'play';
      if (warn !== timerWarn) {
        timerWarn = warn;
        el.timer.classList.toggle('warn', warn);
      }
    },
    setTeams(orbit, umbra, orbitScore, umbraScore) {
      el.teams.innerHTML =
        `<span class="orbit">ORBIT ${orbitScore}</span><span class="sep">·</span>` +
        `<span class="umbra">${umbraScore} UMBRA</span>`;
    },
    setObjective(text, isAlert) {
      el.objective.textContent = text;
      el.objective.classList.toggle('alert', !!isAlert);
    },
    setCompass(site, yaw) {
      if (!site) {
        el.compass.textContent = '';
        return;
      }
      const angle = Math.atan2(-site.x, -site.z) - yaw;
      const degrees = ((angle * 180) / Math.PI + 360) % 360;
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dir = dirs[Math.round(degrees / 45) % 8];
      el.compass.textContent = `◈ ${site.name} ${dir} ${Math.round(site.dist)}m`;
    },
    setProgress(fraction, label) {
      if (label === null) {
        el.progress.classList.remove('visible');
        return;
      }
      el.progress.classList.add('visible');
      el.progressBar.style.width = `${Math.round(fraction * 100)}%`;
      el.progressLabel.textContent = label;
    },
    flashDamage() {
      el.damage.classList.remove('show');
      void el.damage.offsetWidth;
      el.damage.classList.add('show');
    },
    showHitmarker(kill) {
      el.hitmarker.textContent = kill ? '✕' : '✕';
      el.hitmarker.classList.toggle('kill', kill);
      el.hitmarker.classList.add('show');
      setTimeout(() => el.hitmarker.classList.remove('show'), 120);
    },
    showStreak(text, bonus) {
      el.streak.innerHTML = `<span class="streak-text">${text}</span><span class="streak-bonus">+${bonus}</span>`;
      el.streak.classList.remove('show');
      void el.streak.offsetWidth;
      el.streak.classList.add('show');
    },
    killFeed(shooter, victim, headshot, killerIsPlayer, victimIsPlayer) {
      showKillFeed(shooter, victim, headshot, killerIsPlayer, victimIsPlayer);
    },
    showBuy(items, money) {
      el.buyMenu.classList.add('open');
      el.buyItems.innerHTML = items
        .map(
          (item) => `
          <button class="buy-item ${item.owned ? 'owned' : ''} ${money < item.price ? 'cant' : ''}"
                  data-id="${item.id}" data-kind="${item.kind}">
            <span class="name">${item.name}</span>
            <span class="desc">${item.desc}</span>
            <span class="price">${item.owned ? 'OWNED' : `$${item.price}`}</span>
          </button>`,
        )
        .join('');
      el.buyItems.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          callbacks.onBuy(button.dataset.id, button.dataset.kind);
        });
      });
    },
    hideBuy() {
      el.buyMenu.classList.remove('open');
    },
    showLockHint(show) {
      el.lockHint.style.display = show ? 'block' : 'none';
    },
    showOverlay(html) {
      el.overlay.classList.add('visible');
      el.overlayPanel.innerHTML = html;
    },
    hideOverlay() {
      el.overlay.classList.remove('visible');
      el.overlayPanel.innerHTML = '';
    },
    setCrosshair,
    showTitle() {
      this.showOverlay(`
        <div class="title-kicker">ORBIT vs UMBRA</div>
        <h1 class="title">NIGHTSHIFT</h1>
        <p class="subtitle">Tactical night raid · first to 5 rounds</p>
        <div class="rules">
          <div><b>ORBIT</b> attacks — plant the charge at A or B</div>
          <div><b>UMBRA</b> defends — stop the plant, or defuse it</div>
          <div>Win a round by planting and detonating, or by eliminating the enemy team</div>
        </div>
        <div class="controls">
          <span><b>W A S D</b> move</span><span><b>Mouse</b> aim</span><span><b>Click</b> shoot</span>
          <span><b>Right mouse</b> zoom</span><span><b>R</b> reload</span><span><b>E</b> plant / defuse / pick up</span>
          <span><b>G</b> grenade</span><span><b>Q</b> switch weapon</span><span><b>B</b> buy</span><span><b>Space</b> jump</span>
          <span><b>Ctrl</b> crouch</span><span><b>M</b> mute</span>
        </div>
        <button class="big" id="start-btn">START NIGHTSHIFT</button>
        <p class="hint">Click START, then click the game to lock your mouse.</p>
      `);
      const btn = document.getElementById('start-btn');
      btn.addEventListener('click', () => callbacks.onStart());
    },
    showMatchEnd(won, orbitScore, umbraScore, stats) {
      this.showOverlay(`
        <div class="title-kicker">${won ? 'ORBIT WINS THE NIGHT' : 'UMBRA HOLDS THE TERMINAL'}</div>
        <h1 class="title">${orbitScore} — ${umbraScore}</h1>
        <p class="subtitle">${won ? 'The charge went up. The terminal is yours.' : 'The terminal stayed dark. Try another shift.'}</p>
        <div class="rules">
          <div>Kills <b>${stats.kills}</b> · Deaths <b>${stats.deaths}</b> · Plants <b>${stats.plants}</b> · Defuses <b>${stats.defuses}</b></div>
          <div>Best streak <b>${stats.bestStreak}</b> · Damage dealt <b>${stats.damage}</b></div>
        </div>
        <button class="big" id="restart-btn">PLAY AGAIN</button>
      `);
      const btn = document.getElementById('restart-btn');
      btn.addEventListener('click', () => callbacks.onRestart());
    },
    showRoundEnd(text, sub) {
      this.showOverlay(`
        <h1 class="title small">${text}</h1>
        <p class="subtitle">${sub}</p>
      `);
    },
    showPause() {
      this.showOverlay(`
        <h1 class="title small">PAUSED</h1>
        <p class="subtitle">Click anywhere to resume</p>
      `);
    },
  };
}
