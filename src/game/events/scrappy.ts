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
          setsFlag: 'crunched-for-first-customer',
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
          setsFlag: 'cofounder-product-led',
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
    flavor:
      'A much bigger company floats a number "just to see if you\'d bite." It\'s real, and it\'s a lowball.',
    choices: [
      {
        label: 'Decline, stay heads-down',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.05 },
            { stat: 'morale', amount: -2 },
          ],
          setsFlag: 'declined-early-acquisition',
        },
      },
      {
        label: 'Accept — take the exit',
        effects: { acquisitionOffer: { valuationMultiplier: 1.2 } },
      },
    ],
  },
  {
    id: 'scrappy-hater-review',
    era: 'scrappy',
    kind: 'news',
    title: 'The First Hater',
    flavor: 'A one-star review calls you "overhyped and underbuilt." It stings more than it should.',
    effects: { deltas: [{ stat: 'hype', amount: -0.04 }] },
  },
  {
    id: 'scrappy-support-ticket-avalanche',
    era: 'scrappy',
    kind: 'news',
    title: 'Support Ticket Avalanche',
    flavor: 'A batch of new signups all hit the same rough edge at once. Support is drowning.',
    effects: { deltas: [{ stat: 'morale', amount: -5 }] },
  },
  {
    id: 'scrappy-recruiting-raid',
    era: 'scrappy',
    kind: 'news',
    title: 'Recruiting Raid',
    flavor: 'A better-funded competitor takes one of your engineers to lunch. Everyone knows why.',
    effects: { deltas: [{ stat: 'morale', amount: -4 }] },
  },
  {
    id: 'scrappy-pricing-pressure',
    era: 'scrappy',
    kind: 'decision',
    title: 'Pricing Pressure',
    flavor: 'A prospect says they will only sign at a steep discount. It is a real deal, if you want it that way.',
    choices: [
      {
        label: 'Cut the price to win the deal',
        effects: {
          deltas: [
            { stat: 'marketShare', amount: 0.02 },
            { stat: 'cash', amount: -10_000 },
          ],
        },
      },
      {
        label: 'Hold firm on price',
        effects: {
          deltas: [
            { stat: 'cash', amount: 5_000 },
            { stat: 'marketShare', amount: -0.015 },
          ],
        },
      },
    ],
  },
  {
    id: 'scrappy-crunch-or-coast',
    era: 'scrappy',
    kind: 'decision',
    title: 'Crunch or Coast',
    flavor: 'The launch date is tight. You can hit it by pushing hard, or slip it to protect the team.',
    choices: [
      {
        label: 'Crunch through the deadline',
        effects: {
          deltas: [
            { stat: 'productQuality', amount: 20 },
            { stat: 'morale', amount: -10 },
          ],
        },
      },
      {
        label: 'Slip the date, protect the team',
        effects: {
          deltas: [
            { stat: 'morale', amount: 8 },
            { stat: 'hype', amount: -0.05 },
          ],
        },
      },
    ],
  },
];
