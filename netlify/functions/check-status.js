// netlify/functions/check-status.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode:405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
    const { orderId } = JSON.parse(event.body || '{}');
    if (!orderId) return { statusCode:400, body: JSON.stringify({ ok:false, message:'missing orderId' }) };
    if (!SUPA_URL || !SUPA_KEY) return { statusCode:500, body: JSON.stringify({ ok:false, message:'supabase not configured' }) };
    const url = `${SUPA_URL}/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderId)}&select=*`;
    const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
    const arr = await res.json();
    const rec = (Array.isArray(arr) && arr[0]) ? arr[0] : null;
    return { statusCode:200, body: JSON.stringify({ ok:true, record: rec }) };
  } catch (err) {
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};