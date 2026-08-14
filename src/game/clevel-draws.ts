/**
 * Themed hire draws — the "a whole famous team walked in" layer over the
 * existing price ladder.
 *
 * A spin still picks a {@link PerkBand} exactly as before (`rollTier` in
 * clevels.ts, weighted by company stage). On the three *company* bands the
 * banner may then land on one of these draws instead of a plain ex-employer
 * string, and both candidates are drawn from that draw's roster. Nothing here
 * touches salaries, perks or odds: a draw supplies a banner and two faces, and
 * the band it sits at supplies everything mechanical. That is the whole reason
 * this file can grow without a rebalance.
 *
 * NAMING, and how it differs from clevels.ts: the pools in clevels.ts use
 * lightly-altered parody names ('Steve Jobbz') and exclude anyone with a
 * criminal conviction. These draws deliberately use **real names verbatim**,
 * including convicted figures, because the draws are era/team jokes that only
 * land if the roster is the real roster. Both conventions are live at once, so
 * 'Steve Jobs' (here) and 'Steve Jobbz' (a clevels.ts legend) are different
 * people as far as the game is concerned.
 */

import { CLevelRole, PerkBand } from './types';

/** Which shelf of the table a draw came from. Maps to a price band via {@link TIER_BAND}. */
export type DrawTier = 'A' | 'B' | 'C' | 'historical';

/**
 * Tier → price band. The single knob for retuning how expensive a whole shelf
 * of draws is.
 *
 * Only the three *company* bands are used: on those, both candidates already
 * share one `exEmployer` (the banner), which is exactly "the team walked in".
 * `desperate` / `personal` keep their own cluster relations — your mom's friend
 * is not a themed draw — and `legend` keeps the hand-written legends, so every
 * roll invariant in clevels.ts survives untouched.
 */
export const TIER_BAND: Record<DrawTier, PerkBand> = {
  A: 'elite',
  historical: 'elite',
  B: 'mid',
  C: 'scrappy',
};

/**
 * One real person, written once and referenced by every draw they belong to —
 * Musk appears in eight draws and has exactly one flavour line.
 *
 * `roles` is which C-level seat(s) they can fill. Most people get one; a few
 * genuinely read as two (Musk is a plausible CTO *or* CMO). A draw can only be
 * offered for a seat it can field {@link MIN_MEMBERS_PER_ROLE} people for.
 */
export interface DrawPerson {
  name: string;
  roles: readonly CLevelRole[];
  flavour: string;
}

/** A draw needs this many people for a seat before it can be offered for it. Must equal `CANDIDATES_PER_ROLL`. */
export const MIN_MEMBERS_PER_ROLE = 2;

