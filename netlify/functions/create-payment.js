// netlify/functions/create-payment.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const body = JSON.parse(event.body || '{}');
    const { orderId, amount, gateway, returnUrl } = body;

    // === MOCK FLOW (for testing) ===
    // Return a "payment_url" that immediately redirects back to your return page.
    // Replace this block with real provider API integration for JazzCash/Easypaisa.
    const mockUrl = `${returnUrl}?orderId=${encodeURIComponent(orderId)}&status=success`;
    return { statusCode: 200, body: JSON.stringify({ success: true, payment_url: mockUrl }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ success:false, message: err.message }) };
  }
};
