// Token Launch Radar — dashboard logic.
//
// The board data arrives as window.RADAR_DATA (z-data.js), one compact array
// per row. Column order, kept in step with main.ts:
//   0 slug  1 name  2 category  3 first chain  4 second chain or null
//   5 chain count  6 tvl_usd  7 change_7d or null  8 age in years or null
//   9 implied_value_usd  10 status (0 pre-token, 1 not a launch candidate,
//   2 token already trades)  11 mcap_usd or null
//
// THE VALUE MODEL, restated so the page can show every row's arithmetic
// (main.ts computes the same numbers when it writes board.json):
//   implied value = TVL x 0.35 x momentum x age x category
//   momentum = 1 + 2 x 7-day TVL change, the change clamped to +/-30%
//   age      = 1 + 0.25 x years listed with no token, capped at 4 years
//   category = 1.15 DEX / lending / derivatives, 1.10 yield / RWA / curators /
//              allocators / restaking, 1.05 CDP / basis / collateral, 1.00 else
// Status 1 rows carry a nominal marker (TVL x 0.0001), never a launch value:
// exchanges, bridges and wrapped or staked products cannot launch a token of
// their own. Status 2 rows already trade: their market cap is shown, and the
// ranking value is capped below the pre-token board so the board never presents
// a launched token as the next launch.
//
// Farm plans come from playbooks.js, the same file main.ts uses, so the plan
// on screen is byte for byte the plan in board.json.

var MODEL = {
  base: 0.35,
  momentumK: 2,
  momentumCap: 30,
  ageK: 0.25,
  ageCap: 4,
  category: {
    Dexs: 1.15, Lending: 1.15, Derivatives: 1.15,
    Yield: 1.1, RWA: 1.1, 'Risk Curators': 1.1,
    'Onchain Capital Allocator': 1.1, Restaking: 1.1,
    CDP: 1.05, 'Yield Aggregator': 1.05, 'Basis Trading': 1.05,
    'Collateral Markets': 1.05,
  },
};

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

function fmtUsd(v) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  return '$' + Math.round(v).toLocaleString('en-US');
}