const PEOPLE: DrawPerson[] = [
  // --- PayPal Mafia -------------------------------------------------------
  { name: 'Elon Musk', roles: ['cto', 'cmo'], flavour: 'Sleeps on the factory floor. Your factory floor now.' },
  { name: 'Peter Thiel', roles: ['cfo'], flavour: 'Thinks competition is for losers. Acts on it.' },
  { name: 'Reid Hoffman', roles: ['cfo'], flavour: 'Knows someone. Knows everyone, actually.' },
  { name: 'Max Levchin', roles: ['cto'], flavour: 'Built the fraud detection before the fraud showed up.' },
  { name: 'David Sacks', roles: ['cmo'], flavour: 'Has a podcast. You will be on it.' },
  { name: 'Keith Rabois', roles: ['cfo'], flavour: 'Will tell you your org chart is wrong. It is.' },
  { name: 'Roelof Botha', roles: ['cfo'], flavour: 'Reads the cohort curves before he reads the pitch.' },

  // --- Apple, iPhone era --------------------------------------------------
  { name: 'Steve Jobs', roles: ['cmo', 'cto'], flavour: 'Will tell you the demo is not good enough. It is not.' },
  { name: 'Jony Ive', roles: ['cto'], flavour: 'Removed the button. Then removed the next one.' },
  { name: 'Tim Cook', roles: ['cfo'], flavour: 'Knows exactly how many units are on which boat.' },
  { name: 'Scott Forstall', roles: ['cto'], flavour: 'Ships the OS. Makes enemies on the way.' },
  { name: 'Tony Fadell', roles: ['cto'], flavour: 'Has shipped hardware that actually worked. Twice.' },
  { name: 'Phil Schiller', roles: ['cmo'], flavour: 'Can say "unbelievable" and make you believe it.' },
  { name: 'Eddy Cue', roles: ['cmo'], flavour: 'Closes the deals nobody thought were closeable.' },

  // --- Facebook, IPO era --------------------------------------------------
  { name: 'Mark Zuckerberg', roles: ['cto'], flavour: 'Moves fast. The broken things are your problem.' },
  { name: 'Sheryl Sandberg', roles: ['cmo', 'cfo'], flavour: 'Turned a website into an ad machine. Quietly.' },
  { name: 'Chris Cox', roles: ['cto'], flavour: 'Knows what the product is for. Reminds everyone weekly.' },
  { name: 'Mike Schroepfer', roles: ['cto'], flavour: 'Scales the thing before it falls over.' },
  { name: 'Dustin Moskovitz', roles: ['cto'], flavour: 'Left to build the tool for the work, not the work.' },
  { name: 'Andrew Bosworth', roles: ['cto'], flavour: 'Writes the memo nobody wanted written.' },

  // --- OpenAI, ChatGPT ----------------------------------------------------
  { name: 'Sam Altman', roles: ['cfo', 'cmo'], flavour: 'Raises the round before you finish the sentence.' },
  { name: 'Ilya Sutskever', roles: ['cto'], flavour: 'Feels the AGI. Will explain why, at length.' },
  { name: 'Greg Brockman', roles: ['cto'], flavour: 'Has been at the office since the office opened.' },
  { name: 'Mira Murati', roles: ['cto'], flavour: 'Ships the model and the safety memo together.' },
  { name: 'Andrej Karpathy', roles: ['cto'], flavour: 'Will rewrite it in 200 lines and post the diff.' },
  { name: 'Wojciech Zaremba', roles: ['cto'], flavour: 'Trains it, then trains it again, differently.' },

  // --- Google, rise of search ---------------------------------------------
  { name: 'Larry Page', roles: ['cto'], flavour: "Asks why it takes 200 milliseconds. It shouldn't." },
  { name: 'Sergey Brin', roles: ['cto'], flavour: 'Turns up on rollerblades with a working prototype.' },
  { name: 'Eric Schmidt', roles: ['cfo'], flavour: 'The adult supervision. Bills like it, too.' },
  { name: 'Marissa Mayer', roles: ['cmo'], flavour: 'Has an opinion about the exact shade of blue.' },
  { name: 'Susan Wojcicki', roles: ['cmo'], flavour: 'Rented out the garage. Then ran the whole thing.' },
  { name: 'Sundar Pichai', roles: ['cto'], flavour: 'Ships calmly, at a scale you cannot picture.' },

  // --- Microsoft, early empire --------------------------------------------
  { name: 'Bill Gates', roles: ['cto'], flavour: 'Read the whole codebase on one flight. Has notes.' },
  { name: 'Paul Allen', roles: ['cto'], flavour: 'Saw the microprocessor coming before it arrived.' },
  { name: 'Steve Ballmer', roles: ['cmo'], flavour: 'Developers. Developers. Developers.' },
  { name: 'Charles Simonyi', roles: ['cto'], flavour: 'Named the convention everyone still argues about.' },
  { name: 'Ray Ozzie', roles: ['cto'], flavour: 'Built collaboration software before anyone collaborated.' },

  // --- Amazon, the everything store ---------------------------------------
  { name: 'Jeff Bezos', roles: ['cfo', 'cmo'], flavour: 'Day one. It is always day one. Forever.' },
  { name: 'Andy Jassy', roles: ['cfo'], flavour: 'Turned the spare servers into the actual business.' },
  { name: 'Werner Vogels', roles: ['cto'], flavour: 'Everything fails all the time. Plans accordingly.' },
  { name: 'Jeff Wilke', roles: ['cfo'], flavour: 'Knows the cost of every box in every warehouse.' },
  { name: 'Rick Dalzell', roles: ['cto'], flavour: 'Runs the systems like a supply line. Because they are.' },

  // --- Tesla, Model S era -------------------------------------------------
  { name: 'JB Straubel', roles: ['cto'], flavour: 'Will tell you the battery pack is the whole company.' },
  { name: 'Franz von Holzhausen', roles: ['cmo'], flavour: 'Draws it once. It ships looking like the drawing.' },
  { name: 'Deepak Ahuja', roles: ['cfo'], flavour: 'Financed the impossible quarter. Repeatedly.' },

  // --- Uber, hypergrowth --------------------------------------------------
  { name: 'Travis Kalanick', roles: ['cmo'], flavour: 'Regulations are a negotiation. Everything is.' },
  { name: 'Garrett Camp', roles: ['cto'], flavour: 'Had the idea in the snow. Built it anyway.' },
  { name: 'Ryan Graves', roles: ['cfo'], flavour: 'Answered the tweet. Ran the whole operation.' },
  { name: 'Emil Michael', roles: ['cfo'], flavour: 'Closes the round and the rival in the same week.' },
  { name: 'Thuan Pham', roles: ['cto'], flavour: 'Kept it up through a growth curve nobody planned for.' },

  // --- Twitter, founding era ----------------------------------------------
  { name: 'Jack Dorsey', roles: ['cto', 'cmo'], flavour: 'Fasts, meditates, ships one product decision.' },
  { name: 'Evan Williams', roles: ['cmo'], flavour: 'Has started the publishing platform. Twice.' },
  { name: 'Biz Stone', roles: ['cmo'], flavour: 'Makes the error page charming instead of embarrassing.' },
  { name: 'Noah Glass', roles: ['cmo'], flavour: 'Named it. History did the rest without him.' },
  { name: 'Jason Goldman', roles: ['cto'], flavour: 'The roadmap exists because he wrote it down.' },

  // --- Airbnb, breakout ---------------------------------------------------
  { name: 'Brian Chesky', roles: ['cmo'], flavour: 'Designed the guest experience down to the doormat.' },
  { name: 'Joe Gebbia', roles: ['cmo'], flavour: 'Sold cereal to fund the company. It worked.' },
  { name: 'Nathan Blecharczyk', roles: ['cto'], flavour: 'Built the booking flow and the growth model.' },
  { name: 'Belinda Johnson', roles: ['cfo'], flavour: 'Talks the city out of banning you. Every city.' },
  { name: 'Laurence Tosi', roles: ['cfo'], flavour: 'Ran the numbers at the bank. Runs yours now.' },

  // --- DeepMind -----------------------------------------------------------
  { name: 'Demis Hassabis', roles: ['cto'], flavour: 'Won at the game, then solved the protein.' },
  { name: 'Shane Legg', roles: ['cto'], flavour: 'Put a date on AGI in 2011. Has barely moved it.' },
  { name: 'Mustafa Suleyman', roles: ['cmo'], flavour: 'Sells the future and the guardrails together.' },
  { name: 'David Silver', roles: ['cto'], flavour: 'Taught it to beat the world champion. Twice.' },
  { name: 'Oriol Vinyals', roles: ['cto'], flavour: 'Has an architecture for that. Published already.' },

  // --- Wiz ----------------------------------------------------------------
  { name: 'Assaf Rappaport', roles: ['cmo'], flavour: 'Sold the last one for a billion. Wants to beat it.' },
  { name: 'Ami Luttwak', roles: ['cto'], flavour: 'Finds the hole in your cloud before the attacker does.' },
  { name: 'Yinon Costica', roles: ['cmo'], flavour: 'Turns a security scan into a sales meeting.' },
  { name: 'Roy Reznik', roles: ['cto'], flavour: 'Ships the scanner everyone said could not exist.' },

  // --- monday.com ---------------------------------------------------------
  { name: 'Roy Mann', roles: ['cmo'], flavour: 'Believes the board is the product. Will prove it.' },
  { name: 'Eran Zinman', roles: ['cto'], flavour: 'Makes the workflow tool that people actually open.' },
  { name: 'Daniel Lereya', roles: ['cto'], flavour: 'Turns a feature request into a platform primitive.' },
  { name: 'Shiran Nawi', roles: ['cfo'], flavour: 'Reads the ARR chart like a weather map.' },

  // --- Lemonade -----------------------------------------------------------
  { name: 'Daniel Schreiber', roles: ['cmo'], flavour: 'Made insurance sound like a good deal. Somehow.' },
  { name: 'Shai Wininger', roles: ['cto'], flavour: 'Has built two category-defining products already.' },
  { name: 'Tim Bixby', roles: ['cfo'], flavour: 'Has taken three companies public. Knows the drill.' },
  { name: 'Maya Prosor', roles: ['cmo'], flavour: 'Turns a policy document into a brand people quote.' },

  // --- Mobileye -----------------------------------------------------------
  { name: 'Amnon Shashua', roles: ['cto'], flavour: 'Sees the whole road in a single camera. Patented it.' },
  { name: 'Ziv Aviram', roles: ['cfo'], flavour: 'Turned a research paper into a manufacturing line.' },
  { name: 'Gaby Hayon', roles: ['cto'], flavour: 'Runs the research group that keeps the lead.' },
  { name: 'Anat Heller', roles: ['cfo'], flavour: 'Closes the quarter before the quarter closes.' },

  // --- Fiverr -------------------------------------------------------------
  { name: 'Micha Kaufman', roles: ['cmo'], flavour: 'Turned freelancing into a checkout button.' },
  { name: 'Ofer Katz', roles: ['cfo'], flavour: 'Has the unit economics memorized. All of them.' },
  { name: 'Gali Arnon', roles: ['cmo'], flavour: 'Made the ad everyone argued about. On purpose.' },

  // --- Check Point --------------------------------------------------------
  { name: 'Gil Shwed', roles: ['cto'], flavour: 'Invented the firewall. Still argues about the rules.' },
  { name: 'Marius Nacht', roles: ['cfo'], flavour: 'Funded half the industry after building the first one.' },
  { name: 'Shlomo Kramer', roles: ['cto'], flavour: 'Founds a security company every few years. They work.' },

  // --- SaaS / product founders --------------------------------------------
  { name: 'Patrick Collison', roles: ['cto', 'cfo'], flavour: 'Reads more per week than your whole team.' },
  { name: 'Tobi Lütke', roles: ['cto'], flavour: 'Would rather ship the platform than the store.' },
  { name: 'Stewart Butterfield', roles: ['cmo'], flavour: 'Failed at the game, shipped the chat tool instead.' },
  { name: 'Drew Houston', roles: ['cto'], flavour: 'Built it because he forgot the USB stick.' },
  { name: 'Aaron Levie', roles: ['cmo'], flavour: 'Posts the roadmap. Ships it too.' },
  { name: 'Melanie Perkins', roles: ['cmo'], flavour: 'Made design software your aunt can use.' },
  { name: 'Dylan Field', roles: ['cto'], flavour: 'Put the design tool in the browser. Everyone moved.' },
  { name: 'Ivan Zhao', roles: ['cto'], flavour: 'Thinks documents should be Lego. Built the Lego.' },
  { name: 'Vlad Magdalin', roles: ['cto'], flavour: 'Spent a decade on the thing everyone called impossible.' },

  // --- AI ------------------------------------------------------------------
  { name: 'Dario Amodei', roles: ['cto'], flavour: 'Publishes the scaling law and the safety case together.' },
  { name: 'Aravind Srinivas', roles: ['cmo'], flavour: 'Will answer the question with a citation. Always.' },
  { name: 'Geoffrey Hinton', roles: ['cto'], flavour: 'Was right for forty years before anyone noticed.' },
  { name: 'Yann LeCun', roles: ['cto'], flavour: 'Will argue with you about it. Publicly. At length.' },
  { name: 'Yoshua Bengio', roles: ['cto'], flavour: 'Cites the paper he wrote before your company existed.' },

  // --- Crypto --------------------------------------------------------------
  { name: 'Sam Bankman-Fried', roles: ['cfo'], flavour: 'Plays the game during the board meeting.' },
  { name: 'Brian Armstrong', roles: ['cfo'], flavour: 'Took the exchange public. Kept the mission memo.' },
  { name: 'Changpeng Zhao', roles: ['cfo'], flavour: 'Runs the exchange from wherever the plane landed.' },
  { name: 'Vitalik Buterin', roles: ['cto'], flavour: 'Explains the whole protocol on a napkin. Correctly.' },
  { name: 'Anatoly Yakovenko', roles: ['cto'], flavour: 'Optimized the chain until it fell over. Then fixed it.' },
  { name: 'Do Kwon', roles: ['cfo'], flavour: 'Certain the peg holds. Extremely certain.' },

  // --- Consumer social / creator ------------------------------------------
  { name: 'Kevin Systrom', roles: ['cmo'], flavour: 'Shipped the filter that made everyone a photographer.' },
  { name: 'Evan Spiegel', roles: ['cmo'], flavour: 'Turned disappearing into a business model.' },
  { name: 'Ben Silbermann', roles: ['cmo'], flavour: 'Built the mood board that became a marketplace.' },
  { name: 'Daniel Ek', roles: ['cmo'], flavour: 'Licensed the entire catalogue. Somehow.' },
  { name: 'Emmett Shear', roles: ['cmo'], flavour: 'Streamed himself for a year to find the product.' },
  { name: 'Steve Chen', roles: ['cto'], flavour: 'Built the video site before the bandwidth existed.' },

  // --- Developer tools / infrastructure ------------------------------------
  { name: 'Guillermo Rauch', roles: ['cto'], flavour: 'Deploys on every commit. Yours too, now.' },
  { name: 'Mitchell Hashimoto', roles: ['cto'], flavour: "Wrote the tool your infra team can't live without." },
  { name: 'Nat Friedman', roles: ['cfo'], flavour: 'Buys the right company at the right moment.' },
  { name: 'Sid Sijbrandij', roles: ['cto'], flavour: 'Runs the whole company in a public handbook.' },
  { name: 'Satya Nadella', roles: ['cfo'], flavour: 'Turned the battleship. Nobody saw it turn.' },
  { name: 'Urs Hölzle', roles: ['cto'], flavour: 'Designed the datacenter, then designed the next one.' },
  { name: 'Solomon Hykes', roles: ['cto'], flavour: 'Put the app in a box. Everyone copied the box.' },
  { name: 'Jensen Huang', roles: ['cto', 'cmo'], flavour: 'Wears the jacket. Owns the decade.' },
  { name: 'Palmer Luckey', roles: ['cto'], flavour: 'Duct-taped the headset in a garage. It shipped.' },

  // --- Design / growth -----------------------------------------------------
  { name: 'Julie Zhuo', roles: ['cmo'], flavour: 'Wrote the book on making managers. Literally.' },
  { name: 'Susan Kare', roles: ['cmo'], flavour: 'Drew the icon you have clicked ten thousand times.' },
  { name: 'Andrew Chen', roles: ['cmo'], flavour: 'Has a framework for the loop. And for the leak.' },
  { name: 'Chamath Palihapitiya', roles: ['cfo'], flavour: "Will take you public via a vehicle you don't understand." },
  { name: 'Sean Ellis', roles: ['cmo'], flavour: 'Coined the term. Still runs the survey.' },
  { name: 'Elena Verna', roles: ['cmo'], flavour: 'Will tell you your growth model is actually churn.' },

  // --- Enterprise / commerce / marketplace ---------------------------------
  { name: 'Marc Benioff', roles: ['cmo'], flavour: 'Staged a protest outside his own conference. It worked.' },
  { name: 'Larry Ellison', roles: ['cmo'], flavour: 'Would rather win than be liked. Wins.' },
  { name: 'Frank Slootman', roles: ['cfo'], flavour: 'Raises the bar, then raises it again. Nobody rests.' },
  { name: 'Parker Conrad', roles: ['cto'], flavour: 'Rebuilt the whole thing after the last one blew up.' },
  { name: 'Jack Ma', roles: ['cmo'], flavour: 'Sells the dream in two languages, dances at the party.' },
  { name: 'Pierre Omidyar', roles: ['cto'], flavour: 'Built the auction site over one long weekend.' },
  { name: 'Logan Green', roles: ['cfo'], flavour: 'Made carpooling a category. Slowly, then all at once.' },
  { name: 'Tony Xu', roles: ['cfo'], flavour: 'Delivered the food and the unit economics. Eventually.' },

  // --- Israeli cyber -------------------------------------------------------
  { name: 'Tomer Weingarten', roles: ['cmo'], flavour: 'Sells the endpoint story better than the endpoint.' },
  { name: 'Udi Mokady', roles: ['cfo'], flavour: 'Made privileged access a line item in every budget.' },
  { name: 'Mickey Boodaei', roles: ['cto'], flavour: 'Founds it, sells it, founds the next one.' },

  // --- Chaos, villains, implosions -----------------------------------------
  { name: 'Elizabeth Holmes', roles: ['cmo'], flavour: 'The demo works. Please do not touch the demo.' },
  { name: 'Adam Neumann', roles: ['cmo'], flavour: "Elevating the world's consciousness. And the rent." },
  { name: 'Masayoshi Son', roles: ['cfo'], flavour: 'Will write a bigger cheque than the one you asked for.' },
  { name: 'Sebastian Thrun', roles: ['cto'], flavour: 'Shipped the self-driving car and the online degree.' },
  { name: 'Jeffrey Katzenberg', roles: ['cmo'], flavour: 'Raised $1.75B for it. It lasted six months.' },
  { name: 'Meg Whitman', roles: ['cfo'], flavour: 'Has run eBay, HP, and one very short-lived app.' },
  { name: 'Hosain Rahman', roles: ['cto'], flavour: 'The wearable was beautiful. The supply chain was not.' },

  // --- Dot-com -------------------------------------------------------------
  { name: 'Mark Cuban', roles: ['cmo'], flavour: 'Sold at the top. Will remind you about it.' },
  { name: 'Jerry Yang', roles: ['cmo'], flavour: 'Catalogued the whole internet. By hand.' },
  { name: 'Marc Andreessen', roles: ['cto'], flavour: 'Wrote the browser, then wrote the essay about it.' },
];

