// netlify/functions/request-otp.js
const fetch = require('node-fetch');
function genOTP(){ return Math.floor(100000 + Math.random()*900000).toString(); }
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async function(event){
  try {
    if (event.httpMethod !== 'POST') return { statusCode:405, body: JSON.stringify({ ok:false, message:'Method not allowed' }) };
    const { telegram } = JSON.parse(event.body || '{}');
    if (!telegram) return { statusCode:400, body: JSON.stringify({ ok:false, message:'missing telegram' }) };
    if (!SUPA_URL || !SUPA_KEY) return { statusCode:500, body: JSON.stringify({ ok:false, message:'supabase not configured' }) };
    const otp = genOTP();
    const payload = { telegram: telegram, otp: otp, type: 'OTP' };
    const url = `${SUPA_URL}/rest/v1/verifications`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer':'return=representation' },
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    return { statusCode: 200, body: JSON.stringify({ ok:true, otp: otp }) };
  } catch (err) {
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};