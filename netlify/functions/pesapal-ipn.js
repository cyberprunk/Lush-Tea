exports.handler = async (event) => {
  const {
    orderTrackingId,
    orderMerchantReference,
    orderNotificationType
  } = event.queryStringParameters || {};

  console.log('Pesapal IPN received:', {
    orderTrackingId,
    orderMerchantReference,
    orderNotificationType
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNotificationType,
      orderTrackingId,
      orderMerchantReference
    })
  };
};