/** Name → person. Draws reference people by name so a person is written once. */
const BY_NAME = new Map(PEOPLE.map((p) => [p.name, p]));

/** The full registry, for tests and tooling that need to walk every person. */
export function allDrawPeople(): readonly DrawPerson[] {
  return PEOPLE;
}

/**
 * A themed roster. `members` are names into {@link PEOPLE}; `era` is folded into
 * the banner rather than stored on the candidate, so nothing new lands in a
 * persisted save.
 */
export interface ThemedDraw {
  id: string;
  label: string;
  era: string | null;
  tier: DrawTier;
  members: readonly string[];
}

const DRAWS: ThemedDraw[] = [
  // === Tier A — the teams ===================================================
  {
    id: 'paypal-mafia',
    label: 'PayPal Mafia',
    era: '2002',
    tier: 'A',
    members: ['Elon Musk', 'Peter Thiel', 'Reid Hoffman', 'Max Levchin', 'David Sacks', 'Keith Rabois', 'Roelof Botha'],
  },
  {
    id: 'apple-iphone',
    label: 'Apple — iPhone Team',
    era: '2007',
    tier: 'A',
    members: ['Steve Jobs', 'Jony Ive', 'Tim Cook', 'Scott Forstall', 'Tony Fadell', 'Phil Schiller', 'Eddy Cue'],
  },
  {
    id: 'facebook-ipo',
    label: 'Facebook — IPO',
    era: '2012',
    tier: 'A',
    members: [
      'Mark Zuckerberg',
      'Sheryl Sandberg',
      'Chris Cox',
      'Mike Schroepfer',
      'Dustin Moskovitz',
      'Andrew Bosworth',
    ],
  },
  {
    id: 'openai-chatgpt',
    label: 'OpenAI — ChatGPT',
    era: '2023',
    tier: 'A',
    members: ['Sam Altman', 'Ilya Sutskever', 'Greg Brockman', 'Mira Murati', 'Andrej Karpathy', 'Wojciech Zaremba'],
  },
  {
    id: 'google-search',
    label: 'Google — Rise of Search',
    era: '2004–08',
    tier: 'A',
    members: ['Larry Page', 'Sergey Brin', 'Eric Schmidt', 'Marissa Mayer', 'Susan Wojcicki', 'Sundar Pichai'],
  },
  {
    id: 'microsoft-empire',
    label: 'Microsoft — Early Empire',
    era: '1980s–90s',
    tier: 'A',
    members: ['Bill Gates', 'Paul Allen', 'Steve Ballmer', 'Charles Simonyi', 'Ray Ozzie'],
  },
  {
    id: 'amazon-everything-store',
    label: 'Amazon — Everything Store',
    era: '2000s',
    tier: 'A',
    members: ['Jeff Bezos', 'Andy Jassy', 'Werner Vogels', 'Jeff Wilke', 'Rick Dalzell'],
  },
  {
    id: 'tesla-model-s',
    label: 'Tesla — Model S Era',
    era: '2012',
    tier: 'A',
    members: ['Elon Musk', 'JB Straubel', 'Franz von Holzhausen', 'Deepak Ahuja'],
  },
  {
    id: 'uber-hypergrowth',
    label: 'Uber — Hypergrowth',
    era: '2014–16',
    tier: 'A',
    members: ['Travis Kalanick', 'Garrett Camp', 'Ryan Graves', 'Emil Michael', 'Thuan Pham'],
  },
  {
    id: 'twitter-founding',
    label: 'Twitter — Founding Era',
    era: '2006–10',
    tier: 'A',
    members: ['Jack Dorsey', 'Evan Williams', 'Biz Stone', 'Noah Glass', 'Jason Goldman'],
  },
  {
    id: 'airbnb-breakout',
    label: 'Airbnb — Breakout',
    era: '2010s',
    tier: 'A',
    members: ['Brian Chesky', 'Joe Gebbia', 'Nathan Blecharczyk', 'Belinda Johnson', 'Laurence Tosi'],
  },
  {
    id: 'deepmind',
    label: 'Google DeepMind',
    era: '2016–20',
    tier: 'A',
    members: ['Demis Hassabis', 'Shane Legg', 'Mustafa Suleyman', 'David Silver', 'Oriol Vinyals'],
  },
  {
    id: 'wiz',
    label: 'Wiz — Founding Team',
    era: '2020s',
    tier: 'A',
    members: ['Assaf Rappaport', 'Ami Luttwak', 'Yinon Costica', 'Roy Reznik'],
  },
  {
    id: 'monday',
    label: 'monday.com',
    era: '2010s–20s',
    tier: 'A',
    members: ['Roy Mann', 'Eran Zinman', 'Daniel Lereya', 'Shiran Nawi'],
  },
  {
    id: 'lemonade',
    label: 'Lemonade',
    era: '2015–20s',
    tier: 'A',
    members: ['Daniel Schreiber', 'Shai Wininger', 'Tim Bixby', 'Maya Prosor'],
  },
  {
    id: 'mobileye',
    label: 'Mobileye',
    era: '2000s–10s',
    tier: 'A',
    members: ['Amnon Shashua', 'Ziv Aviram', 'Gaby Hayon', 'Anat Heller'],
  },
  {
    id: 'fiverr',
    label: 'Fiverr',
    era: '2010s',
    tier: 'A',
    members: ['Micha Kaufman', 'Shai Wininger', 'Ofer Katz', 'Gali Arnon'],
  },
  {
    id: 'check-point',
    label: 'Check Point',
    era: '1990s',
    tier: 'A',
    members: ['Gil Shwed', 'Marius Nacht', 'Shlomo Kramer'],
  },

  // === Tier B — the cohorts =================================================
  {
    id: 'saas-founders',
    label: 'SaaS Founders',
    era: '2018',
    tier: 'B',
    members: [
      'Patrick Collison',
      'Tobi Lütke',
      'Stewart Butterfield',
      'Drew Houston',
      'Aaron Levie',
      'Melanie Perkins',
    ],
  },
  {
    id: 'product-founders',
    label: 'Product Founders',
    era: '2020',
    tier: 'B',
    members: ['Dylan Field', 'Brian Chesky', 'Ivan Zhao', 'Stewart Butterfield', 'Vlad Magdalin'],
  },
  {
    id: 'ai-founders',
    label: 'AI Founders',
    era: '2024',
    tier: 'B',
    members: ['Sam Altman', 'Dario Amodei', 'Demis Hassabis', 'Elon Musk', 'Aravind Srinivas'],
  },
  {
    id: 'ai-researchers',
    label: 'AI Researchers',
    era: '2017',
    tier: 'B',
    members: ['Geoffrey Hinton', 'Yann LeCun', 'Yoshua Bengio', 'Ilya Sutskever', 'Demis Hassabis', 'Andrej Karpathy'],
  },
  {
    id: 'crypto',
    label: 'Crypto',
    era: '2021',
    tier: 'B',
    members: [
      'Sam Bankman-Fried',
      'Brian Armstrong',
      'Changpeng Zhao',
      'Vitalik Buterin',
      'Anatoly Yakovenko',
      'Do Kwon',
    ],
  },
  {
    id: 'consumer-social',
    label: 'Consumer Social',
    era: '2012',
    tier: 'B',
    members: ['Mark Zuckerberg', 'Jack Dorsey', 'Kevin Systrom', 'Evan Spiegel', 'Ben Silbermann'],
  },
  {
    id: 'developer-tools',
    label: 'Developer Tools',
    era: '2023',
    tier: 'B',
    members: ['Dylan Field', 'Guillermo Rauch', 'Mitchell Hashimoto', 'Nat Friedman', 'Sid Sijbrandij'],
  },
  {
    id: 'cloud-era',
    label: 'Cloud Era',
    era: '2010s',
    tier: 'B',
    members: ['Jeff Bezos', 'Andy Jassy', 'Satya Nadella', 'Urs Hölzle', 'Werner Vogels'],
  },
  {
    id: 'design-gods',
    label: 'Design Gods',
    era: null,
    tier: 'B',
    members: ['Jony Ive', 'Dylan Field', 'Brian Chesky', 'Tony Fadell', 'Julie Zhuo', 'Susan Kare'],
  },
  {
    id: 'growth-gods',
    label: 'Growth Gods',
    era: null,
    tier: 'B',
    members: ['Sheryl Sandberg', 'Andrew Chen', 'Chamath Palihapitiya', 'Sean Ellis', 'Elena Verna'],
  },
  {
    id: 'enterprise-founders',
    label: 'Enterprise Founders',
    era: null,
    tier: 'B',
    members: ['Marc Benioff', 'Larry Ellison', 'Frank Slootman', 'Aaron Levie', 'Parker Conrad'],
  },
  {
    id: 'commerce-founders',
    label: 'Commerce Founders',
    era: null,
    tier: 'B',
    members: ['Jeff Bezos', 'Tobi Lütke', 'Patrick Collison', 'Jack Ma', 'Pierre Omidyar'],
  },
  {
    id: 'marketplace-founders',
    label: 'Marketplace Founders',
    era: null,
    tier: 'B',
    members: ['Brian Chesky', 'Travis Kalanick', 'Garrett Camp', 'Logan Green', 'Tony Xu'],
  },
  {
    id: 'hardware-builders',
    label: 'Hardware Builders',
    era: null,
    tier: 'B',
    members: ['Steve Jobs', 'Jensen Huang', 'Elon Musk', 'Tony Fadell', 'Palmer Luckey'],
  },
  {
    id: 'infrastructure-builders',
    label: 'Infrastructure Builders',
    era: null,
    tier: 'B',
    members: ['Jensen Huang', 'Werner Vogels', 'Mitchell Hashimoto', 'Urs Hölzle', 'Solomon Hykes'],
  },
  {
    id: 'creator-economy',
    label: 'Creator Economy',
    era: '2021',
    tier: 'B',
    members: ['Daniel Ek', 'Ben Silbermann', 'Kevin Systrom', 'Emmett Shear', 'Steve Chen'],
  },
  {
    id: 'israeli-cyber-mafia',
    label: 'Israeli Cyber Mafia',
    era: null,
    tier: 'B',
    members: ['Gil Shwed', 'Assaf Rappaport', 'Shlomo Kramer', 'Tomer Weingarten', 'Udi Mokady', 'Mickey Boodaei'],
  },

  // === Tier C — the chaos ===================================================
  {
    id: 'tech-villains',
    label: 'Tech Villains',
    era: null,
    tier: 'C',
    members: ['Elizabeth Holmes', 'Sam Bankman-Fried', 'Adam Neumann', 'Travis Kalanick', 'Do Kwon'],
  },
  {
    id: 'chaos-ceos',
    label: 'Chaos CEOs',
    era: null,
    tier: 'C',
    members: ['Elon Musk', 'Adam Neumann', 'Travis Kalanick', 'Steve Jobs', 'Sam Bankman-Fried'],
  },
  {
    id: 'greatest-storytellers',
    label: 'Greatest Storytellers',
    era: null,
    tier: 'C',
    members: ['Steve Jobs', 'Adam Neumann', 'Elon Musk', 'Elizabeth Holmes', 'Marc Benioff'],
  },
  {
    id: 'fundraising-monsters',
    label: 'Fundraising Monsters',
    era: null,
    tier: 'C',
    members: ['Adam Neumann', 'Sam Altman', 'Elon Musk', 'Elizabeth Holmes', 'Sam Bankman-Fried'],
  },
  {
    id: 'founder-mode',
    label: 'Founder Mode',
    era: null,
    tier: 'C',
    members: ['Steve Jobs', 'Mark Zuckerberg', 'Jeff Bezos', 'Elon Musk', 'Jensen Huang', 'Brian Chesky'],
  },
  {
    id: 'board-nightmare',
    label: 'Board Nightmare',
    era: null,
    tier: 'C',
    members: ['Steve Jobs', 'Elon Musk', 'Adam Neumann', 'Travis Kalanick', 'Sam Bankman-Fried'],
  },
  {
    id: 'almost-changed-the-world',
    label: 'Almost Changed the World',
    era: null,
    tier: 'C',
    members: [
      'Elizabeth Holmes',
      'Adam Neumann',
      'Palmer Luckey',
      'Travis Kalanick',
      'Sebastian Thrun',
      'Jeffrey Katzenberg',
    ],
  },
  {
    id: 'spectacular-implosions',
    label: 'Spectacular Implosions',
    era: null,
    tier: 'C',
    members: [
      'Sam Bankman-Fried',
      'Elizabeth Holmes',
      'Adam Neumann',
      'Jeffrey Katzenberg',
      'Meg Whitman',
      'Hosain Rahman',
    ],
  },
  {
    id: 'dot-com-mania',
    label: 'Dot-com Mania',
    era: null,
    tier: 'C',
    members: ['Jeff Bezos', 'Mark Cuban', 'Jerry Yang', 'Pierre Omidyar', 'Marc Benioff'],
  },
  {
    id: 'crypto-casino',
    label: 'Crypto Casino',
    era: null,
    tier: 'C',
    members: ['Sam Bankman-Fried', 'Changpeng Zhao', 'Do Kwon', 'Brian Armstrong', 'Vitalik Buterin'],
  },
  {
    id: 'vision-over-reality',
    label: 'Vision > Reality',
    era: null,
    tier: 'C',
    members: ['Elizabeth Holmes', 'Adam Neumann', 'Elon Musk', 'Masayoshi Son', 'Travis Kalanick', 'Palmer Luckey'],
  },
  {
    id: 'zero-governance',
    label: 'Zero Governance',
    era: null,
    tier: 'C',
    members: ['Adam Neumann', 'Travis Kalanick', 'Sam Bankman-Fried', 'Elon Musk', 'Do Kwon'],
  },
  {
    id: 'would-you-give-them-100m',
    label: 'Would You Give Them $100M?',
    era: null,
    tier: 'C',
    members: [
      'Sam Altman',
      'Elizabeth Holmes',
      'Adam Neumann',
      'Patrick Collison',
      'Elon Musk',
      'Sam Bankman-Fried',
    ],
  },

  // === Historical — the eras ================================================
  {
    id: 'era-dot-com',
    label: 'Dot-com',
    era: '1999',
    tier: 'historical',
    members: ['Jeff Bezos', 'Bill Gates', 'Steve Jobs', 'Jerry Yang', 'Pierre Omidyar', 'Marc Andreessen'],
  },
  {
    id: 'era-web-2',
    label: 'Web 2.0',
    era: '2007',
    tier: 'historical',
    members: ['Steve Jobs', 'Mark Zuckerberg', 'Jeff Bezos', 'Larry Page', 'Jack Dorsey', 'Marc Benioff'],
  },
  {
    id: 'era-mobile',
    label: 'Mobile',
    era: '2012',
    tier: 'historical',
    members: ['Mark Zuckerberg', 'Kevin Systrom', 'Evan Spiegel', 'Travis Kalanick', 'Brian Chesky', 'Jack Dorsey'],
  },
  {
    id: 'era-unicorn',
    label: 'Unicorn Era',
    era: '2016',
    tier: 'historical',
    members: [
      'Mark Zuckerberg',
      'Travis Kalanick',
      'Brian Chesky',
      'Patrick Collison',
      'Evan Spiegel',
      'Stewart Butterfield',
    ],
  },
  {
    id: 'era-everything-bubble',
    label: 'Everything Bubble',
    era: '2021',
    tier: 'historical',
    members: [
      'Elon Musk',
      'Sam Bankman-Fried',
      'Adam Neumann',
      'Brian Armstrong',
      'Changpeng Zhao',
      'Sam Altman',
      'Masayoshi Son',
    ],
  },
  {
    id: 'era-ai-explosion',
    label: 'AI Explosion',
    era: '2023',
    tier: 'historical',
    members: ['Jensen Huang', 'Sam Altman', 'Satya Nadella', 'Demis Hassabis', 'Dario Amodei', 'Mark Zuckerberg'],
  },
];

/** Every draw, for tests and tooling. */
export function allDraws(): readonly ThemedDraw[] {
  return DRAWS;
}

/**
 * The draw's members who can fill `role`. Unknown names are skipped rather than
 * thrown on — a typo should thin a roster, never crash a live hire screen; the
 * test suite is what catches it.
 */
export function membersFor(draw: ThemedDraw, role: CLevelRole): DrawPerson[] {
  const out: DrawPerson[] = [];
  for (const name of draw.members) {
    const person = BY_NAME.get(name);
    if (person && person.roles.includes(role)) out.push(person);
  }
  return out;
}

/** The banner text: the roster's name, with its era when it has one. */
export function drawSource(draw: ThemedDraw): string {
  return draw.era ? `${draw.label} · ${draw.era}` : draw.label;
}

/** Draws that sit at `band` and can actually field a pair for `role`. */
export function drawsFor(role: CLevelRole, band: PerkBand): ThemedDraw[] {
  return DRAWS.filter(
    (draw) => TIER_BAND[draw.tier] === band && membersFor(draw, role).length >= MIN_MEMBERS_PER_ROLE,
  );
}
