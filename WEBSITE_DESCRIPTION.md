# Scareathon

Scareathon is a spooky little arcade clubhouse built for people who like chasing scores, collecting odd little prizes, and making their corner of the site feel like their own.

At its heart, Scareathon is an arcade. The site opens around playable cabinets, fast score runs, and seasonal competition. Players can jump into games, post scores, earn coins, and climb leaderboards without the site feeling heavy or complicated. The arcade should feel immediate: pick a cabinet, play a round, see how you did, and come back later to try again.

Around that arcade is a playful identity system. Every player has a profile and an avatar they can customize over time. Coins earned through games and site activity can feed into a marketplace of avatar pieces, cosmetics, collectibles, and seasonal items. The goal is to make progress visible and personal: your scores matter, but so does the strange little character you build along the way.

Scareathon is also home to the Scareboard, event standings, announcements, and seasonal updates. During the October event, the site becomes the hub for watching the competition unfold. Outside the event window, it still works as a year-round hangout where players can practice, customize, check news, and keep building up their account.

The tone should be stylish, spooky, and fun without being difficult to use. It should feel like a haunted arcade cabinet came to life on the web: glowing buttons, bold colors, moody backgrounds, arcade energy, and enough personality to feel handmade. Navigation should stay simple and predictable, with clear paths to the Arcade, Scareathon event pages, News, Scareboard, and Profile.

The design direction is playful but not messy. The site should be easy to scan, pleasant to move through, and comfortable for repeat visits. Big visual moments can carry the atmosphere, while the actual tools stay practical: readable standings, obvious play buttons, clean profile controls, understandable marketplace cards, and fast access to the things people came to do.

Scareathon is for players who want a little competition, a little collection, and a lot of Halloween arcade charm. It is not just a scoreboard and not just a game launcher. It is a small world where arcade runs, avatar customization, marketplace rewards, and seasonal Scareathon traditions all connect.

## Experience Goals

- Make the arcade the main attraction.
- Reward play with coins, scores, identity, and collectible progress.
- Let users customize avatars in a way that feels expressive and easy.
- Keep marketplace browsing clear, visual, and fun.
- Make standings and Scareathon event pages simple to understand at a glance.
- Preserve a spooky arcade personality without sacrificing usability.
- Feel active year-round, with extra energy during October.

## Personality

Scareathon should feel:

- spooky, but welcoming
- arcade-like, but not cluttered
- playful, but easy to navigate
- stylish, but readable
- collectible, but not confusing
- seasonal, but useful all year

## Simple User Promise

Play games. Earn coins. Customize your avatar. Climb the Scareboard. Come back for the next run.

## Data Available Today

As of May 10, 2026, Scareathon already has enough connected data to feel like a living arcade hub rather than a static website.

The site can identify signed-in players through Supabase Auth. That gives Scareathon a real account layer: users can log in, keep a persistent profile, update their username, maintain a wallet, own avatar items, save avatar outfits, and return later without losing progress.

The arcade data is active. The app knows which games are published, where those games live, and how to submit scores from playable web games back into Scareathon. Game score submissions can create leaderboard entries, award coins when reward rules apply, and preserve game-specific player data when a cabinet needs it. Current arcade experiences include games like 8 Bit Evil Returns, Ooidash, Hemlock's Tower, Tlaloc's Curse, and the original 8 Bit Evil where supported.

The Scareboard is powered by event standings data from Google Sheets. The site can show the active or most relevant event year, historical years, player totals, ranks, category columns like movies, weekly, bonus, and total, plus past winners. This gives the event side of Scareathon a familiar competition layer that can be browsed by year.

The calendar data also comes from Google Sheets. Scareathon can show the movie calendar and individual day details. Daily movie data can be enriched with TMDB information, including movie lookup details and watch provider data where available, so the calendar can become more useful than a plain list.

News and announcements come from Strapi. The site can list posts, show titles, dates, rich content, and attached images. This gives Scareathon a place for house updates, event notes, seasonal announcements, and ongoing communication without needing a code deploy for every post.

The avatar system has real inventory data. Scareathon can load avatar slots, equipped items, owned items, default starter items, layered sprite assets, and saved outfit choices. It can also create and store avatar composite images in Supabase Storage so the user's avatar can appear around the site as a single profile image.

The marketplace data is available for shop browsing and purchases. The site can show shop items, categories, prices, rarity-style metadata, availability windows, ownership counts, and item artwork. Users can buy items with coins, receive item instances, and use those items in avatar customization.

The broader marketplace foundation also supports player-to-player listings. Scareathon can track listed item instances, listing prices, sellers, buyers, and purchase completion, which gives the site room to grow from a simple shop into a trading economy.

The wallet data is available per user. The site can show coin balances and recent currency transactions. This connects arcade play, rewards, shop purchases, marketplace activity, and profile progression into one visible loop.

The inbox data is available for account communication. Scareathon can show conversations, unread counts, messages, read state, admin-created conversations, and claimable rewards. This gives the site a way to deliver notices, rewards, and player-specific updates inside the experience.

The home page can already pull a compact summary from multiple sources at once: current Scareboard leader, latest announcement, wallet balance, and unread inbox count. That makes the first screen useful as a dashboard while still keeping the arcade as the main attraction.

Together, these data sources support the current direction: a score-chasing arcade, a customizable player identity, a coin economy, a seasonal Scareathon competition, and a playful marketplace that gives people reasons to keep coming back.
