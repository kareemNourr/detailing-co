/**
 * Netlify Function: /.netlify/functions/reviews
 *
 * Fetches Detailing Co.'s rating + reviews from Google Places API.
 * Caches the response for 6 hours via Cache-Control so you don't
 * burn through API quota on every page load.
 *
 * Environment variables required (set in Netlify dashboard):
 *   GOOGLE_PLACES_API_KEY  — your Google Cloud Places API key
 *
 * Place ID for Detailing Co. (Sheikh Zayed):
 *   ChIJkdJYBOlbhRQR2cmDs23g4PA=  (resolved from Maps URL)
 */

const PLACE_ID   = 'ChIJkdJYB0lbWBQRGckDhxvgDvA'; // Detailing Co., Galleria40, Sheikh Zayed
const FIELDS     = 'name,rating,user_ratings_total,reviews';
const LANG       = 'en';
const CACHE_SECS = 60 * 60 * 6; // 6 hours

exports.handler = async function (event, context) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not set' }),
    };
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${PLACE_ID}` +
    `&fields=${FIELDS}` +
    `&language=${LANG}` +
    `&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const json     = await response.json();

    if (json.status !== 'OK') {
      console.error('Places API error:', json.status, json.error_message);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: json.status, detail: json.error_message }),
      };
    }

    const { name, rating, user_ratings_total, reviews } = json.result;

    // Sort reviews by most recent first, filter to 5-star only if enough exist
    const sorted = (reviews ?? []).sort((a, b) => b.time - a.time);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // CDN + browser cache for 6 hours, stale-while-revalidate for 1 extra hour
        'Cache-Control': `public, max-age=${CACHE_SECS}, stale-while-revalidate=3600`,
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        name,
        rating,
        user_ratings_total,
        reviews: sorted,
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
