const HEADERS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...HEADERS, 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const CONSUMER_KEY    = process.env.PESAPAL_CONSUMER_KEY;
  const CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
  const BASE_URL        = 'https://cybqa.pesapal.com/pesapalv3';

  try {
    const { orderTrackingId } = JSON.parse(event.body);
    if (!orderTrackingId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing orderTrackingId' }) };
    }

    // Get fresh auth token
    const tokenRes  = await fetch(`${BASE_URL}/api/Auth/RequestToken`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ consumer_key: CONSUMER_KEY, consumer_secret: CONSUMER_SECRET })
    });
    const tokenData = await tokenRes.json();
    const token     = tokenData.token;
    if (!token) throw new Error('Auth failed');

    // Verify transaction status with Pesapal
    const verifyRes  = await fetch(`${BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    const verifyData = await verifyRes.json();

    // Pesapal returns payment_status_description: "Completed" for successful payments
    const isPaid = verifyData.payment_status_description === 'Completed';

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        verified:    isPaid,
        status:      verifyData.payment_status_description,
        amount:      verifyData.amount,
        currency:    verifyData.currency,
        method:      verifyData.payment_method,
        description: verifyData.description
      })
    };

  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
