// netlify/functions/verify-otp.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event){
  try {
    if (event.httpMethod !== 'POST') return { statusCode:405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
    const { telegram, otp } = JSON.parse(event.body || '{}');
    if (!telegram || !otp) return { statusCode:400, body: JSON.stringify({ ok:false, message:'missing fields' }) };
    if (!SUPA_URL || !SUPA_KEY) return { statusCode:500, body: JSON.stringify({ ok:false, message:'supabase not configured' }) };
    const url = `${SUPA_URL}/rest/v1/verifications?telegram=eq.${encodeURIComponent(telegram)}&otp=eq.${encodeURIComponent(otp)}&select=*`;
    const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
    const arr = await res.json();
    if (!arr || arr.length===0) return { statusCode:200, body: JSON.stringify({ ok:false, message:'not found' }) };
    // optionally: mark verification used - patch the record
    const vid = arr[0].id;
    await fetch(`${SUPA_URL}/rest/v1/verifications?id=eq.${vid}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json','apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ used: true })
    });
    return { statusCode:200, body: JSON.stringify({ ok:true, message:'verified' }) };
  } catch (err) {
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};