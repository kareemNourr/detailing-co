/**
 * Netlify Function: /.netlify/functions/reviews
 *
 * Fetches Detailing Co.'s rating + reviews via Outscraper API.
 * No Google billing required — Outscraper handles it.
 * Cached for 6 hours to preserve free tier quota.
 *
 * Environment variable required (set in Netlify dashboard):
 *   OUTSCRAPER_API_KEY  — from https://app.outscraper.com/api-key
 *
 * Place ID: ChIJkdJYB0lbWBQRGckDhxvgDvA (Detailing Co., Galleria40)
 */

const PLACE_ID      = 'ChIJkdJYB0lbWBQRGckDhxvgDvA';
const CACHE_SECS    = 60 * 60 * 6; // 6 hours
const REVIEWS_LIMIT = 5;

exports.handler = async function (event, context) {
  const apiKey = process.env.OUTSCRAPER_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'OUTSCRAPER_API_KEY not set' }),
    };
  }

  const url =
    `https://api.app.outscraper.com/maps/reviews-v3` +
    `?query=${encodeURIComponent(PLACE_ID)}` +
    `&reviewsLimit=${REVIEWS_LIMIT}` +
    `&language=en` +
    `&async=false`;

  try {
    const response = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Outscraper error:', response.status, text);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Outscraper API error', detail: text }),
      };
    }

    const json = await response.json();

    // Outscraper returns data[0][0] for a single place query
    const place = json?.data?.[0]?.[0];

    if (!place) {
      console.error('No place data:', JSON.stringify(json));
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Place not found' }),
      };
    }

    // Normalize to the same shape the frontend already expects
    const reviews = (place.reviews_data ?? [])
      .map(r => ({
        author_name: r.author_title,
        rating: r.review_rating,
        text: r.review_text,
        relative_time_description: r.review_datetime_utc
          ? timeAgo(new Date(r.review_datetime_utc))
          : 'recently',
        profile_photo_url: r.author_image ?? null,
        time: new Date(r.review_datetime_utc ?? 0).getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECS}, stale-while-revalidate=3600`,
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        name: place.name,
        rating: place.rating,
        user_ratings_total: place.reviews,
        reviews,
      }),
    };

  } catch (err) {
    console.error('Fetch error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal error', detail: err.message }),
    };
  }
};

// Human-readable relative time
function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)       return 'just now';
  if (s < 3600)     return `${Math.floor(s / 60)} minutes ago`;
  if (s < 86400)    return `${Math.floor(s / 3600)} hours ago`;
  if (s < 2592000)  return `${Math.floor(s / 86400)} days ago`;
  if (s < 31536000) return `${Math.floor(s / 2592000)} months ago`;
  return `${Math.floor(s / 31536000)} years ago`;
}
