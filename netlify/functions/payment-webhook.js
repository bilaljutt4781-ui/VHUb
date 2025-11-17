// netlify/functions/payment-webhook.js
const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

async function supaFetch(queryPath) {
  const url = `${SUPA_URL}${queryPath}`;
  const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }});
  return res.json();
}
async function supaPatch(path, body) {
  const url = `${SUPA_URL}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  return res.json();
}
async function sendTelegram(chatId, text, extra={}) {
  if (!TELE_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(Object.assign({ chat_id: String(chatId), text, parse_mode: 'HTML' }, extra))
    });
  } catch (e) { console.error('sendTelegram error', e); }
}

exports.handler = async function(event) {
  try {
    // parse webhook payload (flexible)
    const raw = event.body || '{}';
    const body = raw ? JSON.parse(raw) : {};
    const orderId = (body.orderId || body.OrderID || body.merchantReference || (body.data && body.data.orderId) || '').toString();
    const status = ((body.status || body.statusCode || (body.data && body.data.status)) || '').toString().toLowerCase();
    const txnId = body.txnId || body.transactionId || (body.data && body.data.txnId) || '';

    if (!orderId) return { statusCode:400, body: 'missing orderId' };

    if (!SUPA_URL || !SUPA_KEY) return { statusCode:500, body: 'supabase not configured' };

    // find payment record by OrderID
    // ensure we select member_id if it exists
    const payments = await supaFetch(`/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderId)}&select=*`);
    const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
    if (!payment) {
      // optionally create a payment record if you want; here we just return 404
      return { statusCode:404, body: 'payment not found' };
    }

    const paymentId = payment.id;

    // normalize status
    const newStatus = (status === 'success' || status === 'paid' || status === 'completed') ? 'paid' : (status === 'failed' ? 'failed' : status || 'unknown');

    // If paid -> mark awaiting_admin and notify admin(s) to approve
    if (newStatus === 'paid') {
      await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'awaiting_admin', TxnID: txnId });

      // try to find linked member id (common field names)
      const memberId = payment.member_id || payment.memberId || (payment.Notes && (() => {
        try {
          // If Notes contains JSON (e.g. { memberId: 123 })
          const n = typeof payment.Notes === 'string' ? JSON.parse(payment.Notes) : null;
          return n && (n.memberId || n.member_id);
        } catch (e) { return null; }
      })()) || null;

      const textParts = [`🔔 <b>Payment received</b>`, `Order: <code>${orderId}</code>`, `Amount: ${payment.Amount || ''}`, `Txn: ${txnId || 'N/A'}`];
      if (memberId) textParts.push(`MemberID: ${memberId}`);
      const text = textParts.join('\n');

      const keyboard = {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: 'Approve ✅', callback_data: `approve_pay:${paymentId}` }, { text: 'Reject ❌', callback_data: `reject_pay:${paymentId}` }]
          ]
        })
      };

      if (TELE_TOKEN && ADMIN_CHAT) {
        const chats = ADMIN_CHAT.indexOf(',')>-1 ? ADMIN_CHAT.split(',').map(s=>s.trim()) : [ADMIN_CHAT];
        for (const c of chats) {
          try {
            await sendTelegram(c, text, { reply_markup: keyboard.reply_markup });
          } catch(e) { console.error('notify admin send error', e); }
        }
      }

      return { statusCode:200, body: JSON.stringify({ ok:true, message:'awaiting_admin notified' }) };
    } else {
      // update status normally
      await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: newStatus, TxnID: txnId });
      return { statusCode:200, body: JSON.stringify({ ok:true, status: newStatus }) };
    }

  } catch (err) {
    console.error('payment-webhook error', err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
