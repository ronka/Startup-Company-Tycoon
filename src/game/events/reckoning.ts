import { EventCard } from './types';

/** The Reckoning-era timeline deck: cheap capital dries up, and weak players get culled. */
export const RECKONING_DECK: EventCard[] = [
  {
    id: 'reckoning-down-round-rumors',
    era: 'reckoning',
    kind: 'news',
    title: 'Down-Round Rumors',
    flavor: 'Word gets around that a competitor just raised at half their last valuation. Investors go quiet.',
    effects: { deltas: [{ stat: 'morale', amount: -4 }] },
  },
  {
    id: 'reckoning-regret-the-decline',
    era: 'reckoning',
    kind: 'decision',
    title: 'Second Thoughts',
    flavor: 'Remember that early acquisition offer you turned down? An investor brings it up, unprompted, at exactly the wrong moment.',
    requiresFlag: 'declined-early-acquisition',
    choices: [
      {
        label: 'No regrets, keep building',
        effects: { deltas: [{ stat: 'morale', amount: 4 }] },
      },
      {
        label: 'Quietly wonder if you made a mistake',
        effects: { deltas: [{ stat: 'morale', amount: -5 }] },
      },
    ],
  },
  {
    id: 'reckoning-down-round-offer',
    era: 'reckoning',
    kind: 'decision',
    title: 'The Only Term Sheet',
    flavor: "It's 40% below your last valuation, with control provisions attached. It's also the only offer on the table.",
    choices: [
      {
        label: 'Take the humiliating down round',
        effects: {
          deltas: [
            { stat: 'cash', amount: 60_000 },
            { stat: 'morale', amount: -12 },
          ],
        },
      },
      {
        label: 'Refuse, ride out the runway you have',
        effects: {
          deltas: [
            { stat: 'morale', amount: 5 },
            { stat: 'hype', amount: -0.05 },
          ],
        },
      },
    ],
  },
  {
    id: 'reckoning-layoff-dilemma',
    era: 'reckoning',
    kind: 'decision',
    title: 'The Board Wants Cuts',
    flavor: 'The board is pushing hard for a 20% headcount reduction to stretch the runway.',
    choices: [
      {
        label: 'Lay off 20% of the team',
        effects: {
          deltas: [
            { stat: 'cash', amount: 30_000 },
            { stat: 'morale', amount: -15 },
          ],
        },
      },
      {
        label: 'Hold the line, protect the team',
        effects: {
          deltas: [
            { stat: 'cash', amount: -15_000 },
            { stat: 'morale', amount: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'reckoning-acquirer-vulture',
    era: 'reckoning',
    kind: 'decision',
    title: 'The Vulture',
    flavor: 'A distressed-asset buyer circles, offering a lowball price and a fast, quiet close.',
    choices: [
      {
        label: 'Refuse, keep fighting',
        effects: {
          deltas: [
            { stat: 'morale', amount: 3 },
            { stat: 'hype', amount: -0.03 },
          ],
        },
      },
      {
        label: 'Take the vulture deal, cut your losses',
        effects: { acquisitionOffer: { valuationMultiplier: 0.7 } },
      },
    ],
  },
  {
    id: 'reckoning-morale-crisis',
    era: 'reckoning',
    kind: 'news',
    title: 'Slack Goes Quiet',
    flavor: 'Rumors of more cuts spread through the company Slack faster than any announcement could.',
    effects: { deltas: [{ stat: 'morale', amount: -8 }] },
  },
  {
    id: 'reckoning-key-hire-leaves',
    era: 'reckoning',
    kind: 'news',
    title: 'A Key Hire Jumps Ship',
    flavor: 'One of your best people takes a "safer" offer at a bigger, boring company.',
    effects: { deltas: [{ stat: 'morale', amount: -6 }] },
  },
  {
    id: 'reckoning-press-pile-on',
    era: 'reckoning',
    kind: 'news',
    title: 'Zombie Startup',
    flavor: 'A trade publication runs a piece asking whether you\'re already a "zombie startup."',
    effects: { deltas: [{ stat: 'hype', amount: -0.06 }] },
  },
  {
    id: 'reckoning-frugal-pivot',
    era: 'reckoning',
    kind: 'decision',
    title: 'The Frugal Pivot',
    flavor: 'You could cut a vendor contract and simplify the product to stretch runway, or keep the full vision alive.',
    choices: [
      {
        label: 'Pivot to a leaner model',
        effects: {
          deltas: [
            { stat: 'productQuality', amount: -10 },
            { stat: 'cash', amount: 20_000 },
          ],
        },
      },
      {
        label: 'Stay the course, trust the roadmap',
        effects: {
          deltas: [
            { stat: 'cash', amount: -10_000 },
            { stat: 'morale', amount: 3 },
          ],
        },
      },
    ],
  },
  {
    id: 'reckoning-flight-to-safety',
    era: 'reckoning',
    kind: 'news',
    title: 'Flight to Safety',
    flavor: 'Customers start migrating to the biggest, most established player, "just to be safe."',
    effects: { deltas: [{ stat: 'marketShare', amount: -0.01 }] },
  },
  {
    id: 'reckoning-scrappy-comeback',
    era: 'reckoning',
    kind: 'decision',
    title: 'The Comeback Story',
    flavor: 'A journalist offers to write you up as the scrappy survivor bucking the downturn.',
    choices: [
      {
        label: 'Lean into the comeback story',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.08 },
            { stat: 'morale', amount: -3 },
          ],
        },
      },
      {
        label: 'Stay quiet, keep heads down',
        effects: { deltas: [{ stat: 'morale', amount: 2 }] },
      },
    ],
  },
];
