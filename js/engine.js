/* Rules engine. Every rule lives here; the UI, the bots and remote players only answer questions.
   Texts are message objects {k, a} rendered by AR.fmt in the viewer's language. */
(function () {
  class Abort extends Error {}
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const CARD = id => AR.CARDS[id];
  const M = (k, ...a) => ({ k, a });
  const P = p => ({ p: p.id });
  const T = i => ({ tile: i });
  const Cd = id => ({ c: id });

  class Game {
    constructor(cfg, track, ui) {
      this.track = track;
      this.ui = ui;
      this.speed = cfg.speed ?? 1;
      this.players = cfg.players.map((pc, i) => {
        const r = AR.racer(pc.racer);
        return {
          id: i, name: pc.name, racer: pc.racer, bot: !!pc.bot, remote: pc.remote || null, color: AR.PLAYER_COLORS[i],
          pos: 0, hp: r.hp, maxHp: r.hp, stars: 0, hand: [], inPit: false,
          triggered: new Set(), flags: {}, epoch: 0,
          stats: { deaths: 0, arrests: 0, cards: 0 },
          jumps: pc.racer === 'hare' ? 3 : 0,
        };
      });
      this.deck = [];
      this.discard = [];
      this.uid = 1;
      this.over = false;
      this.dead = false;
      this.turnNo = 0;
      this.current = 0;
    }

    /* ---------- utilities ---------- */
    sleep(ms) {
      if (this.dead) return Promise.reject(new Abort());
      return new Promise(r => setTimeout(r, ms * this.speed)).then(() => { if (this.dead) throw new Abort(); });
    }
    log(m, p) { this.ui.log(m, p); }
    refresh() { if (!this.dead) this.ui.refresh(); }
    cell(i) { return this.track.cells[i]; }
    leaderPos() { return Math.max(...this.players.map(q => q.pos)); }
    isLeader(p) { return p.pos === this.leaderPos(); }
    range(p, base) { return base + (p.racer === 'eagle' ? 2 : 0); }
    zoneAt(i) { return this.track.zones.find(z => i > z.b1 && i <= z.b2); }
    pitBehind(pos) {
      let best = null;
      for (const pit of this.track.pits) if (pit.cell <= pos && (!best || pit.cell > best.cell)) best = pit;
      return best;
    }
    async ask(p, req) {
      if (this.dead) throw new Abort();
      let res;
      if (p.bot) {
        res = AR.AI.decide(this, p, req);
        if (req.kind !== 'pit' && req.kind !== 'ram') await this.sleep(250);
      } else {
        res = await this.ui.ask(p, req);
      }
      if (this.dead) throw new Abort();
      return res;
    }
    playerOptions(list, p, extra) {
      return list.map(q => ({
        value: q.id, player: q.id, label: M(q === p ? 'optYou' : 'optName', P(q)),
        sub: M('optPlayerSub', { r: q.racer }, q.pos, q.hp, q.stars, extra ? extra(q) : null),
      }));
    }

    /* ---------- deck ---------- */
    buildDeck() {
      const all = [];
      for (const id of Object.keys(AR.CARDS)) {
        const n = AR.cardCount(id, this.players.length);
        for (let k = 0; k < n; k++) all.push({ uid: this.uid++, id });
      }
      const actions = shuffle(all.filter(c => !CARD(c.id).event));
      const events = all.filter(c => CARD(c.id).event);
      for (const p of this.players) p.hand = actions.splice(0, 3);
      this.deck = shuffle(actions.concat(events));
    }
    async draw(p, n = 1) {
      for (let k = 0; k < n && !this.over; k++) {
        for (let guard = 0; guard < 12; guard++) {
          if (!this.deck.length) {
            if (!this.discard.length) return;
            this.deck = shuffle(this.discard);
            this.discard = [];
            this.log(M('deckReshuffle'));
          }
          const card = this.deck.pop();
          if (CARD(card.id).event) {
            this.discard.push(card);
            await this.resolveEvent(card, p);
            if (this.over) return;
            continue;
          }
          p.hand.push(card);
          break;
        }
      }
      this.refresh();
    }
    spend(p, card) {
      p.hand = p.hand.filter(c => c.uid !== card.uid);
      this.discard.push(card);
      p.stats.cards++;
      this.log(M('plays', P(p), Cd(card.id)), p);
      this.ui.cardPlayed && this.ui.cardPlayed(p, card);
    }
    discardCards(p, uids) {
      const set = new Set(uids);
      const out = p.hand.filter(c => set.has(c.uid));
      p.hand = p.hand.filter(c => !set.has(c.uid));
      this.discard.push(...out);
      return out;
    }

    /* ---------- stars, damage, death ---------- */
    async addStars(p, n, src = {}) {
      if (n <= 0 || this.over) return;
      p.stars += n;
      this.ui.pop(p, `+${n}★`, 'star');
      this.log(M('starGain', P(p), n, src.reason || null), p);
      this.refresh();
      if (src.field && p.racer === 'fox' && !p.flags.foxUsed) {
        p.flags.foxUsed = true;
        this.log(M('foxDraw', P(p), n), p);
        await this.draw(p, n);
      }
      if (p.stars >= 6) await this.kill(p, 'arrest', src.by);
    }
    removeStars(p, n) {
      const was = p.stars;
      p.stars = Math.max(0, p.stars - n);
      if (was !== p.stars) this.ui.pop(p, `−${was - p.stars}★`, 'unstar');
    }
    async damage(p, n, src = {}) {
      if (this.over) return false;
      if (p.inPit) { this.log(M('immunePit', P(p)), p); return false; }
      p.hp -= n;
      this.ui.pop(p, `−${n}`, 'hp');
      this.log(M('hpLoss', P(p), n, src.reason || null), p);
      this.refresh();
      if (p.hp <= 0) { await this.kill(p, 'hp', src.by); return true; }
      return false;
    }
    heal(p, n) {
      const was = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + n);
      if (p.hp > was) this.ui.pop(p, `+${p.hp - was}`, 'heal');
      return p.hp - was;
    }
    async kill(p, cause, by) {
      const cheat = p.hand.find(c => c.id === 'cheat');
      if (cheat) {
        const use = await this.ask(p, {
          kind: 'cheat', card: 'cheat', title: M('cardName', Cd('cheat')),
          text: M(cause === 'hp' ? 'askCheatHp' : 'askCheatArrest'),
          options: [{ value: true, label: M('optPlayCard', Cd('cheat')) }, { value: false, label: M('optDontPlay') }],
        });
        if (use) {
          this.spend(p, cheat);
          if (cause === 'hp') p.hp = 1;
          p.stars = Math.min(5, p.stars + 2);
          this.log(M('cheated', P(p), p.hp, p.stars), p);
          this.refresh();
          return;
        }
      }
      const deathPos = p.pos;
      const pit = this.pitBehind(p.pos);
      p.epoch++;
      this.ui.warp(p, true);
      await this.sleep(260);
      if (pit) { p.pos = pit.cell; p.inPit = true; } else { p.pos = 0; p.inPit = false; }
      if (cause === 'hp') { p.hp = p.maxHp; p.stats.deaths++; } else { p.stars = 0; p.stats.arrests++; }
      this.log(M(cause === 'hp' ? 'crashed' : 'arrested', P(p), !!pit), p);
      this.ui.place(p);
      await this.sleep(60);
      this.ui.warp(p, false);
      this.refresh();
      await this.sleep(260);
      for (const v of this.players) {
        if (v === p || v.racer !== 'vulture' || Math.abs(v.pos - deathPos) > 5) continue;
        this.log(M('vultureFeed', P(v)), v);
        await this.draw(v, 1);
        this.heal(v, 1);
      }
      if (by && by !== p) await this.addStars(by, 1, { reason: M('rsnKilled', P(p)) });
      this.refresh();
    }

    async checkFinish(p) {
      if (this.over) return true;
      if (p.pos >= this.track.finish) {
        p.pos = this.track.finish;
        p.inPit = false;
        this.ui.place(p);
        this.over = true;
        this.winner = p;
        this.log(M('finished', P(p)), p);
        this.refresh();
        this.ui.win(p);
        return true;
      }
      return false;
    }

    /* ---------- movement ---------- */
    async moveTo(p, idx, how = 'slide') {
      idx = Math.max(0, Math.min(this.track.finish, idx));
      const from = p.pos;
      p.inPit = false;
      if (idx !== from) {
        if (how === 'slide') await this.ui.slide(p, from, idx);
        else {
          this.ui.warp(p, true);
          await this.sleep(240);
          p.pos = idx;
          this.ui.place(p);
          await this.sleep(40);
          this.ui.warp(p, false);
          await this.sleep(240);
        }
      }
      p.pos = idx;
      this.ui.place(p);
      this.refresh();
      await this.checkFinish(p);
    }
    moveBy(p, delta, how) { return this.moveTo(p, p.pos + delta, how); }

    /* Effect of the tile where a move ended ("Фінальна точка"). */
    async land(p, depth = 0) {
      if (this.over || p.inPit || depth > 10) return;
      const c = this.cell(p.pos);
      const ep = p.epoch;
      if (c.type === 'noparking') {
        this.log(M('npBack', P(p)), p);
        await this.moveTo(p, c.npStart - 1);
        return this.land(p, depth + 1);
      }
      if (p.triggered.has(p.pos)) return;
      if (['plain', 'start', 'finish'].includes(c.type)) return;
      p.triggered.add(p.pos);
      switch (c.type) {
        case 'crossing':
          await this.addStars(p, 1, { field: true, reason: M('rsnCrossing') });
          break;
        case 'car':
          await this.damage(p, 1, { reason: M('rsnCar') });
          break;
        case 'box':
          this.log(M('boxOpen', P(p)), p);
          await this.draw(p, 1);
          break;
        case 'nitro': {
          const d = d6();
          await this.ui.dice(p, [d], 0, 'nitro');
          this.log(M('nitroOn', P(p), d), p);
          await this.moveBy(p, d);
          if (p.epoch === ep) await this.land(p, depth + 1);
          break;
        }
        case 'tp':
          p.triggered.add(c.pair);
          this.log(M('teleport', P(p), c.pair, c.pair > p.pos), p);
          await this.moveTo(p, c.pair, 'warp');
          if (p.epoch === ep) await this.land(p, depth + 1);
          break;
        case 'chase':
          if (p.stars > 0) {
            this.log(M('chaseBack', P(p), p.stars), p);
            await this.moveBy(p, -p.stars);
            if (p.epoch === ep) await this.land(p, depth + 1);
          } else this.log(M('chaseNoStars', P(p)), p);
          break;
        case 'exit':
          this.log(M('exitSlide', P(p), c.exitTo), p);
          await this.moveTo(p, c.exitTo, 'warp');
          if (p.epoch === ep) await this.land(p, depth + 1);
          break;
      }
    }

    speedOf(p, dice, mod) {
      let base = dice.reduce((s, v) => s + v, 0);
      if (p.racer === 'turtle') base = Math.max(1, base - 2);
      return Math.max(0, base + mod);
    }

    async handbrakeWindow(roller, dice) {
      let mod = 0;
      const order = [];
      for (let k = 0; k < this.players.length; k++) order.push(this.players[(roller.id + k) % this.players.length]);
      for (let plays = 0; plays < 4;) {
        let played = false;
        for (const q of order) {
          const card = q.hand.find(c => c.id === 'handbrake');
          if (!card) continue;
          if (q !== roller && (q.inPit || roller.inPit)) continue; // nobody reaches into or out of a pit stop
          const speed = this.speedOf(roller, dice, mod);
          const options = [
            { value: '+2', label: M('optSpeedPlus'), sub: M('optSpeedWillBe', this.speedOf(roller, dice, mod + 2)) },
            { value: '-2', label: M('optSpeedMinus'), sub: M('optSpeedWillBe', this.speedOf(roller, dice, mod - 2)) },
            ...dice.map((d, i) => ({ value: 'r' + i, label: M('optReroll', dice.length > 1 ? i + 1 : 0, d) })),
          ];
          const choice = await this.ask(q, {
            kind: 'handbrake', card: 'handbrake', title: M('askHandbrakeTitle'), roller: roller.id, dice: dice.slice(), mod, speed,
            text: q === roller ? M('askHandbrakeOwn', speed) : M('askHandbrakeOther', P(roller), speed),
            options, cancel: M('optDontPlay'),
          });
          if (!choice) continue;
          this.spend(q, card);
          if (choice === '+2') mod += 2;
          else if (choice === '-2') mod -= 2;
          else { const i = +choice.slice(1); dice[i] = d6(); this.log(M('dieReroll', dice[i])); }
          await this.ui.dice(roller, dice, mod, 'speed', this.speedOf(roller, dice, mod));
          plays++;
          played = true;
          break;
        }
        if (!played) break;
      }
      return mod;
    }

    /* Skid (reaction): offered only when the check would actually hurt. */
    async offerSkid(p, what) {
      const card = p.hand.find(c => c.id === 'skid');
      if (!card) return false;
      const yes = await this.ask(p, {
        kind: 'skid', card: 'skid', what, title: M('cardName', Cd('skid')),
        text: M(what === 'turn' ? 'askSkidTurn' : 'askSkidCam'),
        options: [{ value: true, label: M('optPlayCard', Cd('skid')) }, { value: false, label: M('optDontPlay') }],
      });
      if (!yes) return false;
      this.spend(p, card);
      this.log(M(what === 'turn' ? 'skidTurn' : 'skidCam', P(p)), p);
      return true;
    }

    async diceMove(p, nDice) {
      const dice = Array.from({ length: nDice }, d6);
      await this.ui.dice(p, dice, 0, 'speed', this.speedOf(p, dice, 0));
      const mod = await this.handbrakeWindow(p, dice);
      const speed = this.speedOf(p, dice, mod);
      this.log(M('roll', P(p), dice.join(' + '), p.racer === 'turtle', mod, speed), p);
      if (speed === 0) { this.log(M('standStill', P(p)), p); return; }
      const ep = p.epoch;
      const passed = new Set();
      let s = 0;
      if (p.inPit) { // driving out of the pit onto the track is the first step of the move
        p.inPit = false;
        this.log(M('leavePit', P(p)), p);
        await this.ui.step(p);
        s = 1;
      }
      for (; s < speed; s++) {
        const b = p.pos;
        const chk = this.track.checks[b];
        if (chk) {
          const res = await this.applyCheck(p, chk, speed);
          if (this.over || p.epoch !== ep) return;
          if (res === 'stop') break;
        }
        if (this.zoneAt(b)) {
          for (const q of this.players) {
            if (q === p || q.inPit || q.pos !== b || passed.has(q)) continue;
            passed.add(q);
            await this.addStars(p, 1, { field: true, reason: M('rsnOvertake', P(q)) });
            if (this.over || p.epoch !== ep) return;
          }
        }
        p.pos = b + 1;
        await this.ui.step(p);
        if (await this.checkFinish(p)) return;
        const last = s === speed - 1;
        if (!last && p.racer === 'rhino') {
          for (const q of this.players.filter(q => q !== p && !q.inPit && q.pos === p.pos)) {
            const yes = await this.ask(p, {
              kind: 'ram', target: q.id, title: M('askRamTitle'), text: M('askRam', P(q), q.hp),
              options: [{ value: true, label: M('optRam') }, { value: false, label: M('optDriveBy') }],
            });
            if (!yes) continue;
            this.log(M('ram', P(p), P(q)), p);
            await this.damage(q, 1, { by: p, reason: M('rsnRam') });
            await this.damage(p, 1, { reason: M('rsnRamSelf') });
            if (this.over || p.epoch !== ep) return;
          }
        }
        const c = this.cell(p.pos);
        if (c.pit !== undefined && p.hp < p.maxHp) {
          const yes = await this.ask(p, {
            kind: 'pit', title: M('pitName'), text: M('askPit', p.maxHp),
            options: [{ value: true, label: M('optPitIn') }, { value: false, label: M('optDriveOn') }],
          });
          if (yes) {
            p.inPit = true;
            this.log(M('pitIn', P(p)), p);
            this.ui.place(p);
            this.refresh();
            return;
          }
        }
      }
      if (this.over || p.epoch !== ep) return;
      await this.land(p);
    }

    async applyCheck(p, chk, speed) {
      switch (chk.type) {
        case 'turn90':
        case 'turn180':
          if (speed < chk.diff) return;
          if (await this.offerSkid(p, 'turn')) return;
          await this.damage(p, 1, { reason: M('rsnTurn', speed, chk.diff) });
          return;
        case 'cam_max':
        case 'cam_min': {
          const hit = chk.type === 'cam_max' ? speed >= 7 : speed <= 4;
          if (!hit) return;
          if (await this.offerSkid(p, 'cam')) return;
          await this.addStars(p, 1, { field: true, reason: M(chk.type === 'cam_max' ? 'rsnCamFast' : 'rsnCamSlow') });
          return;
        }
        case 'police': {
          if (p.stars === 0) { this.log(M('policeCalm', P(p)), p); return; }
          const d = d6();
          await this.ui.dice(p, [d], 0, 'police');
          if (d > p.stars) { this.log(M('policePass', d, p.stars, P(p)), p); return; }
          this.log(M('policeStop', d, p.stars, P(p)), p);
          return 'stop';
        }
        case 'customs': {
          if (p.stars === 0 || !p.hand.length) { this.log(M('customsFree', P(p)), p); return; }
          const k = Math.min(p.stars, p.hand.length);
          const picked = await this.ask(p, { kind: 'discard', count: k, title: M('checkName', 'customs'), text: M('askCustoms', k) });
          this.discardCards(p, picked || p.hand.slice(0, k).map(c => c.uid));
          this.log(M('customsLeft', P(p), k), p);
          this.refresh();
          return;
        }
      }
    }

    /* ---------- turn ---------- */
    async turn(p) {
      this.turnNo++;
      for (const q of this.players) { q.triggered.clear(); q.flags.foxUsed = false; }
      p.flags = { cardsPlayed: 0 };
      this.current = p.id;
      await this.ui.turnStart(p);
      if (p.inPit && p.hp < p.maxHp) {
        this.heal(p, p.maxHp);
        this.log(M('repaired', P(p), p.hp), p);
      }
      const last = this.players.every(q => q === p || q.pos > p.pos);
      await this.draw(p, last ? 2 : 1);
      if (last) this.log(M('lastDraws2', P(p)), p);
      if (this.over) return;
      let moved = false;
      while (!this.over) {
        this.refresh();
        let act;
        if (p.bot) { await this.sleep(420); act = AR.AI.turnAction(this, p, moved); }
        else act = await this.ui.turnAction(p, moved);
        if (this.dead) throw new Abort();
        if (act.type === 'roll' && !moved) {
          moved = true;
          const max = p.racer === 'cheetah' ? 3 : 2;
          await this.diceMove(p, Math.max(1, Math.min(max, act.n)));
        } else if (act.type === 'jump' && this.canJump(p)) {
          await this.hareJump(p);
        } else if (act.type === 'card') {
          await this.playCard(p, act.uid);
        } else if (act.type === 'raccoon') {
          await this.raccoon(p);
        } else if (act.type === 'end' && moved) break;
        else if (p.bot && moved) break;
      }
      if (this.over) return;
      if (p.hand.length > 6) {
        const k = p.hand.length - 6;
        const picked = await this.ask(p, { kind: 'discard', count: k, title: M('askEndTitle'), text: M('askHandLimit', k) });
        this.discardCards(p, picked || p.hand.slice(0, k).map(c => c.uid));
      }
      this.refresh();
      if (p.bot && this.ui.botTurnDone) await this.ui.botTurnDone(p);
    }

    async run() {
      try {
        this.buildDeck();
        this.current = Math.floor(Math.random() * this.players.length);
        this.ui.started && this.ui.started(this);
        this.log(M('raceStart', P(this.players[this.current])));
        this.refresh();
        while (!this.over) {
          await this.turn(this.players[this.current]);
          if (this.over) break;
          this.current = (this.current + 1) % this.players.length;
        }
      } catch (e) {
        if (!(e instanceof Abort)) { console.error(e); this.ui.error && this.ui.error(e); }
      }
    }
    abort() { this.dead = true; }

    /* ---------- abilities ---------- */
    /* Hare: three jumps per race, at most one per turn, on top of the normal move. */
    canJump(p) { return p.racer === 'hare' && p.jumps > 0 && !p.flags.jumped; }
    async hareJump(p) {
      if (!this.canJump(p)) return false;
      const options = [];
      for (const k of [2, 1, -1, -2]) {
        const t = p.pos + k;
        if (t < 0 || t > this.track.finish) continue;
        options.push({ value: k, cell: t, label: M(k > 0 ? 'optForward' : 'optBack', Math.abs(k)), sub: M('optTileSub', t, T(t)) });
      }
      const k = await this.ask(p, { kind: 'hare', title: M('askHareTitle'), text: M('askHare', p.jumps), options, cancel: M('optCancel') });
      if (!k) return false;
      p.jumps--;
      p.flags.jumped = true;
      this.log(M('hareJump', P(p), k, p.jumps), p);
      await this.moveBy(p, k);
      if (!this.over) await this.land(p);
      return true;
    }
    canRaccoon(p) { return p.racer === 'raccoon' && !p.flags.raccoonUsed && p.hand.length >= 2 && p.stars > 0; }
    async raccoon(p) {
      if (!this.canRaccoon(p)) return;
      const picked = await this.ask(p, { kind: 'discard', count: 2, title: M('racerName', { r: 'raccoon' }), text: M('askRaccoon'), cancel: M('optCancel') });
      if (!picked) return;
      this.discardCards(p, picked);
      p.flags.raccoonUsed = true;
      this.removeStars(p, 1);
      this.log(M('raccoonUsed', P(p)), p);
      this.refresh();
    }

    /* ---------- cards ---------- */
    /* A racer in a pit stop is cut off from the track: they can't touch anyone, and nobody can touch them. */
    reachable(p) { return p.inPit ? [] : this.players.filter(q => q !== p && !q.inPit); }
    targetsInRange(p, base, unlimited) {
      const r = unlimited ? Infinity : this.range(p, base);
      return this.reachable(p).filter(q => Math.abs(q.pos - p.pos) <= r);
    }
    unstarTargets(p) { return this.players.filter(q => q.stars > 0 && (q === p || this.reachable(p).includes(q))); }
    racketTargets(p) { return this.reachable(p).filter(q => q.stars < p.stars && q.hand.length); }
    assaultTargets(p) { return this.targetsInRange(p, 3, p.racer === 'eagle'); }
    playable(p, id) {
      const c = CARD(id);
      if (c.reaction) return { ok: false, why: M(id === 'cheat' ? 'whyCheat' : id === 'skid' ? 'whySkid' : 'whyHandbrake') };
      switch (id) {
        case 'maneuver':
          if (this.unstarTargets(p).length || this.reachable(p).some(q => q.stars > 0)) return { ok: true };
          return { ok: false, why: M(p.inPit && this.players.some(q => q.stars > 0) ? 'whyInPit' : 'whyNoStars') };
        case 'setup': return { ok: true };
        case 'assault':
        case 'racket':
        case 'harpoon':
        case 'checkers':
        case 'jam':
          if (p.inPit) return { ok: false, why: M('whyInPit') };
          if (id === 'assault') return this.assaultTargets(p).length ? { ok: true } : { ok: false, why: M('whyNoneInRange', this.range(p, 3)) };
          if (id === 'racket') return this.racketTargets(p).length ? { ok: true } : { ok: false, why: M('whyNoRacket') };
          if (id === 'harpoon') return this.targetsInRange(p, 10).length ? { ok: true } : { ok: false, why: M('whyNoneInRange', this.range(p, 10)) };
          if (id === 'checkers') return this.targetsInRange(p, 4).some(q => q.pos !== p.pos) ? { ok: true } : { ok: false, why: M('whyNoneInRange', this.range(p, 4)) };
          return { ok: true };
        case 'looting':
          return this.discard.some(c => !CARD(c.id).event) ? { ok: true } : { ok: false, why: M('whyDiscardEmpty') };
        case 'lair':
          return p.hp < p.maxHp ? { ok: true } : { ok: false, why: M('whyHpFull') };
        default: return { ok: true };
      }
    }
    async playCard(p, uid) {
      const card = p.hand.find(c => c.uid === uid);
      if (!card || !this.playable(p, card.id).ok) return;
      await this['card_' + card.id](p, card);
      this.refresh();
    }
    async pickPlayer(p, list, req, extra) {
      if (!list.length) return null;
      const v = await this.ask(p, Object.assign({ kind: 'player', options: this.playerOptions(list, p, extra), cancel: M('optCancel') }, req));
      return v === null || v === undefined ? null : this.players[v];
    }
    cardTitle(id) { return M('cardName', Cd(id)); }

    async card_maneuver(p, card) {
      const a = this.unstarTargets(p);
      const b = this.reachable(p).filter(q => q.stars > 0);
      const mode = await this.ask(p, {
        kind: 'mode', card: card.id, title: this.cardTitle(card.id), text: M('chooseOne'), cancel: M('optCancel'),
        options: [
          { value: 'unstar', label: M('optUnstar'), disabled: !a.length },
          { value: 'move', label: M('optMoveByStars'), disabled: !b.length },
        ],
      });
      if (!mode) return;
      if (mode === 'unstar') {
        const q = await this.pickPlayer(p, a, { card: card.id, title: this.cardTitle(card.id), text: M('askWhoUnstar'), purpose: 'unstar' });
        if (!q) return;
        this.spend(p, card);
        this.removeStars(q, 1);
        this.log(M('unstarManeuver', P(q)), q);
        return;
      }
      const q = await this.pickPlayer(p, b, { card: card.id, title: this.cardTitle(card.id), text: M('askWhoMove'), purpose: 'push' });
      if (!q) return;
      const fw = Math.min(this.track.finish, q.pos + q.stars), bw = Math.max(0, q.pos - q.stars);
      const dir = await this.ask(p, {
        kind: 'dir', card: card.id, title: this.cardTitle(card.id), text: M('askWhereMove', P(q)), target: q.id, cancel: M('optCancel'),
        options: [
          { value: -1, label: M('optBack', q.stars), sub: M('optTileSub', bw, T(bw)), cell: bw },
          { value: 1, label: M('optForward', q.stars), sub: M('optTileSub', fw, T(fw)), cell: fw },
        ],
      });
      if (!dir) return;
      this.spend(p, card);
      this.log(M('shifted', P(q), dir, q.stars), q);
      await this.moveBy(q, dir * q.stars);
      await this.land(q);
    }

    async card_setup(p, card) {
      const a = [p, ...this.reachable(p)]; // you may frame yourself too
      const b = p.inPit ? [] : this.players.filter(q => !q.inPit && !this.isLeader(q));
      const mode = await this.ask(p, {
        kind: 'mode', card: card.id, title: this.cardTitle(card.id), text: M('chooseOne'), cancel: M('optCancel'),
        options: [
          { value: 'star', label: M('optGiveStar') },
          { value: 'push', label: M('optPush2'), disabled: !b.length },
        ],
      });
      if (!mode) return;
      if (mode === 'star') {
        const q = await this.pickPlayer(p, a, { card: card.id, title: this.cardTitle(card.id), text: M('askWhoStar'), purpose: 'star' });
        if (!q) return;
        this.spend(p, card);
        await this.addStars(q, 1, { by: p, reason: M('rsnSetup', P(p)) });
        return;
      }
      const q = await this.pickPlayer(p, b, { card: card.id, title: this.cardTitle(card.id), text: M('askWhoPush'), purpose: 'push2' },
        q => M('extraLands', T(Math.min(this.track.finish, q.pos + 2))));
      if (!q) return;
      this.spend(p, card);
      this.log(M('pushed2', P(q)), q);
      await this.moveBy(q, 2);
      await this.land(q);
    }

    async card_assault(p, card) {
      const list = this.assaultTargets(p);
      const q = await this.pickPlayer(p, list, {
        card: card.id, title: this.cardTitle(card.id),
        text: p.racer === 'eagle' ? M('askAssaultAny') : M('askAssault', this.range(p, 3)), purpose: 'hurt',
      });
      if (!q) return;
      this.spend(p, card);
      await this.damage(q, 2, { by: p, reason: M('rsnAssault', P(p)) });
      await this.addStars(p, 1, { reason: M('rsnAssaultSelf') });
    }

    async card_racket(p, card) {
      const list = this.racketTargets(p);
      const q = await this.pickPlayer(p, list, { card: card.id, title: this.cardTitle(card.id), text: M('askRacket'), purpose: 'rob' },
        q => M('extraTake', Math.min(p.stars - q.stars, q.hand.length)));
      if (!q) return;
      this.spend(p, card);
      const n = Math.min(p.stars - q.stars, q.hand.length);
      shuffle(q.hand);
      const taken = q.hand.splice(0, n);
      p.hand.push(...taken);
      this.log(M('racketTook', P(p), P(q), n), p);
    }

    async card_harpoon(p, card) {
      const list = this.targetsInRange(p, 10);
      const q = await this.pickPlayer(p, list, { card: card.id, title: this.cardTitle(card.id), text: M('askHarpoon'), purpose: 'harpoon' },
        q => M('extraMeet', Math.floor((p.pos + q.pos) / 2)));
      if (!q) return;
      this.spend(p, card);
      const mid = Math.floor((p.pos + q.pos) / 2);
      this.log(M('harpoonMeet', P(p), P(q), mid), p);
      await this.moveTo(q, mid);
      if (this.over) return;
      await this.moveTo(p, mid);
      await this.land(q);
      await this.land(p);
    }

    async card_looting(p, card) {
      const pool = this.discard.filter(c => !CARD(c.id).event);
      const picked = await this.ask(p, { kind: 'pick', title: this.cardTitle(card.id), text: M('askLoot'), cards: pool, count: 1, cancel: M('optCancel') });
      if (!picked || !picked.length) return;
      const got = this.discard.find(c => c.uid === picked[0]);
      if (!got) return;
      this.spend(p, card);
      this.discard = this.discard.filter(c => c !== got);
      p.hand.push(got);
      this.log(M('lootPicked', P(p), Cd(got.id)), p);
    }

    async card_jam(p, card) {
      const lp = this.leaderPos();
      const leaders = this.reachable(p).filter(q => q.pos === lp && q.pos > 0);
      const mode = await this.ask(p, {
        kind: 'mode', card: card.id, title: this.cardTitle(card.id), text: M('chooseOne'), cancel: M('optCancel'),
        options: [
          { value: 'all', label: M('optJamAll'), sub: M('optJamAllSub') },
          { value: 'leader', label: M('optJamLeader'), disabled: !leaders.length, sub: leaders.length ? M('optName', P(leaders[0])) : M('optJamYouLead') },
        ],
      });
      if (!mode) return;
      this.spend(p, card);
      if (mode === 'leader') {
        for (const q of leaders) { this.log(M('jamLeader', P(q)), q); await this.moveBy(q, -3); }
        for (const q of leaders) await this.land(q);
        return;
      }
      const moved = this.reachable(p).filter(q => q.pos > 0);
      for (const q of moved) await this.moveBy(q, -1);
      for (const q of moved) await this.land(q);
    }

    async card_feint(p, card) {
      const max = Math.max(1, p.stars);
      const options = [];
      for (let k = max; k >= -max; k--) {
        if (!k) continue;
        const t = p.pos + k;
        if (t < 0 || t > this.track.finish) continue;
        options.push({ value: t, cell: t, label: M(k > 0 ? 'optForward' : 'optBack', Math.abs(k)), sub: M('optTileSub', t, T(t)) });
      }
      const t = await this.ask(p, { kind: 'cell', card: card.id, title: this.cardTitle(card.id), text: M('askFeint', max), options, cancel: M('optCancel') });
      if (t === null || t === undefined) return;
      this.spend(p, card);
      await this.moveTo(p, t);
      await this.land(p);
    }

    async card_lair(p, card) {
      this.spend(p, card);
      const got = this.heal(p, Math.max(1, p.stars));
      this.log(M('lairHeal', P(p), got), p);
    }

    async card_checkers(p, card) {
      const list = this.targetsInRange(p, 4).filter(q => q.pos !== p.pos);
      const q = await this.pickPlayer(p, list, { card: card.id, title: this.cardTitle(card.id), text: M('askSwap'), purpose: 'swap' });
      if (!q) return;
      this.spend(p, card);
      const a = p.pos, b = q.pos;
      this.log(M('swapped', P(p), P(q)), p);
      p.inPit = false;
      p.pos = b;
      q.pos = a;
      this.ui.warp(p, true); this.ui.warp(q, true);
      await this.sleep(240);
      this.ui.place(p); this.ui.place(q);
      await this.sleep(40);
      this.ui.warp(p, false); this.ui.warp(q, false);
      await this.sleep(240);
      if (await this.checkFinish(p)) return;
      await this.land(p);
      await this.land(q);
    }

    /* ---------- events ---------- */
    async resolveEvent(card, drawer) {
      this.log(M('eventDrawn', Cd(card.id), P(drawer)));
      await this.ui.event(card.id, drawer);
      switch (card.id) {
        case 'raid': {
          const max = Math.max(...this.players.map(q => q.stars));
          if (max <= 0) { this.log(M('raidNone')); break; }
          for (const q of this.players.filter(q => q.stars === max)) { await this.damage(q, 2, { reason: M('rsnRaid') }); if (this.over) return; }
          break;
        }
        case 'roundup': {
          const moved = this.players.filter(q => q.stars > 0 && !q.inPit).sort((x, y) => y.pos - x.pos);
          if (!moved.length) { this.log(M('roundupNone')); break; }
          for (const q of moved) { this.log(M('roundupBack', P(q), 2 * q.stars), q); await this.moveBy(q, -2 * q.stars); }
          for (const q of moved) await this.land(q);
          break;
        }
        case 'coronation': {
          const lp = this.leaderPos();
          const leaders = this.players.filter(q => q.pos === lp && !q.inPit);
          for (const q of leaders) { this.log(M('coronationBack', P(q)), q); await this.moveBy(q, -5); }
          for (const q of leaders) await this.land(q);
          break;
        }
        case 'amnesia': {
          for (const q of this.players) { this.discard.push(...q.hand); q.hand = []; }
          this.refresh();
          for (const q of this.players) { await this.draw(q, 3); if (this.over) return; }
          this.log(M('amnesiaDone'));
          break;
        }
        case 'snitch':
          for (const q of this.players) { await this.addStars(q, 1, { reason: M('rsnSnitch') }); if (this.over) return; }
          break;
      }
      this.refresh();
    }
  }

  AR.Game = Game;
  AR.Abort = Abort;
  AR.util = { shuffle };
})();
