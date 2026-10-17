/* Peer-to-peer transport (WebRTC data channels via PeerJS). The host's browser runs the rules engine;
   guests send their choices and receive game state. Only the connection handshake goes through the
   public PeerJS broker; game traffic flows directly between the players' browsers. */
(function () {
  const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'animal-rally-v2-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  AR.VERSION = '2.0';

  let loading = null;
  function loadLib() {
    if (window.Peer) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEER_SRC;
      s.async = true;
      s.onload = () => (window.Peer ? resolve() : reject(new Error('no-lib')));
      s.onerror = () => reject(new Error('no-lib'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('no-lib')), 15000);
    });
    loading.catch(() => { loading = null; });
    return loading;
  }
  const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
      const timer = setTimeout(() => { peer.destroy(); reject(new Error('timeout')); }, 15000);
      peer.on('open', () => { clearTimeout(timer); resolve(peer); });
      peer.on('error', err => { clearTimeout(timer); reject(err); });
    });
  }

  class Host {
    constructor(h) { this.h = h; this.conns = new Map(); }
    async open() {
      await loadLib();
      for (let tries = 0; tries < 4; tries++) {
        const code = makeCode();
        try {
          this.peer = await openPeer(PREFIX + code);
          this.code = code;
          break;
        } catch (e) {
          if (e && e.type !== 'unavailable-id') throw e;
        }
      }
      if (!this.peer) throw new Error('unavailable-id');
      this.peer.on('connection', conn => {
        conn.on('data', msg => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'hello') { this.conns.set(conn.peer, conn); this.h.onJoin(conn, msg); } else this.h.onMessage(conn, msg);
        });
        conn.on('close', () => { if (this.conns.delete(conn.peer)) this.h.onLeave(conn); });
        conn.on('error', () => { if (this.conns.delete(conn.peer)) this.h.onLeave(conn); });
      });
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* keep existing links */ } });
      return this.code;
    }
    send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* closed */ } }
    sendTo(peerId, msg) { this.send(this.conns.get(peerId), msg); }
    kick(peerId, msg) {
      const c = this.conns.get(peerId);
      if (!c) return;
      if (msg) this.send(c, msg);
      this.conns.delete(peerId);
      setTimeout(() => c.close(), 300);
    }
    close() { try { this.peer && this.peer.destroy(); } catch (e) { /* already closed */ } this.conns.clear(); }
  }

  class Client {
    constructor(h) { this.h = h; }
    async connect(code, hello) {
      await loadLib();
      this.peer = await openPeer(null);
      this.code = code.toUpperCase().trim();
      await new Promise((resolve, reject) => {
        const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
        const timer = setTimeout(() => reject(new Error('timeout')), 15000);
        this.peer.on('error', err => { clearTimeout(timer); reject(err); });
        conn.on('open', () => { clearTimeout(timer); this.conn = conn; conn.send(hello); resolve(); });
        conn.on('data', msg => this.h.onMessage(msg));
        conn.on('close', () => this.h.onClose());
        conn.on('error', () => this.h.onClose());
      });
    }
    send(msg) { try { if (this.conn && this.conn.open) this.conn.send(msg); } catch (e) { /* closed */ } }
    close() { try { this.peer && this.peer.destroy(); } catch (e) { /* already closed */ } }
  }

  /* Human-readable reason for a failed connection. */
  function errorText(e) {
    const type = e && (e.type || e.message);
    if (type === 'no-lib') return AR.t('netNoLib');
    if (type === 'peer-unavailable') return AR.lang === 'en' ? 'no room with this code' : 'кімнати з таким кодом немає';
    const sandbox = AR.lang === 'en' ? ' Inside the Claude preview network connections are blocked — open the game from its files or a web host.' : ' У вбудованому перегляді Claude мережеві з’єднання заблоковані — відкрий гру з файлів або з хостингу.';
    if (type === 'timeout') return (AR.lang === 'en' ? 'no answer (check the internet connection).' : 'немає відповіді (перевір інтернет).') + sandbox;
    if (type === 'network' || type === 'server-error' || type === 'socket-error') return (AR.lang === 'en' ? 'the connection broker is unreachable.' : 'сервер з’єднання недоступний.') + sandbox;
    if (type === 'browser-incompatible') return AR.lang === 'en' ? 'this browser does not support WebRTC' : 'браузер не підтримує WebRTC';
    return String(type || e);
  }

  AR.Net = { Host, Client, loadLib, errorText };
})();
