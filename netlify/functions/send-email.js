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

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const STORE_EMAIL    = process.env.STORE_EMAIL || 'orders@lushtea.netlify.app';

  if (!RESEND_API_KEY) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Email service not configured' }) };
  }

  try {
    const { order } = JSON.parse(event.body);

    const itemsHTML = order.cartItems.map(item => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1a3d1e;color:#f8f3ee;font-size:14px;">${item.name}</td>
        <td style="padding:10px 0;border-bottom:1px solid #1a3d1e;color:#b8a898;font-size:14px;text-align:center;">x${item.qty}</td>
        <td style="padding:10px 0;border-bottom:1px solid #1a3d1e;color:#c9a84c;font-size:14px;text-align:right;font-weight:700;">
          Shs ${(item.price * item.qty).toLocaleString()}
        </td>
      </tr>`).join('');

    const customerEmailHTML = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#030d05;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#030d05;padding:40px 20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#091d0c;border:1px solid rgba(201,168,76,0.3);border-radius:16px;overflow:hidden;max-width:600px;">

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#1b4d24,#122e18);padding:36px 40px;text-align:center;">
                <div style="font-size:32px;margin-bottom:8px;">🍃</div>
                <h1 style="margin:0;font-size:28px;color:#c9a84c;font-family:Georgia,serif;font-weight:700;">Lush Tea</h1>
                <p style="margin:8px 0 0;color:#b8a898;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Order Confirmed</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:36px 40px;">
                <h2 style="margin:0 0 8px;color:#f8f3ee;font-family:Georgia,serif;font-size:22px;">Thank you, ${order.firstName}! 🎉</h2>
                <p style="color:#b8a898;font-size:14px;line-height:1.7;margin:0 0 28px;">
                  Your order has been placed and will be prepared with the utmost care.
                  You'll receive a dispatch notification once your tea is on its way.
                </p>

                <!-- Order ID -->
                <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:8px;padding:16px 20px;margin-bottom:28px;">
                  <span style="color:#b8a898;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Order Reference</span>
                  <div style="color:#c9a84c;font-size:18px;font-weight:700;margin-top:4px;">#${order.orderId}</div>
                </div>

                <!-- Items -->
                <h3 style="color:#f8f3ee;font-family:Georgia,serif;font-size:16px;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #1a3d1e;">Your Order</h3>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${itemsHTML}
                  <tr>
                    <td colspan="2" style="padding:14px 0 4px;color:#b8a898;font-size:13px;">Delivery</td>
                    <td style="padding:14px 0 4px;color:#b8a898;font-size:13px;text-align:right;">
                      ${order.delivery === 0 ? 'FREE' : 'Shs ' + order.delivery.toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding:12px 0;color:#f8f3ee;font-size:16px;font-weight:700;border-top:1px solid #1a3d1e;">Total</td>
                    <td style="padding:12px 0;color:#c9a84c;font-size:20px;font-weight:700;text-align:right;border-top:1px solid #1a3d1e;font-family:Georgia,serif;">
                      Shs ${order.total.toLocaleString()}
                    </td>
                  </tr>
                </table>

                <!-- Delivery Address -->
                <h3 style="color:#f8f3ee;font-family:Georgia,serif;font-size:16px;margin:28px 0 12px;padding-bottom:12px;border-bottom:1px solid #1a3d1e;">Delivery Address</h3>
                <p style="color:#b8a898;font-size:14px;line-height:1.8;margin:0;">
                  ${order.firstName} ${order.lastName}<br>
                  ${order.address}<br>
                  ${order.city}, Uganda<br>
                  📞 ${order.phone}
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#061409;padding:24px 40px;text-align:center;border-top:1px solid #1a3d1e;">
                <p style="color:#6a5e58;font-size:12px;margin:0;line-height:1.7;">
                  Questions? Reply to this email or visit <a href="https://lushtea.netlify.app" style="color:#c9a84c;">lushtea.netlify.app</a><br>
                  © 2024 Lush Tea. Crafted with love.
                </p>
              </td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>`;

    // Send to customer
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    'Lush Tea <onboarding@resend.dev>',
        to:      [order.email],
        subject: `Your Lush Tea Order #${order.orderId} is Confirmed! 🍃`,
        html:    customerEmailHTML
      })
    });

    // Notify store owner
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    'Lush Tea Orders <onboarding@resend.dev>',
        to:      [STORE_EMAIL],
        subject: `New Order #${order.orderId} — Shs ${order.total.toLocaleString()}`,
        html:    `<p>New order received from <strong>${order.firstName} ${order.lastName}</strong> (${order.email}).</p>
                  <p><strong>Order:</strong> ${order.items}</p>
                  <p><strong>Total:</strong> Shs ${order.total.toLocaleString()}</p>
                  <p><strong>Address:</strong> ${order.address}, ${order.city}</p>
                  <p><strong>Phone:</strong> ${order.phone}</p>`
      })
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ sent: true }) };

  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
