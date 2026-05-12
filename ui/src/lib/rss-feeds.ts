/**
 * Curated set of FREE RSS feeds for the news layer (Layer 3, v1 slice). Chosen to
 * cover the things that actually move *this* user's exposure: Pakistan macro / SBP
 * / PKR, the freelance & remote-work economy, crypto regulation, and USD / emerging
 * markets generally. Kept as a static list (no DB) — edit here to tune.
 *
 * Each feed item is later run through the LLM to get a summary, relevance tags, and
 * a one-line "how this affects you" note keyed off the user's profile.
 */
export type RssFeed = {
  /** human label, used as `news_items.source` */
  name: string;
  url: string;
  /** coarse area, helps the LLM tag and helps us balance the pull */
  area: "pakistan" | "freelance" | "crypto" | "global" | "emerging-markets";
};

export const RSS_FEEDS: RssFeed[] = [
  // Pakistan macro / business
  { name: "Dawn — Business", url: "https://www.dawn.com/feeds/business", area: "pakistan" },
  { name: "The News — Business", url: "https://www.thenews.com.pk/rss/2/9", area: "pakistan" },
  { name: "Profit (Pakistan Today)", url: "https://profit.pakistantoday.com.pk/feed/", area: "pakistan" },
  { name: "Business Recorder", url: "https://www.brecorder.com/feeds/latest-news", area: "pakistan" },

  // Freelance / remote-work economy / AI industry shifts
  { name: "Remote.co Blog", url: "https://remote.co/feed/", area: "freelance" },
  { name: "We Work Remotely", url: "https://weworkremotely.com/remote-jobs.rss", area: "freelance" },

  // Crypto regulation / market
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", area: "crypto" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", area: "crypto" },

  // USD / global macro / emerging markets
  { name: "Reuters — Markets", url: "https://www.reutersagency.com/feed/?best-topics=markets&post_type=best", area: "global" },
  { name: "IMF — News", url: "https://www.imf.org/en/News/rss?language=eng", area: "emerging-markets" },
];
