// netlify/functions/create-payment.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
  try {
    const body = JSON.parse(event.body || '{}');
    const { orderId, amount, gateway, returnUrl } = body;

    // For now: MOCK provider flow (replace with real provider integration)
    const mockUrl = `${returnUrl}?orderId=${encodeURIComponent(orderId || '')}&status=success`;
    return { statusCode: 200, body: JSON.stringify({ success: true, payment_url: mockUrl }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ success:false, message: err.message }) };
  }
};