/* Bots: look a few tiles ahead, weigh HP, stars and progress, and play cards that clearly pay off. */
(function () {
  const VALUE = { cheat: 9, assault: 7, harpoon: 6, checkers: 6, lair: 5, handbrake: 5, feint: 5, maneuver: 5, skid: 4, setup: 4, racket: 4, jam: 4, looting: 3 };

  function respawnCell(G, pos) { const pit = G.pitBehind(pos); return pit ? pit.cell : 0; }
  function hpCost(G, p, hpAfter, pos) {
    if (hpAfter <= 0) return (pos - respawnCell(G, pos)) + 8;
    return 2.2 + (hpAfter === 1 ? 2 : 0);
  }
  function starCost(G, p, starsAfter, pos) {
    if (starsAfter >= 6) return (pos - respawnCell(G, pos)) + 7;
    return 1.6 + Math.max(0, starsAfter - 2) * 1.0;
  }
  function wantsPit(p, hp) { return hp <= Math.max(1, Math.floor(p.maxHp / 2)); }

  /* Value of ending a move on tile `pos` (relative to the player's current spot). */
  function tileValue(G, p, pos, hp = p.hp, stars = p.stars, depth = 0) {
    const T = G.track;
    if (pos >= T.finish) return 1000;
    const c = T.cells[pos];
    let v = pos - p.pos;
    if (depth > 3) return v;
    switch (c.type) {
      case 'noparking': return tileValue(G, p, c.npStart - 1, hp, stars, depth + 1);
      case 'crossing': return v - starCost(G, p, stars + 1, pos);
      case 'car': return v - hpCost(G, p, hp - 1, pos);
      case 'box': return v + 1.2;
      case 'nitro': return v + 3.3;
      case 'tp': return tileValue(G, p, c.pair, hp, stars, depth + 1) + 0.2;
      case 'chase': return stars ? tileValue(G, p, Math.max(0, pos - stars), hp, stars, depth + 1) : v;
      case 'exit': return tileValue(G, p, c.exitTo, hp, stars, depth + 1);
      default: return v;
    }
  }

  /* Expected value of a dice move at a given speed. */
  function evalSpeed(G, p, speed) {
    const T = G.track;
    if (speed <= 0) return 0;
    const rec = (pos, s, hp, stars, tSh, cSh, extra, skipAt) => {
      const passed = new Set();
      for (; s < speed; s++) {
        const chk = T.checks[pos];
        if (chk && skipAt !== pos) {
          if (chk.type === 'turn90' || chk.type === 'turn180') {
            if (tSh) { tSh--; cSh--; }
            else if (speed >= chk.diff) { extra -= hpCost(G, p, hp - 1, pos); hp--; }
          } else if ((chk.type === 'cam_max' && speed >= 7) || (chk.type === 'cam_min' && speed <= 4)) {
            if (cSh) { cSh--; tSh--; } else { extra -= starCost(G, p, stars + 1, pos); stars++; }
          } else if (chk.type === 'customs' && stars) {
            extra -= Math.min(stars, p.hand.length) * 0.9;
          } else if (chk.type === 'police' && stars) {
            const q = Math.min(1, stars / 6);
            const stop = tileValue(G, p, pos, hp, stars) + extra;
            return q * stop + (1 - q) * rec(pos, s, hp, stars, tSh, cSh, extra, pos);
          }
        }
        if (hp <= 0 || stars >= 6) return (pos - p.pos) + extra;
        if (G.zoneAt(pos)) {
          for (const o of G.players) if (o !== p && !o.inPit && o.pos === pos && !passed.has(o)) { passed.add(o); extra -= starCost(G, p, stars + 1, pos); stars++; }
          if (stars >= 6) return (pos - p.pos) + extra;
        }
        pos++;
        if (pos >= T.finish) return 1000;
        if (T.cells[pos].pit !== undefined && hp < p.maxHp && wantsPit(p, hp)) return (pos - p.pos) + extra + 2.5;
      }
      return tileValue(G, p, pos, hp, stars) + extra;
    };
    const skids = p.hand.filter(c => c.id === 'skid').length; // Skid is a reaction: it cancels one crash or camera
    return rec(p.pos, p.inPit ? 1 : 0, p.hp, p.stars, skids, skids, 0, -1); // leaving a pit costs the first step
  }

  function expectedDice(G, p, n) {
    let total = 0, count = 0;
    const loop = (k, sum) => {
      if (k === n) {
        let s = sum;
        if (p.racer === 'turtle') s = Math.max(1, s - 2);
        total += evalSpeed(G, p, s);
        count++;
        return;
      }
      for (let f = 1; f <= 6; f++) loop(k + 1, sum + f);
    };
    loop(0, 0);
    return total / count;
  }

  function chooseMove(G, p) {
    const max = p.racer === 'cheetah' ? 3 : 2;
    let best = { type: 'roll', n: max }, bestV = -Infinity;
    for (let n = 1; n <= max; n++) {
      const v = expectedDice(G, p, n);
      if (v > bestV + 0.01) { bestV = v; best = { type: 'roll', n }; }
    }
    return best;
  }
  /* Best Hare jump right now, or null when it is not worth one of the three jumps. */
  function planJump(G, p, moved) {
    if (!G.canJump(p)) return null;
    let bestK = null, bestV = moved ? 1.8 : 3;
    for (const k of [2, 1, -1, -2]) {
      const t = p.pos + k;
      if (t < 0 || t > G.track.finish) continue;
      const v = tileValue(G, p, t);
      if (v >= bestV) { bestV = v; bestK = k; }
    }
    return bestK;
  }

  const threat = (G, p, q) => q.pos >= p.pos - 3;

  function planCard(G, p, phase) {
    const plans = [];
    const seen = new Set();
    for (const card of p.hand) {
      if (seen.has(card.id) || !G.playable(p, card.id).ok) continue;
      seen.add(card.id);
      const add = (score, extra) => plans.push(Object.assign({ uid: card.uid, card: card.id, score }, extra));
      const opp = G.reachable(p);
      // casual bots: hostile cards mostly target whoever is close to the finish
      const rage = q => { const prog = q.pos / G.track.finish; return prog >= 0.7 ? 1 : 0.25 + prog; };
      const hostile = (score, q, extra) => { if (!p.flags.hostile) add(score * rage(q), Object.assign({ hostile: true }, extra)); };
      switch (card.id) {
        case 'lair': {
          const heal = Math.min(p.maxHp - p.hp, Math.max(1, p.stars));
          if (p.hp <= 2 || heal >= 2) add(heal * 2.1);
          break;
        }
        case 'maneuver': {
          if (p.stars >= 2) add(1.2 + (p.stars - 1) * 0.9, { mode: 'unstar', target: p.id });
          const tgt = opp.filter(q => !q.inPit && q.stars >= 2 && threat(G, p, q)).sort((a, b) => b.pos - a.pos)[0];
          if (tgt) hostile(tgt.stars * 0.7 + (G.isLeader(tgt) ? 1 : 0), tgt, { mode: 'move', target: tgt.id, dir: -1 });
          break;
        }
        case 'setup': {
          for (const q of opp) {
            if (q.stars === 5 && q.pos >= p.pos) hostile(4 + (G.isLeader(q) ? 1.5 : 0), q, { mode: 'star', target: q.id });
            else if (q.stars === 4 && threat(G, p, q)) hostile(1.3, q, { mode: 'star', target: q.id });
            if (!q.inPit && !G.isLeader(q)) {
              const harm = -(tileValue(G, q, Math.min(G.track.finish, q.pos + 2)) - 2);
              if (harm >= 2.5) hostile(harm * 0.8, q, { mode: 'push', target: q.id });
            }
          }
          if (!p.inPit && !G.isLeader(p)) {
            const gain = tileValue(G, p, Math.min(G.track.finish, p.pos + 2));
            if (gain >= 2) add(gain * 0.7, { mode: 'push', target: p.id });
          }
          break;
        }
        case 'assault': {
          if (p.stars >= 4) break;
          for (const q of G.assaultTargets(p)) {
            let s = 2 + (q.hp <= 2 ? 3 : 0) + (q.pos > p.pos ? 0.6 : 0) - (p.stars >= 4 ? 2.5 : 0);
            if (q.hand.some(c => c.id === 'cheat') && q.hp <= 2) s -= 1;
            hostile(s, q, { target: q.id });
          }
          break;
        }
        case 'racket': {
          for (const q of opp) if (q.stars < p.stars && q.hand.length) add(Math.min(p.stars - q.stars, q.hand.length) * 1.3, { target: q.id });
          break;
        }
        case 'harpoon': {
          for (const q of G.targetsInRange(p, 10)) {
            const mid = Math.floor((p.pos + q.pos) / 2);
            const gain = tileValue(G, p, mid) + (q.pos > p.pos ? (q.pos - mid) * 0.35 * rage(q) : 0);
            if (gain >= 3) add(gain * 0.75, { target: q.id });
          }
          break;
        }
        case 'checkers': {
          for (const q of G.targetsInRange(p, 4)) {
            if (q.pos <= p.pos) continue;
            const gain = tileValue(G, p, q.pos) + (q.pos - p.pos) * 0.4 * rage(q);
            if (gain >= 2) add(gain * 0.8, { target: q.id });
          }
          break;
        }
        case 'looting': {
          const best = G.discard.filter(c => !AR.CARDS[c.id].event).sort((a, b) => (VALUE[b.id] || 0) - (VALUE[a.id] || 0))[0];
          if (best && (VALUE[best.id] || 0) >= 6 && p.hand.length <= 4) add(1.6, { pick: best.uid });
          break;
        }
        case 'jam': {
          const hit = opp.filter(q => !q.inPit && q.pos > 0);
          const ahead = hit.filter(q => q.pos >= p.pos).length;
          const s = hit.length * 0.45 + ahead * 0.4;
          const lead = hit.slice().sort((a, b) => b.pos - a.pos)[0];
          if (s >= 1.6 && lead) hostile(s, lead, { mode: 'all' });
          if (lead && lead.pos === G.leaderPos() && lead.pos >= p.pos - 2) hostile(1.4 + (lead.pos > p.pos ? 0.8 : 0), lead, { mode: 'leader' });
          break;
        }
        case 'feint': {
          if (phase !== 'post') break;
          const max = Math.max(1, p.stars);
          let bestV = 0.9, bestT = null;
          for (let k = -max; k <= max; k++) {
            if (!k) continue;
            const t = p.pos + k;
            if (t < 0 || t > G.track.finish) continue;
            const v = tileValue(G, p, t);
            if (v > bestV) { bestV = v; bestT = t; }
          }
          if (bestT !== null) add(bestV * 0.8, { cell: bestT });
          break;
        }
      }
    }
    if (!plans.length) return null;
    plans.sort((a, b) => b.score - a.score);
    const threshold = p.hand.length >= 6 ? 0.9 : 1.5;
    return plans[0].score >= threshold ? plans[0] : null;
  }

  function lowestCards(p, n) {
    return p.hand.slice().sort((a, b) => (VALUE[a.id] || 0) - (VALUE[b.id] || 0)).slice(0, n).map(c => c.uid);
  }

  const AI = {
    turnAction(G, p, moved) {
      const f = p.flags;
      if (G.canRaccoon(p) && p.stars >= 2 && p.hand.length >= 4) return { type: 'raccoon' };
      if ((f.cardsPlayed || 0) < 2) {
        const plan = planCard(G, p, moved ? 'post' : 'pre');
        if (plan) {
          f.cardsPlayed = (f.cardsPlayed || 0) + 1;
          if (plan.hostile) f.hostile = true;
          p._plan = plan;
          return { type: 'card', uid: plan.uid };
        }
      }
      const jump = planJump(G, p, moved);
      if (jump !== null) { p._hare = jump; return { type: 'jump' }; }
      if (!moved) return chooseMove(G, p);
      return { type: 'end' };
    },

    decide(G, p, req) {
      const plan = p._plan && (!req.card || req.card === p._plan.card) ? p._plan : null;
      const enabled = (req.options || []).filter(o => !o.disabled);
      const has = v => enabled.some(o => o.value === v);
      switch (req.kind) {
        case 'mode': return plan && has(plan.mode) ? plan.mode : (enabled[0] ? enabled[0].value : null);
        case 'player': {
          if (plan && has(plan.target)) return plan.target;
          const pool = req.purpose === 'star' ? enabled.filter(o => o.value !== p.id) : enabled; // never frame yourself by accident
          return pool.length ? pool[0].value : null;
        }
        case 'dir': return plan && plan.dir ? plan.dir : -1;
        case 'cell': return plan && has(plan.cell) ? plan.cell : (enabled[0] ? enabled[0].value : null);
        case 'confirm': return true;
        case 'cheat': return true;
        case 'skid': {
          const many = p.hand.filter(c => c.id === 'skid').length >= 2;
          return req.what === 'turn' ? (p.hp <= 2 || many) : (p.stars >= 2 || many);
        }
        case 'hare': return has(p._hare) ? p._hare : (enabled[0] ? enabled[0].value : null);
        case 'pit': return wantsPit(p, p.hp);
        case 'ram': {
          const q = G.players[req.target];
          return (q.hp <= 1 && p.hp >= 2) || (p.hp > q.hp && p.hp >= 3);
        }
        case 'pick': {
          if (plan && plan.pick && req.cards.some(c => c.uid === plan.pick)) return [plan.pick];
          const best = req.cards.slice().sort((a, b) => (VALUE[b.id] || 0) - (VALUE[a.id] || 0))[0];
          return best ? [best.uid] : null;
        }
        case 'discard': return lowestCards(p, req.count);
        case 'handbrake': {
          const roller = G.players[req.roller];
          const s0 = req.speed;
          const sp = G.speedOf(roller, req.dice, req.mod + 2), sm = G.speedOf(roller, req.dice, req.mod - 2);
          const v0 = evalSpeed(G, roller, s0), vp = evalSpeed(G, roller, sp), vm = evalSpeed(G, roller, sm);
          if (roller === p) {
            const best = Math.max(vp, vm);
            if (best - v0 >= 2) return vp >= vm ? '+2' : '-2';
            return null;
          }
          if (!threat(G, p, roller)) return null;
          const worst = Math.min(vp, vm);
          if (v0 - worst >= 3) return vp <= vm ? '+2' : '-2';
          return null;
        }
        default: return enabled.length ? enabled[0].value : null;
      }
    },
  };

  AR.AI = AI;
})();
