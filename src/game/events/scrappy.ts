import { EventCard } from './types';

/** The Scrappy-era timeline deck. Adding a card is adding one entry here. */
export const SCRAPPY_DECK: EventCard[] = [
  {
    id: 'scrappy-local-blog-mention',
    era: 'scrappy',
    kind: 'news',
    title: 'Local Blog Mention',
    flavor: 'A niche tech blog wrote 200 words about you. Someone read it.',
    effects: { deltas: [{ stat: 'hype', amount: 0.05 }] },
  },
  {
    id: 'scrappy-server-outage',
    era: 'scrappy',
    kind: 'news',
    title: 'Server Outage',
    flavor: 'Three hours down on a Tuesday. The team ran on adrenaline and cold coffee.',
    effects: { deltas: [{ stat: 'morale', amount: -6 }] },
  },
  {
    id: 'scrappy-viral-tweet',
    era: 'scrappy',
    kind: 'news',
    title: 'Viral Tweet',
    flavor: 'Someone with 40k followers tried your product and liked it out loud.',
    effects: { timedEffect: { stat: 'hype', multiplier: 1.3, weeksLeft: 3 } },
  },
  {
    id: 'scrappy-positive-press-cycle',
    era: 'scrappy',
    kind: 'news',
    title: 'Positive Press Cycle',
    flavor: 'A trade newsletter called you "one to watch." Modest, but real.',
    effects: { timedEffect: { stat: 'hype', multiplier: 1.15, weeksLeft: 2 } },
  },
  {
    id: 'scrappy-investor-interest',
    era: 'scrappy',
    kind: 'news',
    title: 'Investor Interest',
    flavor: 'An angel investor asks for a deck. Nothing signed, but it feels good.',
    effects: { deltas: [{ stat: 'hype', amount: 0.03 }] },
  },
  {
    id: 'scrappy-burnout-scare',
    era: 'scrappy',
    kind: 'news',
    title: 'Burnout Scare',
    flavor: 'Your best engineer nearly quit this week. They stayed. This time.',
    effects: { deltas: [{ stat: 'morale', amount: -10 }] },
  },
  {
    id: 'scrappy-first-big-customer',
    era: 'scrappy',
    kind: 'decision',
    title: 'First Big Customer',
    flavor: 'A mid-size company wants in — but only with a custom integration, due Friday.',
    choices: [
      {
        label: 'Take the deal, crunch the week',
        effects: {
          deltas: [
            { stat: 'marketShare', amount: 0.02 },
            { stat: 'morale', amount: -8 },
          ],
        },
      },
      {
        label: 'Decline, protect the roadmap',
        effects: { deltas: [{ stat: 'morale', amount: 3 }] },
      },
    ],
  },
  {
    id: 'scrappy-tech-debt-shortcut',
    era: 'scrappy',
    kind: 'decision',
    title: 'The Shortcut',
    flavor: 'You can ship the feature today by cutting corners, or ship it right next week.',
    choices: [
      {
        label: 'Take the shortcut: ship faster now, pay for it later',
        effects: {
          deltas: [{ stat: 'productQuality', amount: 25 }],
          timedEffect: { stat: 'productQuality', multiplier: 0.85, weeksLeft: 4 },
        },
      },
      {
        label: 'Do it right: slower, but clean',
        effects: { deltas: [{ stat: 'productQuality', amount: 10 }] },
      },
    ],
  },
  {
    id: 'scrappy-cofounder-drama',
    era: 'scrappy',
    kind: 'decision',
    title: 'Co-founder Drama',
    flavor: 'Your co-founders disagree loudly about the roadmap. The team is watching.',
    choices: [
      {
        label: 'Back the product-led plan',
        effects: {
          deltas: [
            { stat: 'productQuality', amount: 15 },
            { stat: 'morale', amount: -5 },
          ],
        },
      },
      {
        label: 'Back the growth-led plan',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.08 },
            { stat: 'morale', amount: -5 },
          ],
        },
      },
    ],
  },
  {
    id: 'scrappy-acquisition-feeler',
    era: 'scrappy',
    kind: 'decision',
    title: 'An Early Feeler',
    flavor: 'A much bigger company asks about "potential synergies." Probably nothing.',
    choices: [
      {
        label: 'Take the meeting',
        effects: { deltas: [{ stat: 'hype', amount: 0.05 }] },
      },
      {
        label: 'Politely decline, stay heads-down',
        effects: { deltas: [{ stat: 'morale', amount: 2 }] },
      },
    ],
  },
];
