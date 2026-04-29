exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
  const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
  const BASE_URL        = 'https://cybqa.pesapal.com/pesapalv3';
  const SITE_URL        = process.env.URL || 'http://localhost:8888';

  try {
    const order = JSON.parse(event.body);

    // Step 1 — Get auth token
    const tokenRes  = await fetch(`${BASE_URL}/api/Auth/RequestToken`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET })
    });
    const tokenData = await tokenRes.json();
    const token     = tokenData.token;

    if (!token) {
      throw new Error('Pesapal auth failed: ' + JSON.stringify(tokenData));
    }

    // Step 2 — Register IPN URL
    const ipnRes  = await fetch(`${BASE_URL}/api/URLSetup/RegisterIPN`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        url:                   `${SITE_URL}/.netlify/functions/pesapal-ipn`,
        ipn_notification_type: 'GET'
      })
    });
    const ipnData = await ipnRes.json();
    const ipnId   = ipnData.ipn_id;

    // Step 3 — Submit order
    const submitRes  = await fetch(`${BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        id:              order.orderId,
        currency:        'UGX',
        amount:          order.amount,
        description:     `Lush Tea Order — ${order.items}`,
        callback_url:    `${SITE_URL}/?payment=success&ref=${order.orderId}`,
        notification_id: ipnId,
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

    if (!submitData.redirect_url) {
      throw new Error('No redirect URL from Pesapal: ' + JSON.stringify(submitData));
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        redirect_url:      submitData.redirect_url,
        order_tracking_id: submitData.order_tracking_id
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
