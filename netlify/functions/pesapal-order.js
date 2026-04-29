// Simple in-memory rate limiter — resets on cold start, adds a protective layer
const rateLimitMap = {};
const RATE_LIMIT   = 5;   // max 5 orders per IP per minute
const WINDOW_MS    = 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimitMap[ip] || now - rateLimitMap[ip].start > WINDOW_MS) {
    rateLimitMap[ip] = { count: 1, start: now };
    return false;
  }
  rateLimitMap[ip].count++;
  return rateLimitMap[ip].count > RATE_LIMIT;
}

function validateOrder(order) {
  const required = ['orderId','amount','firstName','lastName','email','phone','address','city'];
  for (const field of required) {
    if (!order[field] || String(order[field]).trim() === '') {
      return `Missing required field: ${field}`;
    }
  }
  if (typeof order.amount !== 'number' || order.amount < 1000 || order.amount > 50000000) {
    return 'Invalid order amount';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(order.email)) {
    return 'Invalid email address';
  }
  return null;
}

const HEADERS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { ...HEADERS, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Rate limiting
  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
  if (isRateLimited(ip)) {
    return { statusCode: 429, headers: HEADERS, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
  const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
  const BASE_URL        = 'https://cybqa.pesapal.com/pesapalv3';
  const SITE_URL        = process.env.URL || 'http://localhost:8888';

  try {
    const order = JSON.parse(event.body);

    // Validate inputs
    const validationError = validateOrder(order);
    if (validationError) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: validationError }) };
    }

    // Step 1 — Get auth token
    const tokenRes  = await fetch(`${BASE_URL}/api/Auth/RequestToken`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET })
    });
    const tokenData = await tokenRes.json();
    const token     = tokenData.token;
    if (!token) throw new Error('Pesapal auth failed: ' + JSON.stringify(tokenData));

    // Step 2 — Register IPN URL
    const ipnRes  = await fetch(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({
        url:                   `${SITE_URL}/.netlify/functions/pesapal-ipn`,
        ipn_notification_type: 'GET'
      })
    });
    const ipnData = await ipnRes.json();

    // Step 3 — Submit order
    const submitRes  = await fetch(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({
        id:              order.orderId,
        currency:        'UGX',
        amount:          order.amount,
        description:     `Lush Tea Order — ${order.items}`,
        callback_url:    `${SITE_URL}/?payment=success&ref=${order.orderId}`,
        notification_id: ipnData.ipn_id,
        billing_address: {
          email_address: order.email,
          phone_number:  order.phone,
          first_name:    order.firstName,
          last_name:     order.lastName,
          line_1:        order.address,
          city:          order.city,
          country_code:  'UG'
        }
      })
    });
    const submitData = await submitRes.json();
    if (!submitData.redirect_url) throw new Error('No redirect URL: ' + JSON.stringify(submitData));

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        redirect_url:      submitData.redirect_url,
        order_tracking_id: submitData.order_tracking_id
      })
    };

  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
