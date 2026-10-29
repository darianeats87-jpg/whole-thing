/* Projection Studios Games: Tic Tac Toe, Connect 4, Snake, 2048, Memory, Minesweeper, Rock Paper Scissors.
   Everything runs in the browser. Best scores are saved on this device. */
(() => {
  const E = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const LS = (k, d) => { try { const v = JSON.parse(localStorage.getItem('shg:' + k)); return v == null ? d : v; } catch { return d; } };
  const SV = (k, v) => { try { localStorage.setItem('shg:' + k, JSON.stringify(v)); } catch {} };
  const pick = (a) => a[Math.random() * a.length | 0];
  function recordArcade(game,result){const stats=LS('arcadeStats',{games:0,wins:0,byGame:{},daily:{}});stats.games=(stats.games||0)+1;stats.byGame=stats.byGame||{};stats.daily=stats.daily||{};const key=new Date().toISOString().slice(0,10);stats.daily[key]=stats.daily[key]||{games:0,wins:0};stats.daily[key].games++;if(result==='win'){stats.wins=(stats.wins||0)+1;stats.daily[key].wins++}stats.byGame[game]=stats.byGame[game]||{games:0,wins:0};stats.byGame[game].games++;if(result==='win')stats.byGame[game].wins++;SV('arcadeStats',stats);window.dispatchEvent(new CustomEvent('sh:arcade-stats',{detail:stats}));}
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function diffSelect(opts, value, onchange) {
    const s = E('select', 'shg-sel'); opts.forEach(([v, t]) => { const o = E('option', '', t); o.value = v; s.append(o); });
    s.value = value; s.onchange = () => onchange(s.value); return s;
  }
  function keys(handler) { const f = (e) => handler(e); document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }
  function swipe(el, cb) {
    let x0, y0;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });
  }

  /* ---------- Tic Tac Toe ---------- */
  function ttt(root) {
    let b, over, diff = 'hard'; const sc = LS('ttt', { w: 0, l: 0, d: 0 });
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const win = (b, p) => lines.find((l) => l.every((i) => b[i] === p));
    const empty = (b) => b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    function mm(b, p) {
      if (win(b, 'O')) return 1; if (win(b, 'X')) return -1;
      const e = empty(b); if (!e.length) return 0;
      let best = p === 'O' ? -2 : 2;
      for (const i of e) { b[i] = p; const s = mm(b, p === 'O' ? 'X' : 'O'); b[i] = ''; best = p === 'O' ? Math.max(best, s) : Math.min(best, s); }
      return best;
    }
    function bot() {
      const e = empty(b); if (diff === 'easy' && Math.random() < 0.6) return pick(e);
      let best = -2, mv = [];
      for (const i of e) { b[i] = 'O'; const s = mm(b, 'X'); b[i] = ''; if (s > best) { best = s; mv = [i]; } else if (s === best) mv.push(i); }
      return pick(mv);
    }
    const top = E('div', 'shg-bar'), st = E('div', 'shg-st'), grid = E('div', 'shg-ttt');
    top.append(diffSelect([['easy', 'Easy'], ['hard', 'Unbeatable']], diff, (v) => { diff = v; reset(); }));
    const online=E('button','shg-btn','Play with friend');online.onclick=()=>{if(cleanup)cleanup();cleanup=onlineMatch(root,'tictactoe')};top.append(online);
    const rb = E('button', 'shg-btn', 'New game'); rb.onclick = () => reset(); top.append(rb);
    root.append(top, st, grid);
    function finish() {
      const w = win(b, 'X') || win(b, 'O');
      if (w) { over = true; const x = b[w[0]] === 'X'; sc[x ? 'w' : 'l']++; recordArcade('tictactoe',x?'win':'loss'); st.textContent = x ? 'You win! 🎉' : 'Bot wins 🤖'; w.forEach((i) => grid.children[i].classList.add('shg-win')); }
      else if (!empty(b).length) { over = true; sc.d++; recordArcade('tictactoe','draw'); st.textContent = "It's a draw."; }
      if (over) SV('ttt', sc); return over;
    }
    function draw() { [...grid.children].forEach((c, i) => { c.textContent = b[i]; c.className = 'shg-cell' + (b[i] ? ' ' + b[i] : ''); }); if (!over) st.textContent = `Your turn (X)   ·   W ${sc.w}  L ${sc.l}  D ${sc.d}`; }
    function reset() { b = Array(9).fill(''); over = false; draw(); }
    for (let i = 0; i < 9; i++) { const c = E('button', 'shg-cell'); c.onclick = () => { if (over || b[i]) return; b[i] = 'X'; if (!finish()) { b[bot()] = 'O'; finish(); } draw(); if (over) { const w = win(b, 'X') || win(b, 'O'); if (w) w.forEach((j) => grid.children[j].classList.add('shg-win')); } }; grid.append(c); }
    reset();
  }

  /* ---------- Connect 4 ---------- */
  function c4(root) {
    const R = 6, C = 7, ORDER = [3, 2, 4, 1, 5, 0, 6]; let b, over, turn, depth = 3, timer, sc = LS('c4', { w: 0, l: 0, d: 0 }), winCells = [];
    const top = E('div', 'shg-bar'), st = E('div', 'shg-st'), wrap = E('div', 'shg-c4'), heads = E('div', 'shg-c4h'), grid = E('div', 'shg-c4g');
    top.append(diffSelect([['1', 'Easy'], ['3', 'Medium'], ['5', 'Hard']], '3', (v) => { depth = +v; reset(); }));
    const online=E('button','shg-btn','Play with friend');online.onclick=()=>{if(cleanup)cleanup();cleanup=onlineMatch(root,'connect4')};top.append(online);
    const rb = E('button', 'shg-btn', 'New game'); rb.onclick = () => reset(); top.append(rb);
    wrap.append(heads, grid); root.append(top, st, wrap);
    const four = (b, p) => {
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
        const cells = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[rr][cc] !== p) break; cells.push([rr, cc]); }
        if (cells.length === 4) return cells;
      }
      return null;
    };
    const drop = (b, c, p) => { for (let r = R - 1; r >= 0; r--) if (!b[r][c]) { b[r][c] = p; return r; } return -1; };
    const full = (b) => b[0].every(Boolean);
    function evalB(b) {
      let s = 0; for (let r = 0; r < R; r++) s += b[r][3] === 2 ? 3 : b[r][3] === 1 ? -3 : 0;
      const w = (cs) => { let a = 0, p = 0, e = 0; for (const v of cs) { if (v === 2) a++; else if (v === 1) p++; else e++; } if (a === 3 && e === 1) return 5; if (a === 2 && e === 2) return 2; if (p === 3 && e === 1) return -6; return 0; };
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
        const cs = []; for (let k = 0; k < 4; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= R || cc < 0 || cc >= C) break; cs.push(b[rr][cc]); }
        if (cs.length === 4) s += w(cs);
      }
      return s;
    }
    function mm(b, d, a, be, max) {
      if (four(b, 2)) return 100000 + d; if (four(b, 1)) return -100000 - d; if (full(b) || d === 0) return evalB(b);
      let best = max ? -Infinity : Infinity;
      for (const c of ORDER) { const r = drop(b, c, max ? 2 : 1); if (r < 0) continue; const s = mm(b, d - 1, a, be, !max); b[r][c] = 0;
        if (max) { best = Math.max(best, s); a = Math.max(a, s); } else { best = Math.min(best, s); be = Math.min(be, s); } if (a >= be) break; }
      return best;
    }
    function botMove() {
      let best = -Infinity, mv = [];
      for (const c of ORDER) { const r = drop(b, c, 2); if (r < 0) continue; const s = mm(b, depth - 1, -Infinity, Infinity, false); b[r][c] = 0; if (s > best) { best = s; mv = [c]; } else if (s === best) mv.push(c); }
      return depth === 1 && Math.random() < 0.4 ? pick(ORDER.filter((c) => !b[0][c])) : mv[0];
    }
    function render() {
      [...grid.children].forEach((cell, i) => { const r = i / C | 0, c = i % C; cell.className = 'shg-disc' + (b[r][c] === 1 ? ' p1' : b[r][c] === 2 ? ' p2' : '') + (winCells.some(([a, d]) => a === r && d === c) ? ' shg-win' : ''); });
      if (!over) st.textContent = (turn === 1 ? 'Your turn (red)' : 'Bot is thinking…') + `   ·   W ${sc.w}  L ${sc.l}  D ${sc.d}`;
    }
    function check(p) {
      const w = four(b, p);
      if (w) { over = true; winCells = w; sc[p === 1 ? 'w' : 'l']++; recordArcade('connect4',p===1?'win':'loss'); st.textContent = p === 1 ? 'You win! 🎉' : 'Bot wins 🤖'; SV('c4', sc); }
      else if (full(b)) { over = true; sc.d++; recordArcade('connect4','draw'); st.textContent = "It's a draw."; SV('c4', sc); }
      return over;
    }
    function play(c) {
      if (over || turn !== 1 || b[0][c]) return; drop(b, c, 1); if (check(1)) return render();
      turn = 2; render();
      timer = setTimeout(() => { const m = botMove(); drop(b, m, 2); if (!check(2)) turn = 1; render(); }, 350);
    }
    function reset() { clearTimeout(timer); b = Array.from({ length: R }, () => Array(C).fill(0)); over = false; turn = 1; winCells = []; render(); }
    for (let c = 0; c < C; c++) { const h = E('button', 'shg-col', '▼'); h.onclick = () => play(c); heads.append(h); }
    for (let i = 0; i < R * C; i++) grid.append(E('div', 'shg-disc'));
    reset();
    return () => clearTimeout(timer);
  }

  /* ---------- Snake ---------- */
  function snake(root) {
    const N = 18, S = 20; let sn, dir, nd, food, score, best = LS('snake', 0), run = false, iv, dead;
    const top = E('div', 'shg-bar'), st = E('div', 'shg-st'), cv = E('canvas', 'shg-cv'); cv.width = cv.height = N * S;
    const rb = E('button', 'shg-btn', 'Restart'); rb.onclick = () => reset(); top.append(rb);
    const pad = E('div', 'shg-pad'); [['up', '▲'], ['left', '◀'], ['down', '▼'], ['right', '▶']].forEach(([d, t]) => { const b = E('button', 'shg-btn', t); b.onclick = () => turn(d); pad.append(b); });
    root.append(top, st, cv, pad); const x = cv.getContext('2d');
    const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
    function turn(d) { if (dead) return; if (!run) { run = true; } if (d !== OPP[dir]) nd = d; }
    function placeFood() { do { food = [Math.random() * N | 0, Math.random() * N | 0]; } while (sn.some((s) => s[0] === food[0] && s[1] === food[1])); }
    function reset() { sn = [[9, 9], [8, 9], [7, 9]]; dir = nd = 'right'; score = 0; dead = false; run = false; placeFood(); draw(); }
    function step() {
      if (!run || dead) return; dir = nd; const h = [sn[0][0] + (dir === 'right') - (dir === 'left'), sn[0][1] + (dir === 'down') - (dir === 'up')];
      if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || sn.some((s) => s[0] === h[0] && s[1] === h[1])) { dead = true; if (score > best) { best = score; SV('snake', best); } draw(); return; }
      sn.unshift(h); if (h[0] === food[0] && h[1] === food[1]) { score++; placeFood(); } else sn.pop(); draw();
    }
    function draw() {
      x.fillStyle = '#0b0b0f'; x.fillRect(0, 0, N * S, N * S);
      x.fillStyle = '#6d5efc'; x.beginPath(); x.arc(food[0] * S + S / 2, food[1] * S + S / 2, S / 2 - 2, 0, 7); x.fill();
      sn.forEach((s, i) => { x.fillStyle = i ? '#3ddc84' : '#b7ffd0'; x.fillRect(s[0] * S + 1, s[1] * S + 1, S - 2, S - 2); });
      st.textContent = dead ? `Game over! Score ${score}. Best ${best}` : run ? `Score ${score}   ·   Best ${best}` : 'Press an arrow key or swipe to start';
    }
    const off = keys((e) => { const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[e.key]; if (m) { e.preventDefault(); turn(m); } });
    swipe(cv, turn); iv = setInterval(step, 110); reset();
    return () => { clearInterval(iv); off(); };
  }

  /* ---------- 2048 ---------- */
  function g2048(root) {
    let g, score, best = LS('g2048', 0), over;
    const top = E('div', 'shg-bar'), st = E('div', 'shg-st'), grid = E('div', 'shg-2048');
    const rb = E('button', 'shg-btn', 'New game'); rb.onclick = () => reset(); top.append(rb); root.append(top, st, grid);
    const slide = (row) => { const a = row.filter(Boolean); for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); } while (a.length < 4) a.push(0); return a; };
    function add() { const e = []; g.forEach((r, i) => r.forEach((v, j) => { if (!v) e.push([i, j]); })); if (!e.length) return; const [i, j] = pick(e); g[i][j] = Math.random() < 0.9 ? 2 : 4; }
    function move(d) {
      if (over) return; const before = JSON.stringify(g); const t = (m) => m[0].map((_, j) => m.map((r) => r[j]));
      if (d === 'left') g = g.map(slide); else if (d === 'right') g = g.map((r) => slide(r.slice().reverse()).reverse());
      else if (d === 'up') g = t(t(g).map(slide)); else g = t(t(g).map((r) => slide(r.slice().reverse()).reverse()));
      if (JSON.stringify(g) !== before) { add(); if (score > best) { best = score; SV('g2048', best); } }
      const can = g.some((r, i) => r.some((v, j) => !v || (g[i][j + 1] === v) || (g[i + 1] && g[i + 1][j] === v)));
      if (!can) over = true; draw();
    }
    function draw() {
      grid.innerHTML = ''; g.forEach((r) => r.forEach((v) => { const c = E('div', 'shg-t t' + Math.min(v, 4096), v || ''); grid.append(c); }));
      st.textContent = over ? `Game over! Score ${score}. Best ${best}` : `Score ${score}   ·   Best ${best}   ·   Arrow keys or swipe`;
    }
    function reset() { g = Array.from({ length: 4 }, () => Array(4).fill(0)); score = 0; over = false; add(); add(); draw(); }
    const off = keys((e) => { const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (m) { e.preventDefault(); move(m); } });
    swipe(grid, move); reset(); return off;
  }

  /* ---------- Memory ---------- */
  function memory(root) {
    const EM = ['🍕', '🚀', '🐙', '🎸', '🌈', '🦊', '🍩', '⚡']; let cards, open, lock, moves, found, best = LS('mem', 0), t;
    const top = E('div', 'shg-bar'), st = E('div', 'shg-st'), grid = E('div', 'shg-mem');
    const rb = E('button', 'shg-btn', 'New game'); rb.onclick = () => reset(); top.append(rb); root.append(top, st, grid);
    function reset() {
      clearTimeout(t); cards = shuffle([...EM, ...EM]); open = []; lock = false; moves = 0; found = 0; grid.innerHTML = '';
      cards.forEach((e, i) => { const c = E('button', 'shg-card', '?'); c.onclick = () => flip(i, c); grid.append(c); }); info();
    }
    const info = () => { st.textContent = found === 8 ? `You did it in ${moves} moves!${best ? ' Best ' + best : ''}` : `Moves ${moves}   ·   Pairs ${found}/8${best ? '   ·   Best ' + best : ''}`; };
    function flip(i, c) {
      if (lock || open.some((o) => o[0] === i) || c.classList.contains('done')) return; c.textContent = cards[i]; c.classList.add('up'); open.push([i, c]);
      if (open.length === 2) {
        moves++; const [[i1, c1], [i2, c2]] = open;
        if (cards[i1] === cards[i2]) { c1.classList.add('done'); c2.classList.add('done'); found++; open = []; if (found === 8 && (!best || moves < best)) { best = moves; SV('mem', best); } }
        else { lock = true; t = setTimeout(() => { c1.textContent = c2.textContent = '?'; c1.classList.remove('up'); c2.classList.remove('up'); open = []; lock = false; }, 800); }
        info();
      }
    }
    reset(); return () => clearTimeout(t);
  }

  /* ---------- Minesweeper ---------- */
  function mines(root) {
    const N = 9, M = 10; let cells, started, over, flags, flagMode = false, revealed;
    const top = E('div', 'shg-bar'), st = E('div', 'shg-st'), grid = E('div', 'shg-ms');
    const fb = E('button', 'shg-btn', '🚩 Flag mode: off'); fb.onclick = () => { flagMode = !flagMode; fb.textContent = '🚩 Flag mode: ' + (flagMode ? 'on' : 'off'); };
    const rb = E('button', 'shg-btn', 'New game'); rb.onclick = () => reset(); top.append(fb, rb); root.append(top, st, grid);
    const nb = (i) => { const r = i / N | 0, c = i % N, o = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if ((a || b) && r + a >= 0 && r + a < N && c + b >= 0 && c + b < N) o.push((r + a) * N + c + b); } return o; };
    function plant(safe) { const ban = new Set([safe, ...nb(safe)]); const pool = shuffle([...Array(N * N).keys()].filter((i) => !ban.has(i))).slice(0, M); pool.forEach((i) => { cells[i].m = true; }); cells.forEach((c, i) => { c.n = nb(i).filter((j) => cells[j].m).length; }); }
    function reveal(i) {
      const c = cells[i]; if (c.r || c.f) return; c.r = true; revealed++;
      if (c.m) return; if (!c.n) nb(i).forEach(reveal);
    }
    function click(i) {
      if (over) return; const c = cells[i];
      if (flagMode) { if (!c.r) { c.f = !c.f; flags += c.f ? 1 : -1; } return draw(); }
      if (c.f) return; if (!started) { started = true; plant(i); }
      if (c.m) { over = 'lose'; cells.forEach((x) => { if (x.m) x.r = true; }); return draw(); }
      reveal(i); if (revealed === N * N - M) over = 'win'; draw();
    }
    function draw() {
      grid.innerHTML = ''; cells.forEach((c, i) => {
        const b = E('button', 'shg-m' + (c.r ? ' open' : '') + (c.m && c.r ? ' bomb' : ''), c.r ? (c.m ? '💣' : (c.n || '')) : (c.f ? '🚩' : '')); if (c.r && c.n && !c.m) b.dataset.n = c.n;
        b.onclick = () => click(i); b.oncontextmenu = (e) => { e.preventDefault(); if (!over && !c.r) { c.f = !c.f; flags += c.f ? 1 : -1; draw(); } }; grid.append(b);
      });
      st.textContent = over === 'win' ? 'You cleared the board! 🎉' : over === 'lose' ? 'Boom! 💥 Try again.' : `Mines left: ${M - flags}   ·   Right-click or use Flag mode to flag`;
    }
    function reset() { cells = Array.from({ length: N * N }, () => ({ m: false, r: false, f: false, n: 0 })); started = false; over = null; flags = 0; revealed = 0; draw(); }
    reset();
  }

  /* ---------- Rock Paper Scissors ---------- */
  function rps(root) {
    const sc = LS('rps', { w: 0, l: 0, d: 0 }), O = [['✊', 'Rock'], ['✋', 'Paper'], ['✌️', 'Scissors']];
    const st = E('div', 'shg-st'), out = E('div', 'shg-rps-out', 'Choose your move'), row = E('div', 'shg-bar');
    const tally = () => { st.textContent = `W ${sc.w}   L ${sc.l}   D ${sc.d}`; };
    O.forEach(([e, n], i) => { const b = E('button', 'shg-big', e); b.title = n; b.onclick = () => { const o = Math.random() * 3 | 0, r = (i - o + 3) % 3; sc[r === 0 ? 'd' : r === 1 ? 'w' : 'l']++; SV('rps', sc); out.innerHTML = `You ${e} vs Bot ${O[o][0]}<br><b>${r === 0 ? "It's a draw" : r === 1 ? 'You win! 🎉' : 'Bot wins 🤖'}</b>`; tally(); }; row.append(b); });
    root.append(st, row, out); tally();
  }

  function onlineMatch(root, game) {
    const H=window.shAppH; if(!H){root.textContent='Projection Studios connection is unavailable.';return()=>{}};
    root.innerHTML='';const bar=E('div','shg-bar'),roomIn=E('input','shg-sel');roomIn.placeholder='Room code to share with your friend';roomIn.maxLength=40;const join=E('button','shg-btn','Join / Create match'),copy=E('button','shg-btn','Copy invite'),status=E('div','shg-st','Enter a code, then share it with your friend.'),board=E('div',game==='connect4'?'shg-c4g':'shg-ttt'),reset=E('button','shg-btn','Rematch');bar.append(roomIn,join,copy,reset);root.append(bar,status,board);
    let socket=null,role='',state=null,joined=false,finishedReported=false,off=[];
    function draw(){board.innerHTML='';if(!state){status.textContent='Waiting for a match…';return}status.textContent=(state.playerCount<2?'Waiting for friend to join · ':'')+(state.winner?(state.winner==='draw'?'Draw!':state.winner+' wins!'):'You are '+role+' · '+(state.turn===role?'Your turn':'Friend’s turn'));
      if(game==='tictactoe'){board.className='shg-ttt';state.board.forEach((v,i)=>{const b=E('button','shg-cell'+(v?' '+v:''),v);b.disabled=!!v||state.turn!==role||!!state.winner||state.playerCount<2;b.onclick=()=>socket&&socket.emit('game:move',{index:i});board.append(b)})}
      else{board.className='shg-c4g';for(let i=0;i<42;i++){const b=E('button','shg-disc'+(state.board[i]==='X'?' p1':state.board[i]==='O'?' p2':''),state.board[i]||'');b.disabled=state.turn!==role||!!state.winner||state.playerCount<2;b.onclick=()=>socket&&socket.emit('game:move',{column:i%7});board.append(b)}board.style.gridTemplateColumns='repeat(7,1fr)';}
      if(state.winner&&!finishedReported&&['X','O'].includes(role)){finishedReported=true;if(state.winner==='draw')score('draw');else score(state.winner===role?'win':'loss')}
    }
    async function score(result){recordArcade(game,result);if(!H.getToken())return;try{await H.api('/games/score',{method:'POST',body:JSON.stringify({game,result})})}catch{}}
    join.onclick=()=>{const code=roomIn.value.trim().replace(/[^a-z0-9_-]/gi,'').slice(0,40);if(!code){status.textContent='Enter a room code first.';return}H.joinRoom(code);socket=H.getSocket();if(!socket){status.textContent='Could not connect to room.';return}socket.emit('game:join',{game});joined=true;status.textContent='Joined '+code+'. Send your friend the room code.'};
    copy.onclick=async()=>{if(!roomIn.value.trim())return;const url=new URL(location.href);url.searchParams.set('room',roomIn.value.trim());try{await navigator.clipboard.writeText(url.href);status.textContent='Invite link copied.'}catch{prompt('Copy this invite link:',url.href)}};
    reset.onclick=()=>{if(socket&&joined){finishedReported=false;socket.emit('game:reset',{})}};
    const bind=()=>{if(!socket)return;const fn=d=>{state=d;role=d.role||role;draw()};socket.on('game:state',fn);off.push(()=>socket.off&&socket.off('game:state',fn))};
    join.addEventListener('click',()=>setTimeout(bind,0));
    const leader=E('div','shg-st','');const lb=E('button','shg-btn','Show leaderboard');lb.onclick=async()=>{try{const r=await H.api('/games/leaderboard?game='+game);leader.innerHTML='<b>Leaderboard</b><br>'+(r.length?r.map((x,i)=>(i+1)+'. '+(x.displayName||x.username)+' — '+x.wins+' wins, '+x.losses+' losses').join('<br>'):'No scores yet. Sign in and play a match to rank.')}catch(e){leader.textContent='Sign in to view the online leaderboard.'}};root.append(lb,leader);
    return()=>{off.forEach(f=>f());if(joined)H.leaveRoom()};
  }

  const GAMES = [
    { id: 'ttt', name: 'Tic Tac Toe', tag: 'vs Bot', e: '❌⭕', c: ['#7b2ff7', '#f107a3'], run: ttt },
    { id: 'c4', name: 'Connect 4', tag: 'vs Bot', e: '🔴🟡', c: ['#0f4c81', '#1a8fe3'], run: c4 },
    { id: 'snake', name: 'Snake', tag: 'Arcade', e: '🐍', c: ['#0b8a4c', '#3ddc84'], run: snake },
    { id: '2048', name: '2048', tag: 'Puzzle', e: '🔢', c: ['#c2410c', '#fbbf24'], run: g2048 },
    { id: 'mem', name: 'Memory Match', tag: 'Puzzle', e: '🧠', c: ['#be185d', '#fb7185'], run: memory },
    { id: 'mines', name: 'Minesweeper', tag: 'Classic', e: '💣', c: ['#334155', '#64748b'], run: mines },
    { id: 'rps', name: 'Rock Paper Scissors', tag: 'vs Bot', e: '✊✋✌️', c: ['#0e7490', '#22d3ee'], run: rps },
  ];

  let box, cleanup;
  function ensure() {
    if (box) return;
    box = E('div', '', '<div class="shg-box"><div class="shg-head"><b id="shgT"></b><button id="shgX" aria-label="Close">✕</button></div><div id="shgB"></div></div>'); box.id = 'shGame';
    document.body.append(box); box.addEventListener('click', (e) => { if (e.target === box) close(); }); box.querySelector('#shgX').onclick = close;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('open')) close(); });
  }
  function close() { if (cleanup) { try { cleanup(); } catch {} cleanup = null; } if (box) { box.classList.remove('open'); box.querySelector('#shgB').innerHTML = ''; } document.body.style.overflow = ''; }
  function open(id) {
    const g = GAMES.find((x) => x.id === id); if (!g) return; ensure(); close();
    box.querySelector('#shgT').textContent = g.e + '  ' + g.name; const body = box.querySelector('#shgB'); body.innerHTML = '';
    box.classList.add('open'); document.body.style.overflow = 'hidden'; cleanup = g.run(body) || null;
  }

  const css = E('style', '', `
#shGame{position:fixed;inset:0;z-index:2500;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:12px;overflow:auto}
#shGame.open{display:flex}.shg-box{background:#181818;color:#fff;border-radius:12px;width:min(520px,100%);max-height:96vh;overflow:auto;padding:16px 18px 22px;box-shadow:0 20px 60px #000}
.shg-head{display:flex;justify-content:space-between;align-items:center;font-size:20px;margin-bottom:10px}.shg-head button{background:#333;color:#fff;border:0;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:16px}
.shg-bar{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:6px 0 10px}.shg-st{text-align:center;color:#ccc;margin:6px 0 12px;min-height:22px}
.shg-btn,.shg-sel{background:#2d2d2d;color:#fff;border:1px solid #555;border-radius:6px;padding:8px 14px;font-size:15px;cursor:pointer}.shg-btn:hover{background:#3a3a3a}
.shg-big{font-size:46px;background:#2d2d2d;border:1px solid #555;border-radius:12px;width:92px;height:92px;cursor:pointer}.shg-big:hover{background:#3a3a3a}.shg-rps-out{text-align:center;font-size:24px;line-height:1.6;margin-top:16px}
.shg-ttt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(330px,100%);margin:0 auto}.shg-cell{aspect-ratio:1;font-size:54px;font-weight:800;background:#2d2d2d;border:0;border-radius:8px;color:#fff;cursor:pointer}.shg-cell.X{color:#6cb6ff}.shg-cell.O{color:#ff8a8a}.shg-win{outline:3px solid #3ddc84;outline-offset:-3px}
.shg-c4{width:min(364px,100%);margin:0 auto}.shg-c4h,.shg-c4g{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.shg-c4g{background:#1d4ed8;padding:8px;border-radius:10px}.shg-col{background:none;border:0;color:#aaa;cursor:pointer;font-size:16px}.shg-col:hover{color:#fff}
.shg-disc{aspect-ratio:1;border-radius:50%;background:#0b1330}.shg-disc.p1{background:#ef4444}.shg-disc.p2{background:#facc15}
.shg-cv{display:block;margin:0 auto;max-width:100%;border-radius:8px;border:2px solid #333;touch-action:none}.shg-pad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.shg-2048{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;background:#3b3b3b;padding:8px;border-radius:10px;width:min(340px,100%);margin:0 auto;touch-action:none}.shg-t{aspect-ratio:1;border-radius:6px;background:#4a4a4a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px}
.shg-t.t2{background:#eee4da;color:#333}.shg-t.t4{background:#ede0c8;color:#333}.shg-t.t8{background:#f2b179}.shg-t.t16{background:#f59563}.shg-t.t32{background:#f67c5f}.shg-t.t64{background:#f65e3b}.shg-t.t128{background:#edcf72;font-size:22px}.shg-t.t256{background:#edcc61;font-size:22px}.shg-t.t512{background:#edc850;font-size:22px}.shg-t.t1024{background:#edc53f;font-size:18px}.shg-t.t2048,.shg-t.t4096{background:#edc22e;font-size:18px}
.shg-mem{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:min(340px,100%);margin:0 auto}.shg-card{aspect-ratio:1;font-size:34px;background:#2d2d2d;border:1px solid #555;border-radius:10px;color:#777;cursor:pointer}.shg-card.up{background:#3b3b6b;color:#fff}.shg-card.done{background:#14532d;color:#fff}
.shg-ms{display:grid;grid-template-columns:repeat(9,1fr);gap:3px;width:min(360px,100%);margin:0 auto}.shg-m{aspect-ratio:1;background:#3a3a3a;border:0;border-radius:4px;color:#fff;font-weight:800;font-size:16px;cursor:pointer;padding:0}.shg-m.open{background:#1f1f1f;cursor:default}.shg-m.bomb{background:#7f1d1d}
.shg-m[data-n="1"]{color:#60a5fa}.shg-m[data-n="2"]{color:#4ade80}.shg-m[data-n="3"]{color:#f87171}.shg-m[data-n="4"]{color:#c084fc}.shg-m[data-n="5"]{color:#fb923c}
.sh-gt{flex:0 0 auto;width:170px;height:240px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;cursor:pointer;transition:transform .2s,box-shadow .2s;text-align:center;padding:10px;position:relative}
.sh-gt:hover{transform:scale(1.08);z-index:6;box-shadow:0 8px 24px #000a}.sh-gt .sh-ge{font-size:44px}.sh-gt b{font-size:18px}.sh-gt small{opacity:.85;letter-spacing:1px;text-transform:uppercase;font-size:11px}
.sh-grid .sh-gt{width:100%;height:220px}
.nav-links a,.sh-top-button{white-space:nowrap}`);
  document.head.append(css);const px=E('style','',`
.pt-extras{border-top:1px solid #333;margin-top:14px;padding-top:12px;display:grid;gap:12px}.pt-reaction{position:fixed;bottom:12%;z-index:99999;font-size:42px;pointer-events:none;animation:pt-float 2.4s ease-out forwards;text-shadow:0 4px 16px #000}@keyframes pt-float{0%{opacity:0;transform:translateY(20px) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translateY(-65vh) scale(1.4)}}
`);document.head.append(px);

  window.shGames = { list: GAMES, open, close };
})();
