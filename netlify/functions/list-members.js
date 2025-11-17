// netlify/functions/list-members.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event) {
  try {
    if (!SUPA_URL || !SUPA_KEY) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'supabase not configured' })};
    // fetch payments (or members) - adjust select as needed
    const url = `${SUPA_URL}/rest/v1/payments?select=OrderID,Amount,created_at,Status`;
    const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
    const rows = await res.json();
    return { statusCode: 200, body: JSON.stringify({ ok:true, members: rows }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};