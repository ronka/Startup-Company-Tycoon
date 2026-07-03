import { EventCard } from './types';

/** The Boom-era timeline deck: money is everywhere, competitors are flush, and the stakes climb. */
export const BOOM_DECK: EventCard[] = [
  {
    id: 'boom-hiring-spree',
    era: 'boom',
    kind: 'news',
    title: 'Everyone Is Hiring',
    flavor: 'Recruiters are cold-emailing your whole team. The market has never been this hot.',
    effects: { timedEffect: { stat: 'hype', multiplier: 1.2, weeksLeft: 3 } },
  },
  {
    id: 'boom-cofounder-drama-part-two',
    era: 'boom',
    kind: 'decision',
    title: 'Co-founder Drama, Part Two',
    flavor:
      "The product-led bet from your Scrappy days is paying off, but your growth-minded co-founder still isn't over it.",
    requiresFlag: 'cofounder-product-led',
    choices: [
      {
        label: 'Bring them onto the roadmap process',
        effects: { deltas: [{ stat: 'morale', amount: 6 }] },
      },
      {
        label: "Stay the course, it's working",
        effects: {
          deltas: [
            { stat: 'productQuality', amount: 10 },
            { stat: 'morale', amount: -4 },
          ],
        },
      },
    ],
  },
  {
    id: 'boom-demanding-customer-returns',
    era: 'boom',
    kind: 'decision',
    title: 'That First Customer, All Grown Up',
    flavor:
      'The customer you crunched for back in the Scrappy days is now demanding a dedicated support line as the price of renewal.',
    requiresFlag: 'crunched-for-first-customer',
    choices: [
      {
        label: 'Staff a dedicated support line',
        effects: {
          deltas: [
            { stat: 'cash', amount: -25_000 },
            { stat: 'marketShare', amount: 0.01 },
          ],
        },
      },
      {
        label: 'Politely decline the extra scope',
        effects: {
          deltas: [
            { stat: 'morale', amount: 3 },
            { stat: 'marketShare', amount: -0.01 },
          ],
        },
      },
    ],
  },
  {
    id: 'boom-acquisition-offer-serious',
    era: 'boom',
    kind: 'decision',
    title: 'A Serious Offer',
    flavor: 'A public company wants to buy you outright, at a real number, with real term sheets attached.',
    choices: [
      {
        label: 'Decline, keep building',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.06 },
            { stat: 'morale', amount: -3 },
          ],
        },
      },
      {
        label: 'Accept — take the exit',
        effects: { acquisitionOffer: { valuationMultiplier: 2.5 } },
      },
    ],
  },
  {
    id: 'boom-rival-megaround',
    era: 'boom',
    kind: 'news',
    title: "A Rival's Monster Round",
    flavor: 'A competitor announces a nine-figure raise. Every headline this week is about them, not you.',
    effects: { deltas: [{ stat: 'hype', amount: -0.05 }] },
  },
  {
    id: 'boom-talent-poaching-war',
    era: 'boom',
    kind: 'decision',
    title: 'Talent Poaching War',
    flavor: 'A flush competitor offers your best engineer a package you can barely believe.',
    choices: [
      {
        label: 'Counter with a raise',
        effects: {
          deltas: [
            { stat: 'cash', amount: -20_000 },
            { stat: 'morale', amount: 4 },
          ],
        },
      },
      {
        label: 'Let them walk',
        effects: {
          deltas: [
            { stat: 'productQuality', amount: -10 },
            { stat: 'morale', amount: -6 },
          ],
        },
      },
    ],
  },
  {
    id: 'boom-hype-cycle-feature',
    era: 'boom',
    kind: 'news',
    title: 'Cover Story',
    flavor: 'A major tech publication puts you on the cover of its "companies to watch" issue.',
    effects: { timedEffect: { stat: 'hype', multiplier: 1.25, weeksLeft: 3 } },
  },
  {
    id: 'boom-conference-keynote',
    era: 'boom',
    kind: 'decision',
    title: 'The Keynote Invite',
    flavor: 'You are invited to keynote the industry\'s biggest conference of the year.',
    choices: [
      {
        label: 'Accept, put the founder on stage',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.1 },
            { stat: 'morale', amount: -4 },
          ],
        },
      },
      {
        label: 'Decline, stay heads-down',
        effects: { deltas: [{ stat: 'morale', amount: 3 }] },
      },
    ],
  },
  {
    id: 'boom-copycat-launches',
    era: 'boom',
    kind: 'news',
    title: 'The Copycat Launches',
    flavor: 'A well-funded clone of your product launches this week, pixel-for-pixel familiar.',
    effects: { deltas: [{ stat: 'marketShare', amount: -0.01 }] },
  },
  {
    id: 'boom-viral-backlash',
    era: 'boom',
    kind: 'decision',
    title: 'Viral Backlash',
    flavor: 'A screenshot of an old internal joke goes viral for all the wrong reasons.',
    choices: [
      {
        label: 'Fight back publicly',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.08 },
            { stat: 'morale', amount: -6 },
          ],
        },
      },
      {
        label: 'Take the high road, stay quiet',
        effects: {
          deltas: [
            { stat: 'morale', amount: 4 },
            { stat: 'hype', amount: -0.04 },
          ],
        },
      },
    ],
  },
  {
    id: 'boom-acquihire-rumor',
    era: 'boom',
    kind: 'news',
    title: 'Acquihire Rumor',
    flavor: 'A blog floats you as a rumored acquisition target. You never confirm or deny.',
    effects: { deltas: [{ stat: 'hype', amount: 0.03 }] },
  },
  {
    id: 'boom-board-seat-request',
    era: 'boom',
    kind: 'decision',
    title: 'The Board Seat',
    flavor: 'A prominent investor will only write the check if they get a board seat.',
    choices: [
      {
        label: 'Grant the board seat',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.05 },
            { stat: 'morale', amount: -3 },
          ],
        },
      },
      {
        label: 'Decline, stay independent',
        effects: { deltas: [{ stat: 'morale', amount: 3 }] },
      },
    ],
  },
  {
    id: 'boom-chase-the-round',
    era: 'boom',
    kind: 'decision',
    title: "Everyone's Raising",
    flavor: 'Every founder you know is closing a bigger round than the last. It is tempting to spend like they did.',
    choices: [
      {
        label: 'Chase the hype, spend on growth marketing',
        effects: {
          deltas: [
            { stat: 'hype', amount: 0.1 },
            { stat: 'cash', amount: -15_000 },
          ],
        },
      },
      {
        label: 'Stay disciplined',
        effects: { deltas: [{ stat: 'morale', amount: 2 }] },
      },
    ],
  },
];
