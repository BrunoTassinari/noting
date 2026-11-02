// Fila de capturas offline do Noting. Script comum (sem módulos, sem build):
// usado pela página offline (offline.html) e pelo app (CaptureSync), que o
// carrega com uma tag <script>. Expõe window.NotingCapture.
//
// Cada captura: { id (uuid do aparelho), day ("2026-11-02", data local no
// momento da captura), text, createdAt (ms) }. Fica no localStorage até o
// servidor responder 200 a POST /api/capture com o id dela.
(function () {
  "use strict";
  if (self.NotingCapture) return;

  var KEY = "noting-capture-queue";
  var EVENT = "noting-capture-change";
  var MAX_LENGTH = 5000;

  function read() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
    try {
      self.dispatchEvent(new Event(EVENT));
    } catch (e) {
      /* sem window (não acontece hoje) */
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /** "2026-11-02" no relógio local do aparelho. */
  function localDay(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function uuid() {
    if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback (navegadores antigos / contexto sem HTTPS): UUID v4 aleatório.
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) {
      return x.toString(16).padStart(2, "0");
    }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  function list() {
    return read().sort(function (a, b) {
      return a.createdAt - b.createdAt;
    });
  }

  /** Guarda uma captura. Devolve o item, ou null se o texto está vazio. */
  function add(text) {
    var t = String(text || "").trim().slice(0, MAX_LENGTH);
    if (!t) return null;
    var now = new Date();
    var item = { id: uuid(), day: localDay(now), text: t, createdAt: now.getTime() };
    var all = read();
    all.push(item);
    write(all);
    return item;
  }

  function removeIds(ids) {
    var drop = {};
    ids.forEach(function (id) {
      drop[id] = true;
    });
    // Relê: outra aba pode ter mudado a fila enquanto o envio rodava.
    var all = read();
    var kept = all.filter(function (c) {
      return !drop[c.id];
    });
    if (kept.length !== all.length) write(kept);
  }

  function remove(id) {
    removeIds([id]);
  }

  var inFlight = null;

  /**
   * Envia a fila. Resolve com { status, sent }:
   *   status: "ok" | "empty" | "offline" | "unauthorized" | "error"
   *   sent: [{ id, day, status }] tirados da fila ("added" | "duplicate" | "invalid")
   */
  function sync() {
    if (inFlight) return inFlight;
    var pending = list().slice(0, 100);
    if (pending.length === 0) return Promise.resolve({ status: "empty", sent: [] });
    inFlight = fetch("/api/capture", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        captures: pending.map(function (c) {
          return { id: c.id, day: c.day, text: c.text };
        }),
      }),
    })
      .then(function (res) {
        if (res.status === 401) return { status: "unauthorized", sent: [] };
        if (!res.ok) return { status: "error", sent: [] };
        return res.json().then(function (data) {
          var byId = {};
          pending.forEach(function (c) {
            byId[c.id] = c;
          });
          var sent = (data.results || [])
            .filter(function (r) {
              return byId[r.id];
            })
            .map(function (r) {
              return { id: r.id, day: byId[r.id].day, status: r.status };
            });
          removeIds(
            sent.map(function (r) {
              return r.id;
            }),
          );
          return { status: "ok", sent: sent };
        });
      })
      .catch(function () {
        return { status: "offline", sent: [] };
      })
      .then(function (result) {
        inFlight = null;
        // Mais de 100 na fila: manda o resto em seguida.
        if (result.status === "ok" && result.sent.length > 0 && read().length > 0) {
          return sync().then(function (more) {
            return { status: "ok", sent: result.sent.concat(more.sent) };
          });
        }
        return result;
      });
    return inFlight;
  }

  /** Avisa quando a fila muda (nesta aba ou em outra). Devolve o "desligar". */
  function onChange(cb) {
    function onStorage(e) {
      if (e.key === KEY) cb();
    }
    self.addEventListener(EVENT, cb);
    self.addEventListener("storage", onStorage);
    return function () {
      self.removeEventListener(EVENT, cb);
      self.removeEventListener("storage", onStorage);
    };
  }

  /** "2026-11-02" → "02/11" */
  function shortDay(day) {
    var p = String(day).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] : String(day);
  }

  /** "2 capturas enviadas para o dia 02/11" (ou null se nada foi aplicado). */
  function summarize(sent) {
    var ok = sent.filter(function (r) {
      return r.status !== "invalid";
    });
    if (ok.length === 0) return null;
    var days = [];
    ok.forEach(function (r) {
      if (days.indexOf(r.day) === -1) days.push(r.day);
    });
    days.sort();
    var labels = days.map(shortDay);
    var where =
      labels.length === 1
        ? "o dia " + labels[0]
        : "os dias " + labels.slice(0, -1).join(", ") + " e " + labels[labels.length - 1];
    return ok.length + (ok.length === 1 ? " captura enviada" : " capturas enviadas") + " para " + where;
  }

  self.NotingCapture = {
    summarize: summarize,
    shortDay: shortDay,
    list: list,
    add: add,
    remove: remove,
    sync: sync,
    onChange: onChange,
    localDay: localDay,
  };
})();
