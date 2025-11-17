// netlify/functions/payout-notify.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  try {
    const { memberId, amount, method, details } = JSON.parse(event.body || '{}');
    if (!memberId || !amount) return { statusCode: 400, body: JSON.stringify({ ok:false, message:'missing fields' }) };

    const AIR_BASE = process.env.AIRTABLE_BASE_ID;
    const AIR_TABLE_PAYOUTS = process.env.AIRTABLE_PAYOUTS_TABLE_NAME || 'Payouts';
    const AIR_TABLE_MEMBERS = process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_TABLE;
    const AIR_KEY = process.env.AIRTABLE_API_KEY;
    const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!AIR_BASE || !AIR_KEY) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'airtable not configured' }) };
    if (!TELE_TOKEN || !ADMIN_CHAT) return { statusCode: 500, body: JSON.stringify({ ok:false, message:'telegram not configured' }) };

    // get member
    const rMember = await fetch(`https://api.airtable.com/v0/${AIR_BASE}/${encodeURIComponent(AIR_TABLE_MEMBERS)}/${memberId}`, { headers: { Authorization:`Bearer ${AIR_KEY}` } });
    const mJson = await rMember.json();
    const mFields = mJson.fields || {};

    const payoutPayload = {
      fields: {
        MemberID: memberId,
        MemberName: mFields.Name || 'N/A',
        Amount: Number(amount),
        Method: method || '',
        Details: details || '',
        Status: 'Requested',
        RequestedAt: new Date().toISOString()
      }
    };
    const rCreate = await fetch(`https://api.airtable.com/v0/${AIR_BASE}/${encodeURIComponent(AIR_TABLE_PAYOUTS)}`, {
      method: 'POST',
      headers: { Authorization:`Bearer ${AIR_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payoutPayload)
    });
    const created = await rCreate.json();
    if (!rCreate.ok) return { statusCode: 500, body: JSON.stringify({ ok:false, error: created }) };

    const payoutId = created.id;
    const text = `🔔 Withdrawal request\nMember: ${mFields.Name || 'N/A'}\nMemberID: ${memberId}\nAmount: PKR ${amount}\nMethod: ${method}\nDetails: ${details || '-'}`;

    const keyboard = {
      inline_keyboard: [
        [{ text: 'Approve ✅', callback_data: `approve:${payoutId}` }, { text: 'Reject ❌', callback_data: `reject:${payoutId}` }]
      ]
    };

    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT, text, reply_markup: keyboard })
    });

    return { statusCode: 200, body: JSON.stringify({ ok:true, payoutId }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};