function fmtPct(v) {
  if (v === null || v === undefined) return '-';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function fmtAge(v) {
  if (v === null || v === undefined) return '-';
  return v.toFixed(1) + 'y';
}

function slugHash(slug) {
  var h = 0;
  for (var i = 0; i < slug.length; i++) h += slug.charCodeAt(i);
  return h;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The row's value broken into its factors, for the detail view. Returns
// { base, momentum, age, category, value } for pre-token rows; for the two
// separated statuses it returns { nominal: true } / { launched: true }.
function valueFactors(r) {
  var tvl = r[6];
  if (r[10] === 1) return { nominal: true, value: r[9] };
  if (r[10] === 2) return { launched: true, value: r[9], mcap: r[11] };
  var momentum = r[7] === null ? 1 : 1 + MODEL.momentumK * clamp(r[7], -MODEL.momentumCap, MODEL.momentumCap) / 100;
  var age = r[8] === null ? 1 : 1 + MODEL.ageK * Math.min(r[8], MODEL.ageCap);
  var cat = MODEL.category[r[2]] || 1;
  var base = tvl * MODEL.base;
  return { base: base, momentum: momentum, age: age, category: cat, value: Math.round(base * momentum * age * cat) };
}

function playbookFor(r) {
  var books = globalThis.RADAR_PLAYBOOKS.books;
  if (r[10] === 1) return books.notlaunch;
  if (r[10] === 2) return books.launched;
  return books[globalThis.RADAR_PLAYBOOKS.map[r[2]]] || books.generic;
}

// The capital tier follows the protocol's TVL band, not its slug: a bigger
// protocol gets a bigger farm, so the tier means the same thing on every row.
function stakeTier(tvl) {
  if (tvl < 25000000) return '$250';
  if (tvl <= 500000000) return '$500';
  return '$1,000';
}

// One last step, generated from this row's own numbers — the plan's
// data-driven check before any capital is committed (pre-token rows only).
// Identical to the dataStep in main.ts, so the plan on screen is byte for
// byte the plan in board.json.
function dataStep(r, stake) {
  var change = r[7] === null
    ? 'the snapshot records no 7-day TVL change'
    : 'TVL moved ' + (r[7] >= 0 ? '+' : '') + r[7].toFixed(1) + '% over the last 7 days';
  var ageText = r[8] === null
    ? 'no listing date in the snapshot'
    : 'listed ' + r[8].toFixed(1) + ' years ago with no token';
  var chains = r[5] > 1
    ? 'across ' + r[5] + ' chains (' + r[3] + ' and ' + r[4] + ')'
    : 'on ' + (r[3] || 'Ethereum') + ' only';
  return 'Before you commit capital, re-check this row: ' + r[1] + ' holds ' + fmtUsd(r[6]) + ' ' + chains + ', ' +
    change + ', ' + ageText + '. Size the farm at the ' + stake + ' tier for a protocol this size; ' +
    'if the 7-day move has reversed or TVL has fallen more than 20% since this snapshot, ' +
    'wait for the next radar instead of farming now.';
}

function farmSteps(r) {
  var stake = stakeTier(r[6]);
  var chain = r[3];
  var chain2 = r[4] || r[3];
  var subs = {
    '{name}': r[1], '{chain}': chain, '{chain2}': chain2,
    '{stake}': stake, '{cat}': r[2], '{tvl}': fmtUsd(r[6]),
  };
  var steps = playbookFor(r).steps.map(function (t) {
    var s = t;
    for (var k in subs) s = s.split(k).join(subs[k]);
    return s;
  });
  if (r[10] === 0) steps.push(dataStep(r, stake));
  return steps;
}

function statusLabel(r) {
  if (r[10] === 0) return ['pre', 'Pre-token'];
  if (r[10] === 1) return ['no', 'Not a launch'];
  return ['live', 'Token live'];
}

globalThis.RadarCore = {
  MODEL: MODEL, valueFactors: valueFactors, farmSteps: farmSteps,
  playbookFor: playbookFor, fmtUsd: fmtUsd, fmtPct: fmtPct, fmtAge: fmtAge,
};

if (typeof document !== 'undefined') {
  (function () {
    var DATA = globalThis.RADAR_DATA;
    var rows = DATA.rows;
    var qEl = document.getElementById('q');
    var catEl = document.getElementById('cat');
    var statusEl = document.getElementById('status');
    var sortEl = document.getElementById('sort');
    var tbody = document.getElementById('rows');
    var statsEl = document.getElementById('stats');
    var detailEl = document.getElementById('detail');
    var watchlist = DATA.watchlistCount;

    var cats = [];
    rows.forEach(function (r) { if (cats.indexOf(r[2]) === -1) cats.push(r[2]); });
    cats.sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      catEl.appendChild(o);
    });
    document.getElementById('asof').textContent = 'Snapshot ' + DATA.asOf + '  ·  ' + DATA.totalProtocols + ' protocols';

    function filtered() {
      var q = qEl.value.trim().toLowerCase();
      var cat = catEl.value;
      var st = statusEl.value;
      var out = rows.filter(function (r) {
        if (cat && r[2] !== cat) return false;
        if (st !== '' && String(r[10]) !== st) return false;
        if (q && r[1].toLowerCase().indexOf(q) === -1 && r[0].indexOf(q) === -1) return false;
        return true;
      });
      var key = sortEl.value;
      out.sort(function (a, b) {
        if (key === 'tvl') return b[6] - a[6];
        if (key === 'growth') return (b[7] === null ? -1e9 : b[7]) - (a[7] === null ? -1e9 : a[7]);
        if (key === 'age') return (b[8] === null ? -1 : b[8]) - (a[8] === null ? -1 : a[8]);
        return b[9] - a[9];
      });
      return out;
    }

    function render() {
      var list = filtered();
      var rankOf = {};
      rows.forEach(function (r, i) { rankOf[r[0]] = i + 1; });
      var html = list.map(function (r) {
        var st = statusLabel(r);
        var chains = esc(r[3]) + (r[4] ? ', ' + esc(r[4]) : '') + (r[5] > 2 ? ' +' + (r[5] - 2) : '');
        var pctCls = r[7] === null ? '' : r[7] >= 0 ? 'up' : 'down';
        return '<tr data-slug="' + esc(r[0]) + '"><td>' + rankOf[r[0]] + '</td>' +
          '<td><span class="name">' + esc(r[1]) + '</span><span class="slug">' + esc(r[0]) + '</span></td>' +
          '<td>' + esc(r[2]) + '</td><td>' + chains + '</td>' +
          '<td class="num">' + fmtUsd(r[6]) + '</td>' +
          '<td class="num ' + pctCls + '">' + fmtPct(r[7]) + '</td>' +
          '<td class="num">' + fmtAge(r[8]) + '</td>' +
          '<td><span class="pill ' + st[0] + '">' + st[1] + '</span></td>' +
          '<td class="num val">' + fmtUsd(r[9]) + '</td></tr>';
      }).join('');
      tbody.innerHTML = html;
      var pre = rows.filter(function (r) { return r[10] === 0; }).length;
      var nl = rows.filter(function (r) { return r[10] === 1; }).length;
      var lv = rows.filter(function (r) { return r[10] === 2; }).length;
      statsEl.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' rows  ·  watchlist covered ' +
        watchlist + ' of 40  ·  ' + pre + ' pre-token, ' + nl + ' not launch candidates, ' + lv + ' already trading';
      var sel = tbody.querySelector('tr.sel');
      if (sel) sel.classList.remove('sel');
    }

    function showDetail(slug) {
      var idx = -1;
      rows.forEach(function (r, i) { if (r[0] === slug) idx = i; });
      if (idx === -1) return;
      var r = rows[idx];
      var f = valueFactors(r);
      document.getElementById('dName').textContent = '#' + (idx + 1) + '  ' + r[1];
      var chains = r[3] + (r[4] ? ', ' + r[4] : '') + (r[5] > 2 ? ' +' + (r[5] - 2) + ' more' : '');
      document.getElementById('dMeta').textContent = r[2] + '  ·  ' + chains +
        '  ·  TVL ' + fmtUsd(r[6]) + '  ·  7d ' + fmtPct(r[7]) + '  ·  age ' + fmtAge(r[8]) +
        '  ·  ' + statusLabel(r)[1];
      var bh = '';
      if (f.nominal) {
        bh = '<p>Nominal marker only: TVL &times; 0.0001 = <b>' + fmtUsd(f.value) + '</b>. ' +
          'This protocol cannot launch a token of its own, so no launch value is claimed.</p>';
      } else if (f.launched) {
        bh = '<p>Token already trades. Current market cap <b>' + fmtUsd(f.mcap) + '</b>. ' +
          'The ranking value <b>' + fmtUsd(f.value) + '</b> is capped below the pre-token board ' +
          'so a launched token is never presented as the next launch.</p>';
      } else {
        bh = '<table><tr><td>TVL &times; 0.35 (base)</td><td>' + fmtUsd(f.base) + '</td></tr>' +
          '<tr><td>Momentum &times;' + f.momentum.toFixed(2) + ' (7d ' + fmtPct(r[7]) + ')</td><td>&times;' + f.momentum.toFixed(2) + '</td></tr>' +
          '<tr><td>Age &times;' + f.age.toFixed(2) + ' (' + fmtAge(r[8]) + ' listed, no token)</td><td>&times;' + f.age.toFixed(2) + '</td></tr>' +
          '<tr><td>Category &times;' + f.category.toFixed(2) + ' (' + esc(r[2]) + ')</td><td>&times;' + f.category.toFixed(2) + '</td></tr>' +
          '<tr><td><b>Implied value</b></td><td><b>' + fmtUsd(f.value) + '</b></td></tr></table>';
      }
      document.getElementById('dBreak').innerHTML = bh;
      var steps = farmSteps(r);
      document.getElementById('dSteps').innerHTML = steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      document.getElementById('dNote').textContent =
        r[10] === 0 ? 'Records no token in the snapshot. Farm it before a launch is announced, not after.' :
        r[10] === 1 ? 'Shown so the radar is honest about what it leaves out: a big TVL is not a launch.' :
        'Already launched: the farm here is using the token, not waiting for one.';
      detailEl.hidden = false;
      var tr = tbody.querySelector('tr[data-slug="' + slug + '"]');
      if (tr) tr.classList.add('sel');
      detailEl.scrollIntoView({ block: 'start' });
    }

    tbody.addEventListener('click', function (ev) {
      var tr = ev.target.closest('tr');
      if (!tr) return;
      showDetail(tr.getAttribute('data-slug'));
    });
    document.getElementById('closeDetail').addEventListener('click', function () {
      detailEl.hidden = true;
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') detailEl.hidden = true;
    });
    [qEl, catEl, statusEl, sortEl].forEach(function (el) {
      el.addEventListener('input', render);
      el.addEventListener('change', render);
    });

    // Deep links for screenshots and sharing: #detail=<slug>, #q=<text>,
    // #cat=<category>, #status=<0|1|2>.
    var hash = {};
    location.hash.slice(1).split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) hash[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    if (hash.q) qEl.value = hash.q;
    if (hash.cat) catEl.value = hash.cat;
    if (hash.status) statusEl.value = hash.status;
    render();
    if (hash.detail) showDetail(hash.detail);
  })();
}
