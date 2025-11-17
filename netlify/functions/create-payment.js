// netlify/functions/create-payment.js
const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role key (KEEP SECRET)

async function supaInsert(table, payload) {
  const url = `${SUPA_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
  try {
    const body = JSON.parse(event.body || '{}');
    const { orderId, amount, gateway, returnUrl, telegramChatId, metadata } = body;
    if (!orderId || !amount) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing fields' }) };
    if (!SUPA_URL || !SUPA_KEY) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'Supabase not configured' }) };

    const record = {
      OrderID: orderId,
      Amount: Number(amount),
      Gateway: gateway || 'bot',
      Status: 'pending',
      ReturnUrl: returnUrl || null,
      TelegramChatId: telegramChatId || null,
      Notes: metadata ? JSON.stringify(metadata) : null
    };

    const inserted = await supaInsert('payments', [record]); // supabase expects array for bulk insert
    const rec = (Array.isArray(inserted) && inserted[0]) ? inserted[0] : null;

    const payment_url = (returnUrl) ? `${returnUrl}?orderId=${encodeURIComponent(orderId)}&status=initiated` : `https://example.com/pay?orderId=${encodeURIComponent(orderId)}`;
    return { statusCode: 200, body: JSON.stringify({ success:true, payment_url, record: rec }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ success:false, message: err.message }) };
  }
};
