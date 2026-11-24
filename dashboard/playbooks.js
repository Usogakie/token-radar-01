// Token Launch Radar — farm-playbook library.
//
// One source of truth for the farm plans: main.ts reads this file at build
// time to write board.json, and the dashboard reads it at render time to
// show the same plans. A plan is never copied from anywhere else.
//
// Placeholders in every step, filled from the protocol's own facts:
//   {name}  the protocol's name            {chain}   its first chain
//   {chain2} its second chain (or its first chain again when it has one)
//   {stake} a capital tier for this row, $250 / $500 / $1,000 by TVL band
//   {cat}   the protocol's category        {tvl}     its TVL, formatted
//
// Every step names a concrete action, what it costs and how long it takes.
// Nothing here is a slogan: a step you cannot do is a step that does not
// belong on this board.

globalThis.RADAR_PLAYBOOKS = {
  map: {
    Dexs: 'dexs',
    Lending: 'lending',
    'Uncollateralized Lending': 'lending',
    Derivatives: 'perps',
    Options: 'perps',
    'Options Vault': 'perps',
    'Interest Rate Derivatives': 'perps',
    Synthetics: 'perps',
    'Prediction Market': 'perps',
    Yield: 'yield',
    'Yield Aggregator': 'yield',
    Farm: 'yield',
    'Leveraged Farming': 'yield',
    'Liquidity Manager': 'yield',
    RWA: 'rwa',
    'Risk Curators': 'curators',
    'Collateral Management': 'curators',
    'Collateral Markets': 'curators',
    'Onchain Capital Allocator': 'allocator',
    'Basis Trading': 'basis',
    CDP: 'cdp',
    'CDP Manager': 'cdp',
    'Algo-Stables': 'cdp',
    'Dual-Token Stablecoin': 'cdp',
    'Stablecoin Issuer': 'cdp',
    'Reserve Currency': 'cdp',
    'Staking Pool': 'restaking',
    Restaking: 'restaking',
    'Anchor BTC': 'restaking',
    'Decentralized BTC': 'restaking',
    Chain: 'chain',
    CeDeFi: 'cefi',
    'Crypto Card Issuer': 'cefi',
    Insurance: 'insurance',
    Payments: 'payments',
    'Stablecoin Wrapper': 'wrapper',
    'Governance Incentives': 'gov',
  },
  books: {
    dexs: {
      label: 'Decentralised exchange',
      steps: [
        'Open {name} on {chain} and connect a fresh wallet used only for farming; fund it with about {stake} in USDC on {chain} so swaps stay cheap.',
        'Swap half the USDC into the chain gas token, then provide liquidity in the {name} pool with the highest 7-day volume; keep the position for at least 4 weeks.',
        'Route one swap a week through {name} instead of an aggregator, $50-$200 each time, so your address shows repeated real usage, not a single deposit.',
        'If {name} runs a points or volume program, opt in before your first trade and screenshot the dashboard weekly; points snapshots usually reward early, steady users.',
        'Watch the pool fee APR every Sunday; if it falls below 5% for two weeks running, move half the liquidity to the next-best pool on {chain}.',
        'Never leave the full {stake} in one pool: split it across two pools on {name} so an exploit or a depeg in one cannot take everything.',
      ],
    },
    lending: {
      label: 'Lending market',
      steps: [
        'Supply about {stake} of USDC or ETH to {name} on {chain}; supplying earns the base yield and usually counts double in points programs versus borrowing.',
        'Borrow no more than 30% of your collateral value, in a stablecoin, and use it only to loop back into supply; keep your health factor above 2.0 at all times.',
        'Hold the supply position for at least 6 weeks; airdrop snapshots for lenders have historically favoured wallets active across several months, not days.',
        'Repay the loop and withdraw in stages over 3-4 days if {name} announces a token; exiting in one transaction has coincided with snapshot cutoffs before.',
        'Check {name} borrow rates every week; if the stablecoin borrow APR rises above the supply APY by more than 4 points, unwind the loop and sit in supply only.',
      ],
    },
    perps: {
      label: 'Perpetuals / derivatives',
      steps: [
        'Deposit about {stake} of USDC as margin on {name} on {chain}; use cross margin and keep leverage at 2x or below so a wick cannot liquidate you.',
        'Place 2-3 small trades a week, $100-$300 notional each, on the most liquid market; volume, not size, is what perps programs usually count.',
        'Hold at least one position open across each weekly snapshot (usually Sunday 00:00 UTC) so your address registers as an active trader that week.',
        'Set a stop-loss 5-8% from entry on every trade and close positions within 48 hours; farming a perps venue should not become a directional bet.',
        'If {name} runs maker rebates, post one limit order a week near the mid-price instead of market orders; maker volume often earns more points per dollar.',
      ],
    },
    yield: {
      label: 'Yield vault',
      steps: [
        'Deposit about {stake} into the {name} vault with the most TVL on {chain}; vaults with the most TVL are the ones snapshots almost always include.',
        'Leave the deposit untouched for at least 8 weeks; yield vaults reward duration, and early withdrawals have historically reset loyalty multipliers.',
        'Claim or compound the yield once a month, not daily, so gas on {chain} does not eat the return; a $5 claim on a $500 position is a loss.',
        'Compare the {name} vault APY with two similar vaults every fortnight; move only if the gap exceeds 3 points for two checks in a row.',
        'Keep a record of every deposit hash and date; if {name} asks for proof of early use, a dated trail beats a screenshot taken after the announcement.',
      ],
    },
    rwa: {
      label: 'Real-world assets',
      steps: [
        'Buy about {stake} of the {name} tokenised asset on {chain} through its primary market or a listed venue; hold it in the wallet you want the airdrop to land in.',
        'If {name} offers a lock or a vault for the asset, lock half the position for 30-90 days; locked balances have carried the largest weight in RWA distributions.',
        'Read the {name} asset reports each month and check the underlying collateral is still fully backed; an RWA token is only as good as its off-chain backing.',
        'Avoid selling the full position before a token announcement; RWA programs typically snapshot holders, and a zero balance on snapshot day earns nothing.',
        'Set a calendar reminder for the asset maturity or redemption window so you can exit cleanly instead of discovering the lock expired months later.',
      ],
    },
    curators: {
      label: 'Risk curator vault',
      steps: [
        'Deposit about {stake} into a {name} curated vault on {chain}; pick the vault with the longest track record, not the highest advertised APY.',
        'Read the vault curator strategy note before depositing and confirm which markets it lends into; a curator you cannot explain is a risk you cannot price.',
        'Hold the position for at least 2 months; curator vaults compound slowly and their points programs weight time-in-vault heavily.',
        'Check the vault utilisation and bad-debt disclosures monthly; if utilisation stays above 90% for weeks, the yield is being paid by risk, not fees.',
        'Split the {stake} across two {name} vaults with different curators so one curator mistake does not take the whole position.',
      ],
    },
    allocator: {
      label: 'On-chain capital allocator',
      steps: [
        'Allocate about {stake} to {name} on {chain} through its vault or allocation product; choose the allocation with the clearest mandate you can read in one page.',
        'Track the allocation reported returns weekly against a plain lending rate; if it trails by more than 2 points for a month, the complexity is not paying.',
        'Stay allocated for a full quarter; allocators rebalance slowly and their snapshot logic has favoured wallets present across a whole epoch.',
        'Withdraw in two tranches a week apart when you exit, and keep the transaction hashes; allocator programs have asked for deposit proof before.',
        'Never allocate more than a third of your farming capital to one allocator; concentration in a single manager is the risk the product is meant to remove.',
      ],
    },
    basis: {
      label: 'Basis trading',
      steps: [
        'Deposit about {stake} of USDC into the {name} basis strategy on {chain}; the strategy earns the funding-rate spread, so it pays best when perps funding is positive.',
        'Hold for at least 6 weeks and check the funding rate weekly; if funding turns negative for two weeks, the strategy is paying to hold and you should pause deposits.',
        'Do not use leverage on a basis position; the whole point is a market-neutral return, and leverage reintroduces the directional risk it removes.',
        'Compare the {name} realised APY with the 30-day average funding rate each month; a gap wider than 5 points means fees are eating the edge.',
        'Exit in stages if {name} announces a token; basis vaults have snapshotted balances weekly, so a balance held through the announcement week counts most.',
      ],
    },
    cdp: {
      label: 'CDP / stablecoin',
      steps: [
        'Lock about {stake} of ETH or another accepted collateral in {name} on {chain} and mint its stablecoin up to a 150% collateral ratio - never below 130%.',
        'Use the minted stablecoin to supply a lending market or hold it in the {name} savings module; idle minted stablecoins earn nothing and still carry liquidation risk.',
        'Top up collateral or repay debt the same day ETH falls 10%; CDP liquidations happen fast and the penalty is usually 10-13% of the position.',
        'Keep the vault open for at least 2 months; stablecoin protocols have weighted early minters and long-lived vaults most heavily.',
        'Check the {name} stability fee weekly; if it rises above 8% a year, repay half the debt and wait - a high fee turns a farm into a loan you regret.',
      ],
    },
    restaking: {
      label: 'Restaking',
      steps: [
        'Restake about {stake} of ETH or a liquid staking token through {name} on {chain}; restaking adds slashing risk, so never restake your whole ETH stack.',
        'Delegate to two or more operators with different clients and regions; a single operator failure should not slash your full position.',
        'Hold the restaked position for at least 3 months; restaking points accrue per epoch and short stays have earned little in every program so far.',
        'Monitor {name} slashing events and operator performance monthly; if an operator is slashed once, move your delegation within a week.',
        'Keep 10-20% of your ETH unstaked and liquid; restaked ETH cannot be withdrawn instantly, and you want dry powder if the market moves.',
      ],
    },
    chain: {
      label: 'Chain / network',
      steps: [
        'Bridge about {stake} of USDC to {chain} and use it across at least three different apps on the chain; chain programs reward breadth of use, not one big deposit.',
        'Make one real transaction a week on {chain} - a swap, a lend, a mint - for at least 8 weeks; steady weekly activity beats a single weekend of farming.',
        'Hold a small balance of the chain gas token at all times so you are never stuck unable to transact when a snapshot or claim opens.',
        'Try the {name} flagship app first, then two smaller native apps; the flagship proves the chain works, the smaller ones are where early-user multipliers hide.',
        'Record every bridge and transaction hash with dates; if {name} later asks for proof of early activity, a dated list is the evidence that counts.',
      ],
    },
    cefi: {
      label: 'Centralised finance',
      steps: [
        'Create an account with {name}, finish identity verification, and deposit about {stake} from a bank or card; keep the account in your own name throughout.',
        'Use the {name} earn or staking product for at least 30 days rather than leaving the balance idle; idle balances have rarely qualified for anything.',
        'Make one trade or transfer a week inside {name} so the account shows genuine use; a single deposit followed by silence looks like a placeholder.',
        'Withdraw a small test amount first to confirm the payout path works, then keep the rest allocated; a withdrawal that fails at claim time is a familiar disaster.',
        'Check {name} terms monthly; centralised products can change reward rules or freeze withdrawals, and the announcement is usually buried in an email.',
      ],
    },
    insurance: {
      label: 'Insurance',
      steps: [
        'Buy cover for about {stake} of your largest DeFi position through {name} on {chain}; cover the protocol you actually use, not a random one.',
        'Hold the cover for the full policy term (usually 30-90 days) and renew once; short cover bought just before an announcement has rarely counted.',
        'Read the policy exclusions before paying; most DeFi cover excludes governance attacks and oracle failures, which are the risks people assume it covers.',
        'File a test claim inquiry with {name} support so you know the process works before you ever need it in a real exploit.',
        'Keep the premium under 2% of the covered amount per month; above that, self-insuring by diversifying is usually the cheaper risk management.',
      ],
    },
    payments: {
      label: 'Payments',
      steps: [
        'Spend about {stake} through {name} on {chain} over a month - real purchases, not wash transfers to yourself; payment programs count genuine merchant volume.',
        'Use {name} weekly for at least 8 weeks; a single large payment looks like a test, while steady weekly spend looks like a user.',
        'Link the payment method to the wallet you want credited and keep the same address for the whole period; changing addresses mid-program splits your history.',
        'Keep receipts for the three largest payments; if {name} ever disputes volume, dated merchant receipts settle it in your favour.',
        'Check the {name} fee schedule monthly; payment rails quietly raise fees, and a 1% fee on $1,000 of volume is $10 a month you could keep.',
      ],
    },
    wrapper: {
      label: 'Stablecoin wrapper',
      steps: [
        'Wrap about {stake} of the underlying stablecoin through {name} on {chain}; wrapping is usually free or near-free, so do it in one transaction.',
        'Use the wrapped token in a lending market or liquidity pool for at least a month; a wrapped token sitting idle in a wallet earns nothing.',
        'Check the peg weekly; if the wrapped token trades more than 0.5% off its underlying for a week, unwrap and wait - the wrapper backing is being questioned.',
        'Hold the wrapped position through at least one monthly snapshot; wrapper programs have rewarded holders, not flippers.',
        'Unwrap in one transaction when you exit and verify you receive the full underlying amount before moving on.',
      ],
    },
    gov: {
      label: 'Governance incentives',
      steps: [
        'Hold about {stake} of the governance asset {name} incentivises on {chain} and delegate your voting power to an active delegate, or vote yourself.',
        'Vote on at least two proposals a month; governance programs weight wallets that actually vote, not wallets that merely hold.',
        'Read each proposal forum thread before voting; a vote cast without reading is how treasuries get drained by proposals nobody understood.',
        'Keep your delegation active for a full quarter; delegates and programs both snapshot voting power over time, not on a single day.',
        'Claim any voting rewards weekly and restake them; unclaimed rewards have expired in several programs without notice.',
      ],
    },
    generic: {
      label: 'General DeFi',
      steps: [
        'Use {name} on {chain} with about {stake} for at least a month; do one real action a week - a deposit, a swap, a stake - so the wallet shows steady use.',
        'Read the {name} docs once before your first transaction so you know what the protocol actually does; farming something you cannot explain is how funds get stuck.',
        'Keep the position for 6-8 weeks and record every transaction hash with its date; dated proof beats memory if a program ever asks.',
        'Check {name} fees and risks weekly; if the cost of using it exceeds the yield it pays, stop and move the capital to a better row on this board.',
        'Exit in stages over a few days if {name} announces a token; a balance held through the announcement week is the one snapshots usually capture.',
      ],
    },
    launched: {
      label: 'Token already trades',
      steps: [
        'The token already trades, so there is no pre-launch farm: buy the {name} token on {chain} only if you want the exposure, about {stake} at most, and never on leverage.',
        'Stake the token through the {name} staking module or a reputable liquid staking option for at least a month to earn the base yield.',
        'Vote in {name} governance once a month; active voters have received retroactive rewards in several launched protocols.',
        'Provide liquidity in the token deepest pool on {chain} with no more than a third of your position; impermanent loss is real and the pool fees must beat it.',
        'Set a price alert 20% below your entry and decide your exit in advance; a launched token needs an exit plan, not a farming plan.',
      ],
    },
    notlaunch: {
      label: 'Not a launch candidate',
      steps: [
        '{name} is a {cat} product, not a protocol that can issue its own token: do not farm it expecting a launch - any time here is time away from real launches.',
        'If you already use {name} on {chain}, keep using it normally; genuine use is the only thing that could ever matter, and it costs you nothing extra.',
        'Do not lock funds in {name} for longer than you need for its actual service; locked capital in a non-launch product earns no airdrop.',
        'Check {name} announcements once a month; if it ever spins out a separate tokenised product, that is a new subject, not this one.',
        'Move the {stake} you would have spent here to the top-ranked pre-token rows on this board instead; that is where the launch value sits.',
      ],
    },
  },
};
