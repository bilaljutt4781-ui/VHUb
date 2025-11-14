// netlify/functions/airtable-add-verify.js
const fetch = require('node-fetch');

function genOTP() { return Math.floor(100000 + Math.random()*900000).toString(); }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body:'Method not allowed' };
  try {
    const { telegram } = JSON.parse(event.body || '{}');
    if (!telegram) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing telegram' }) };

    const otp = genOTP();
    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE_NAME;
    const key = process.env.AIRTABLE_API_KEY;

    if (!base || !table || !key) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'Airtable not configured' }) };

    const record = { fields: { Type: 'OTP', Telegram: telegram, OTP: otp, CreatedAt: new Date().toISOString(), Verified: 'No' } };
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type':'application/json' },
      body: JSON.stringify(record)
    });
    const json = await r.json();
    if (!r.ok) return { statusCode: 500, body: JSON.stringify({ ok:false, error: json }) };

    // notify admin via telegram
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (token && adminChat) {
      const text = `🔐 OTP generated for ${telegram}\nCode: ${otp}\nAsk user to DM the bot with the code to verify.`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: adminChat, text })
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true, otp: otp }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
