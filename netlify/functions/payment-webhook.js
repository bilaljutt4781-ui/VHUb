// netlify/functions/payment-webhook.js
const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_IDS || '';

async function supaGetByOrder(orderId) {
  const url = `${SUPA_URL}/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderId)}&select=*`;
  const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
  return await res.json();
}

async function supaPatchById(id, fields) {
  const url = `${SUPA_URL}/rest/v1/payments?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer':'return=representation' },
    body: JSON.stringify(fields)
  });
  return await res.json();
}

exports.handler = async function(event) {
  try {
    const raw = event.body || '{}';
    const body = raw ? JSON.parse(raw) : {};
    const orderId = body.orderId || body.OrderID || body.merchantReference || (body.data && body.data.orderId);
    const status = (body.status || body.statusCode || (body.data && body.data.status) || 'unknown').toString().toLowerCase();
    const txnId = body.txnId || body.transactionId || (body.data && body.data.txnId) || '';

    if (!orderId) return { statusCode: 400, body: 'missing orderId' };
    if (!SUPA_URL || !SUPA_KEY) return { statusCode: 500, body: 'supabase not configured' };

    const recs = await supaGetByOrder(orderId);
    const rec = (Array.isArray(recs) && recs[0]) ? recs[0] : null;
    if (!rec) return { statusCode: 404, body: 'order not found' };

    const id = rec.id;
    const newStatus = (status === 'success' || status === 'paid' || status === 'completed') ? 'paid' : (status === 'failed' ? 'failed' : status);

    if (newStatus === 'paid') {
      await supaPatchById(id, { Status: 'awaiting_admin', TxnID: txnId });
      if (TELE_TOKEN && ADMIN_CHAT) {
        const text = `🔔 Payment received for Order ${orderId} (Record: ${id})\nAmount: ${rec.Amount || ''}\nTxn: ${txnId || 'N/A'}`;
        const keyboard = {
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [{ text: 'Approve ✅', callback_data: `approve_pay:${id}` }, { text: 'Reject ❌', callback_data: `reject_pay:${id}` }]
            ]
          })
        };
        const chats = ADMIN_CHAT.indexOf(',')>-1 ? ADMIN_CHAT.split(',').map(s=>s.trim()) : [ADMIN_CHAT];
        for (const c of chats) {
          try {
            await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type':'application/json' },
              body: JSON.stringify({ chat_id: c, text, reply_markup: keyboard.reply_markup })
            });
          } catch(e) { console.error('notify-admin error', e); }
        }
      }
    } else {
      await supaPatchById(id, { Status: newStatus, TxnID: txnId });
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (err) {
    console.error('webhook error', err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
