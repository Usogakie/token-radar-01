// Token Radar dashboard for model radar-2. main.ts writes the snapshot to data.js beside
// dashboard/; this script reads it off window.RADAR and builds the ranked board, the
// filterable table and the detail drawer for one protocol, showing the model's inputs, the
// category comparables and a farm plan for the row. It fetches nothing: everything on the
// page is already in data.js, and each row is recomputed from the snapshot figures so the
// page and board.json can be seen to agree with each other.
(() => {
  'use strict';

  const SNAP = window.RADAR;
  if (!SNAP) return;
  const mount = document.getElementById('board');
  const view = {
    query: '',
    cat: 'all',
    chainFilter: 'all',
    onlyWatch: false,
    pane: 'pre-token',
    sortKey: 'implied',
    sortDir: -1,
    picked: null,
  };

  const moneyFmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  // Short money: $12.34B, $5.6M, $78K, or the plain formatted amount below a thousand.
  const money = (n) => {
    if (n == null || !isFinite(n)) return 'n/a';
    const size = Math.abs(n);
    if (size >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (size >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (size >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return moneyFmt.format(n);
  };

  const pct = (n) => {
    if (n == null || !isFinite(n)) return 'n/a';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const ageLabel = (days) => {
    if (days == null) return 'unknown';
    if (days >= 365) return `${(days / 365).toFixed(1)}y`;
    return `${Math.max(0, Math.round(days))}d`;
  };

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  // The model, in one place: a peer multiple times TVL, then growth, maturity, chain breadth.
  // model radar-2: implied = round(tvl x peerMultiple x growthMult x maturity x breadth).
  const impliedValue = (row, model) => {
    const growth = clamp(row.change_7d ?? 0, model.growth_floor, model.growth_cap);
    const growthMult = 1 + (growth / 100) * model.growth_weight;
    const age = row.age_days ?? model.unknown_age_days;
    const maturity = model.maturity_floor
      + (clamp(age, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
    const chains = (row.chains || []).length;
    const breadth = 1 + model.breadth_per_chain * Math.min(Math.max(chains - 1, 0), model.breadth_max_chains);
    const base = row.tvl_usd * row.category_multiple;
    const grown = base * growthMult;
    const matured = grown * maturity;
    return Math.max(1, Math.round(matured * breadth));
  };

  // Tiny element builder: attrs map to attributes, except class/text/html and on* handlers.
  const node = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value);
      }
    }
    const push = (child) => {
      if (child == null) return;
      if (Array.isArray(child)) child.forEach(push);
      else if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else el.appendChild(child);
    };
    kids.forEach(push);
    return el;
  };

  // The farm plan derives from the same figures main.ts writes to board.json: the category,
  // the chains, the TVL, the age and the seven-day growth decide the action, the capital,
  // the hold and every cost and time. No protocol is special-cased by name.
  const firstChain = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');

  const stakeSize = (p) => {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  };

  const holdDays = (age) => {
    if (age == null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  };

  // One entry per shape of protocol: the first keyword set that matches the category wins.
  const PLAN_TABLE = [
    [/lend|cdp|collateral/, (name, size, chain) => `Supply $${size} of USDC to ${name} on ${chain} and keep the position open.`],
    [/dex|yield|leveraged farm/, (name, size, chain) => `Provide $${size} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`],
    [/bridge/, (name, size, chain) => `Bridge $${size} of USDC to ${chain} through ${name} and use the bridged funds in its app.`],
    [/staking|restak/, (name, size) => `Stake $${size} of the chain's staking asset through ${name} and keep the receipt.`],
    [/perpetual|derivative/, (name, size) => `Deposit $${size} of USDC as margin on ${name} and open one small hedge.`],
    [/prediction/, (name, size) => `Fund $${size} and place one market position on ${name}.`],
    [/curator|allocator|risk/, (name, size, chain) => `Deposit $${size} into a ${name} vault on ${chain} and keep the shares.`],
    [/stable/, (name, size, chain) => `Mint or deposit $${size} of the stable asset through ${name} on ${chain}.`],
    [/rwa/, (name, size, chain) => `Mint $${size} of the protocol's yield asset on ${chain} and hold it.`],
    [/insurance/, (name, size, chain) => `Buy $${size} of cover from ${name} on ${chain} and keep the policy.`],
    [/options|volatility/, (name, size, chain) => `Deposit $${size} of USDC into ${name}'s vault on ${chain} and keep the position open.`],
  ];

  const planAction = (p, size, chain) => {
    const kind = (p.category || '').toLowerCase();
    const hit = PLAN_TABLE.find(([test]) => test.test(kind));
    if (hit) return hit[1](p.name, size, chain);
    return `Deposit $${size} of USDC into ${p.name} on ${chain} and keep the position open.`;
  };

  const planLine = (step) => {
    let line = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (line.length > 600) line = `${line.slice(0, 596)}...`;
    if (line.length < 20) line += " Hold the position and check the protocol's own page.";
    return line;
  };

  const step = (text, cost, time) => ({ text, cost, time });

  const planSteps = (p) => {
    const chain = firstChain(p);
    const size = stakeSize(p);
    const hold = holdDays(p.age_days);
    const falling = (p.change_7d ?? 0) < -10;
    const half = Math.round(size / 2);
    const open = falling
      ? step(
        `TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in seven days, so start with half size: ${planAction(p, half, chain)} Check the protocol's own page for why before adding more.`,
        `$${half} of capital and about $4 of gas`,
        '15 minutes to set up',
      )
      : step(
        planAction(p, size, chain),
        `$${size} of capital and about $${size >= 150 ? 8 : 4} of gas`,
        '15 minutes to set up',
      );
    return [
      step('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'),
      open,
      step('Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'),
      step(`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, `the $${size} stays in the position`, `${hold} days`),
      step("Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'),
      step('Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes'),
    ].map(planLine);
  };

  // What to watch before farming a row: young, shrinking, single-chain, or age unknown.
  const warnings = (row) => {
    const flags = [];
    if (row.age_days != null && row.age_days < 180) flags.push('Young: listed under 180 days ago');
    if (row.age_days == null) flags.push('Age unknown: no listing date on record');
    if (row.change_7d != null && row.change_7d < -10) {
      flags.push(`Shrinking: TVL down ${Math.abs(row.change_7d).toFixed(1)}% in 7 days`);
    }
    if (!row.chains || row.chains.length <= 1) flags.push('Single chain: all of its TVL sits on one chain');
    if (row.category_peers !== undefined && row.category_peers < 2) {
      flags.push('Thin comparables: fewer than 2 live peers in its category');
    }
    return flags;
  };

  const loadHash = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) view.query = params.get('q');
    if (params.get('p')) view.picked = params.get('p');
    if (params.get('category')) view.cat = params.get('category');
    if (params.get('chain')) view.chainFilter = params.get('chain');
    if (params.get('watchlist')) view.onlyWatch = params.get('watchlist') === '1';
  };

  const saveHash = () => {
    const params = new URLSearchParams();
    if (view.query) params.set('q', view.query);
    if (view.cat !== 'all') params.set('category', view.cat);
    if (view.chainFilter !== 'all') params.set('chain', view.chainFilter);
    if (view.onlyWatch) params.set('watchlist', '1');
    if (view.picked) params.set('p', view.picked);
    const next = params.toString();
    const target = next ? `#${next}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', target);
  };

  const visibleRows = () => {
    const needle = view.query.trim().toLowerCase();
    return SNAP.rows.filter((r) => {
      if (view.onlyWatch && !r.watchlist) return false;
      if (view.cat !== 'all' && r.category !== view.cat) return false;
      if (view.chainFilter !== 'all' && !(r.chains || []).includes(view.chainFilter)) return false;
      if (!needle) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    });
  };

  const orderedRows = (list) => {
    const key = view.sortKey;
    const pick = (r) => {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
      return r.implied_value_usd;
    };
    return list.slice().sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (av < bv) return -view.sortDir;
      if (av > bv) return view.sortDir;
      if (a.slug < b.slug) return -1;
      if (a.slug > b.slug) return 1;
      return 0;
    });
  };

  const topBar = () => node('header', { class: 'top' },
    node('div', { class: 'brand' },
      node('span', { class: 'mark' }),
      node('span', { class: 'brand-name', text: 'Token Radar' })),
    node('div', { class: 'top-meta' },
      node('span', { text: `Snapshot ${SNAP.as_of}` }),
      node('span', { text: 'DefiLlama protocol index' }),
      node('span', { text: `${SNAP.model_version} model` })));

  const fact = (label, value) => node('div', { class: 'fact' },
    node('span', { text: label }),
    node('b', { text: value }));

  const intro = () => {
    const floorM = Math.round(SNAP.floor_usd / 1e6);
    return node('section', { class: 'lede' },
      node('div', null,
        node('h1', { text: `${SNAP.watchlist_size} watchlist protocols, ranked by implied value` }),
        node('p', { text: `The watchlist is the floor: every protocol with at least $${floorM}M of TVL and no token on record. The early radar adds ${SNAP.early_size} more pre-token protocols, at any TVL. Implied value is a model, not a promise: it prices each protocol like the live-token protocols in its own category.` })),
      node('div', { class: 'facts' },
        fact('Watchlist covered', `${SNAP.watchlist_size} / ${SNAP.watchlist_size}`),
        fact('Pre-token rows scored', String(SNAP.board_size)),
        fact('Early rows beyond the watchlist', String(SNAP.early_size)),
        fact('Live-token protocols set aside', String(SNAP.live_size))));
  };

  const topThree = () => {
    const cards = SNAP.rows.slice(0, 3).map((r) => node('article', {
      class: 'spot-card',
      tabindex: '0',
      onclick: () => showDetail(r.slug),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showDetail(r.slug);
        }
      },
    },
    node('span', { class: 'spot-rank', text: `#${r.rank}` }),
    node('b', { class: 'spot-name', text: r.name }),
    node('span', { class: 'sub', text: `${r.category || 'Other'} · TVL ${money(r.tvl_usd)} · ${pct(r.change_7d)} in 7d` }),
    node('span', { class: 'spot-value num', text: `${money(r.implied_value_usd)} implied` })));
    return node('section', { class: 'spot', 'aria-label': 'Top three by implied value' }, cards);
  };

  const filters = () => {
    const categories = [...new Set(SNAP.rows.map((r) => r.category || 'Other'))].sort();
    const chains = [...new Set(SNAP.rows.flatMap((r) => r.chains || []))].sort();
    const search = node('input', {
      type: 'search', id: 'q', placeholder: 'Search name, category or chain',
      value: view.query, 'aria-label': 'Search the board',
    });
    search.addEventListener('input', () => {
      view.query = search.value;
      saveHash();
      draw();
    });
    const catSelect = node('select', { id: 'category', 'aria-label': 'Filter by category' },
      node('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => node('option', {
        value: c, text: c, selected: c === view.cat ? 'selected' : null,
      })));
    catSelect.addEventListener('change', () => {
      view.cat = catSelect.value;
      saveHash();
      draw();
    });
    const chainSelect = node('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      node('option', { value: 'all', text: 'All chains' }),
      chains.map((c) => node('option', {
        value: c, text: c, selected: c === view.chainFilter ? 'selected' : null,
      })));
    chainSelect.addEventListener('change', () => {
      view.chainFilter = chainSelect.value;
      saveHash();
      draw();
    });
    const watch = node('label', { class: 'check' },
      node('input', {
        type: 'checkbox',
        checked: view.onlyWatch ? 'checked' : null,
        'aria-label': 'Watchlist only',
      }),
      node('span', { text: 'Watchlist only' }));
    watch.querySelector('input').addEventListener('change', (e) => {
      view.onlyWatch = e.target.checked;
      saveHash();
      draw();
    });
    const pre = node('button', {
      type: 'button',
      'aria-pressed': view.pane === 'pre-token' ? 'true' : 'false',
      text: 'Pre-token',
      onclick: () => { view.pane = 'pre-token'; draw(); },
    });
    const live = node('button', {
      type: 'button',
      'aria-pressed': view.pane === 'live' ? 'true' : 'false',
      text: 'Live token',
      onclick: () => { view.pane = 'live'; draw(); },
    });
    const shown = view.pane === 'pre-token'
      ? `${visibleRows().length} rows shown`
      : `${SNAP.live.length} live-token protocols`;
    return node('div', { class: 'controls' },
      node('div', { class: 'field' }, node('label', { for: 'q', text: 'Search' }), search),
      node('div', { class: 'field' }, node('label', { for: 'category', text: 'Category' }), catSelect),
      node('div', { class: 'field' }, node('label', { for: 'chain', text: 'Chain' }), chainSelect),
      node('div', { class: 'field' }, node('span', { class: 'sub', text: 'Scope' }), watch),
      node('div', { class: 'field' }, node('span', { class: 'sub', text: 'Token status' }),
        node('div', { class: 'tabs' }, pre, live)),
      node('span', { class: 'count', text: shown }));
  };

  const sortButton = (key, label) => node('th', { scope: 'col' },
    node('button', {
      type: 'button',
      onclick: () => {
        if (view.sortKey === key) view.sortDir = -view.sortDir;
        else {
          view.sortKey = key;
          view.sortDir = -1;
        }
        draw();
      },
    },
    label,
    view.sortKey === key
      ? node('span', { 'aria-hidden': 'true', text: view.sortDir < 0 ? ' v' : ' ^' })
      : null));

  const chainList = (row, limit) => {
    const names = row.chains && row.chains.length ? row.chains.slice(0, limit).join(', ') : 'an unnamed chain';
    return names;
  };

  const board = () => {
    const list = orderedRows(visibleRows());
    if (list.length === 0) {
      return node('div', { class: 'panel' }, node('div', { class: 'empty' },
        node('h2', { text: 'No protocol matches that filter' }),
        node('p', { text: 'Clear the search or pick another category to see the board again.' }),
        node('button', {
          class: 'button primary', type: 'button', text: 'Clear filters',
          onclick: () => {
            view.query = '';
            view.cat = 'all';
            view.chainFilter = 'all';
            view.onlyWatch = false;
            saveHash();
            draw();
          },
        })));
    }
    const top = list[0].implied_value_usd || 1;
    const body = node('tbody');
    list.forEach((r) => {
      const growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      const tone = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const width = Math.max(3, Math.round((r.implied_value_usd / top) * 100));
      const sub = `${r.category || 'Other'} on ${chainList(r, 2)}${r.watchlist ? ' · watchlist' : ''}`;
      const tr = node('tr', {
        'data-selected': view.picked === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => showDetail(r.slug),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showDetail(r.slug);
          }
        },
      },
      node('td', { class: 'num', text: String(r.rank) }),
      node('td', null, node('div', { class: 'name' },
        node('b', { text: r.name }),
        node('span', { class: 'sub', text: sub }))),
      node('td', { class: 'num', text: money(r.tvl_usd) }),
      node('td', { class: `num ${tone}`, text: growth }),
      node('td', { class: 'num', text: ageLabel(r.age_days) }),
      node('td', null, node('div', { class: 'implied' },
        node('div', { class: 'bar', 'aria-hidden': 'true' },
          node('i', { style: `width:${width}%` })),
        node('span', { class: 'num', text: money(r.implied_value_usd) }))),
      node('td', null, node('span', { class: 'status', text: 'no token' })));
      body.appendChild(tr);
    });
    return node('div', { class: 'panel' },
      node('div', { class: 'table-wrap' },
        node('table', null,
          node('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, comparables and farm plan.' }),
          node('thead', null, node('tr', null,
            sortButton('implied', 'Rank'),
            sortButton('name', 'Protocol'),
            sortButton('tvl', 'TVL'),
            sortButton('growth', '7d'),
            sortButton('age', 'Age'),
            sortButton('implied', 'Implied value'),
            node('th', { scope: 'col', text: 'Token' }))),
          body)));
  };

  const liveBoard = () => {
    const body = node('tbody');
    SNAP.live.forEach((r) => {
      const tone = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      body.appendChild(node('tr', null,
        node('td', { class: 'num', text: 'live' }),
        node('td', null, node('div', { class: 'name' },
          node('b', { text: r.name }),
          node('span', { class: 'sub', text: `${r.category || 'Other'} on ${chainList(r, 2)}` }))),
        node('td', { class: 'num', text: money(r.tvl_usd) }),
        node('td', { class: `num ${tone}`, text: pct(r.change_7d) }),
        node('td', { class: 'num', text: money(r.mcap_usd) }),
        node('td', null, node('span', { class: 'status', text: 'already trades' }))));
    });
    return node('div', { class: 'panel' },
      node('div', { class: 'table-wrap' },
        node('table', null,
          node('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking -- and they are the peers that price it.' }),
          node('thead', null, node('tr', null,
            node('th', { scope: 'col', text: 'Status' }),
            node('th', { scope: 'col', text: 'Protocol' }),
            node('th', { scope: 'col', text: 'TVL' }),
            node('th', { scope: 'col', text: '7d' }),
            node('th', { scope: 'col', text: 'Market cap' }),
            node('th', { scope: 'col', text: 'Token' }))),
          body)));
  };

  const modelCard = () => {
    const m = SNAP.model;
    const comps = Object.keys(SNAP.comparables || {})
      .map((k) => ({ category: k, multiple: SNAP.comparables[k].multiple, peers: SNAP.comparables[k].peers }))
      .filter((c) => c.peers >= 2)
      .sort((a, b) => b.multiple - a.multiple)
      .slice(0, 8);
    const formula = `implied = round( tvl_usd x peerMultiple x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x (${m.maturity_floor} + min(age_days, ${m.maturity_days}) / ${m.maturity_days} x ${m.maturity_range}) x (1 + ${m.breadth_per_chain} x min(chains - 1, ${m.breadth_max_chains})) )`;
    const peersNote = `peerMultiple is the median market-cap/TVL of the live-token protocols in the row's own category (at least 2 peers, clamped to ${m.multiple_floor}–${m.multiple_cap}; otherwise the global median). Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ${m.unknown_age_days} days. Wrapped, staked and bridged products of tokens that already trade are excluded from the board entirely, and the live-token protocols are set aside with their market caps shown.`;
    return node('section', { class: 'panel model' },
      node('h2', { text: 'How implied value is computed' }),
      node('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      node('div', { class: 'formula' }, formula),
      node('p', { class: 'sub', text: peersNote }),
      node('h3', { text: 'Strongest category multiples' }),
      node('div', { class: 'comps' }, comps.map((c) => node('div', { class: 'comp' },
        node('span', { text: c.category }),
        node('b', { class: 'num', text: `${c.multiple.toFixed(2)}x · ${c.peers} peers` })))));
  };

  const panel = node('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  panel.addEventListener('close', () => {
    view.picked = null;
    saveHash();
  });

  const showDetail = (slug) => {
    const row = SNAP.rows.filter((r) => r.slug === slug)[0];
    if (!row) return;
    view.picked = slug;
    saveHash();
    panel.textContent = '';
    const steps = planSteps(row);
    const comp = (SNAP.comparables || {})[row.category || 'Other'];
    const flags = warnings(row);
    const recomputed = impliedValue(row, SNAP.model);
    const matches = recomputed === row.implied_value_usd;
    const verdict = matches
      ? ', the same number board.json carries.'
      : ', which differs from the board: the data would be stale.';
    panel.appendChild(node('div', { class: 'detail-head' },
      node('div', null,
        node('span', { class: 'brand-name', text: `Rank ${row.rank} of ${SNAP.board_size}${row.watchlist ? ' · watchlist' : ' · early radar'}` }),
        node('h2', { id: 'detail-title', text: row.name }),
        node('p', { class: 'sub', text: `${row.category || 'Other'} on ${chainList(row, 99)}` })),
      node('button', {
        class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close',
        onclick: () => panel.close(),
      })));
    const figure = (label, value) => node('div', null,
      node('span', { text: label }),
      node('b', { class: 'num', text: value }));
    panel.appendChild(node('section', { class: 'detail-section' },
      node('h3', { text: 'Implied value' }),
      node('div', { class: 'equation' },
        figure('TVL', money(row.tvl_usd)),
        figure(`Peer multiple (${row.category || 'Other'})`, `${row.category_multiple.toFixed(2)}x`),
        figure('Seven-day growth', pct(row.change_7d)),
        figure('Age with no token', ageLabel(row.age_days)),
        figure('Growth multiplier', String(row.growth_multiplier)),
        figure('Maturity multiplier', String(row.maturity_multiplier)),
        figure('Chain breadth', String(row.breadth_multiplier)),
        figure('Implied value', money(row.implied_value_usd))),
      node('p', { class: 'sub', text: `Model ${SNAP.model_version}: the same function scores every protocol. The page recomputes this row as ${money(recomputed)}${verdict} This is an estimate, not a price.` })));
    if (comp) {
      const enough = comp.peers >= 2;
      const priced = enough
        ? `Priced like the ${comp.peers} live-token ${row.category || 'Other'} protocols in this snapshot, at a median ${comp.multiple.toFixed(2)}x market cap per dollar of TVL${comp.examples && comp.examples.length ? `: ${comp.examples.join(', ')}.` : '.'}`
        : `Only ${comp.peers} live-token ${row.category || 'Other'} protocol is in this snapshot, too few for a category median, so it is priced at the global median ${comp.multiple.toFixed(2)}x market cap per dollar of TVL across all live-token protocols.`;
      panel.appendChild(node('section', { class: 'detail-section' },
        node('h3', { text: `Comparables: ${row.category || 'Other'}` }),
        node('p', { class: 'sub', text: priced })));
    }
    if (flags.length > 0) {
      panel.appendChild(node('section', { class: 'detail-section' },
        node('h3', { text: 'Before you farm it' }),
        node('ul', { class: 'flags' }, flags.map((f) => node('li', { text: f })))));
    }
    panel.appendChild(node('section', { class: 'detail-section' },
      node('h3', { text: 'Farm plan' }),
      node('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return node('li', null,
          node('b', { text: action }),
          node('span', { class: 'cost', text: tail }));
      }))));
    if (typeof panel.showModal === 'function') {
      if (!panel.open) panel.showModal();
    } else {
      panel.setAttribute('open', '');
    }
  };

  const draw = () => {
    mount.textContent = '';
    const shell = node('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    if (view.pane === 'pre-token') shell.appendChild(topThree());
    shell.appendChild(filters());
    shell.appendChild(view.pane === 'pre-token' ? board() : liveBoard());
    if (view.pane === 'pre-token') shell.appendChild(modelCard());
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!panel.isConnected) mount.appendChild(panel);
    if (view.picked) showDetail(view.picked);
  };

  loadHash();
  draw();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.open) panel.close();
  });
})();
