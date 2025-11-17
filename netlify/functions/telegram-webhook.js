// netlify/functions/telegram-webhook.js
// Handles /start mapping, callback approve/reject for payments (Supabase)
const fetch = require('node-fetch');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

async function supaFetch(path) {
  const url = `${SUPA_URL}${path}`;
  const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }});
  return res.json();
}
async function supaPatch(path, body) {
  const url = `${SUPA_URL}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer':'return=representation' },
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
  } catch(e) { console.error('sendTelegram err', e); }
}
async function answerCallback(cbId, text) {
  if (!TELE_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ callback_query_id: cbId, text, show_alert: false })
    });
  } catch(e) { console.error('answerCallback err', e); }
}

exports.handler = async function(event) {
  try {
    const raw = event.body || '{}';
    const body = raw ? JSON.parse(raw) : {};

    // Handle callback_query (approve/reject)
    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data || '';
      // Approve payment
      if (data.startsWith('approve_pay:')) {
        const paymentId = data.split(':')[1];
        try {
          // fetch payment record
          const payments = await supaFetch(`/rest/v1/payments?id=eq.${paymentId}&select=*`);
          const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
          if (!payment) {
            await answerCallback(cb.id, 'Payment not found.');
            return { statusCode:200, body: 'ok' };
          }

          // Determine associated member id (try common fields)
          let memberId = payment.member_id || payment.memberId || null;
          if (!memberId && payment.Notes) {
            try {
              const parsed = typeof payment.Notes === 'string' ? JSON.parse(payment.Notes) : payment.Notes;
              if (parsed && (parsed.memberId || parsed.member_id)) memberId = parsed.memberId || parsed.member_id;
            } catch(e){ /* ignore */ }
          }

          if (!memberId) {
            // fallback: try to find pending member for same TelegramChatId (if payment has TelegramChatId)
            if (payment.TelegramChatId) {
              const arr = await supaFetch(`/rest/v1/members?telegram_chat_id=eq.${encodeURIComponent(payment.TelegramChatId)}&status=eq.pending&select=*`);
              if (Array.isArray(arr) && arr[0]) memberId = arr[0].id;
            }
          }

          if (!memberId) {
            // We can't proceed activating a member without link
            await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'approved_without_member' });
            await answerCallback(cb.id, 'Approved (no member linked). Please link member manually.');
            return { statusCode:200, body: 'ok' };
          }

          // 1) set member status -> active
          await supaPatch(`/rest/v1/members?id=eq.${memberId}`, { status: 'active' });

          // 2) update sponsor slot: fetch member to read sponsor_id and position
          const mres = await supaFetch(`/rest/v1/members?id=eq.${memberId}&select=*`);
          const member = Array.isArray(mres) && mres[0] ? mres[0] : null;
          if (member && member.sponsor_id && member.position) {
            const sponsorId = member.sponsor_id;
            const pos = member.position.toLowerCase();
            if (pos === 'left') {
              await supaPatch(`/rest/v1/members?id=eq.${sponsorId}`, { left_child_id: memberId });
            } else {
              await supaPatch(`/rest/v1/members?id=eq.${sponsorId}`, { right_child_id: memberId });
            }
          }

          // 3) mark payment approved
          await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'approved' });

          // 4) notify user (member) via Telegram if present
          const userChat = member && member.telegram_chat_id ? member.telegram_chat_id : payment.TelegramChatId || null;
          if (userChat) {
            await sendTelegram(userChat, `✅ Aapki payment approve ho gayi. Aap ab active member ho. Welcome!`);
          }

          await answerCallback(cb.id, 'Approved ✅');
          // notify admin group that approval done (optional)
          if (ADMIN_CHAT) {
            const adminFirst = (ADMIN_CHAT.indexOf(',')>-1) ? ADMIN_CHAT.split(',')[0].trim() : ADMIN_CHAT;
            await sendTelegram(adminFirst, `Payment ${paymentId} approved by @${cb.from.username || cb.from.id}`);
          }

          return { statusCode:200, body: 'ok' };
        } catch (err) {
          console.error('approve_pay error', err);
          await answerCallback(cb.id, 'Approve failed.');
          return { statusCode:500, body: 'error' };
        }
      }

      // Reject payment
      if (data.startsWith('reject_pay:')) {
        const paymentId = data.split(':')[1];
        try {
          const payments = await supaFetch(`/rest/v1/payments?id=eq.${paymentId}&select=*`);
          const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
          if (!payment) {
            await answerCallback(cb.id, 'Payment not found.');
            return { statusCode:200, body: 'ok' };
          }

          // mark payment rejected
          await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'rejected' });

          // if member linked, mark member rejected
          let memberId = payment.member_id || payment.memberId || null;
          if (!memberId && payment.TelegramChatId) {
            const arr = await supaFetch(`/rest/v1/members?telegram_chat_id=eq.${encodeURIComponent(payment.TelegramChatId)}&status=eq.pending&select=*`);
            if (Array.isArray(arr) && arr[0]) memberId = arr[0].id;
          }
          if (memberId) {
            await supaPatch(`/rest/v1/members?id=eq.${memberId}`, { status: 'rejected' });
            const m = await supaFetch(`/rest/v1/members?id=eq.${memberId}&select=*`);
            if (m && m[0] && m[0].telegram_chat_id) {
              await sendTelegram(m[0].telegram_chat_id, `⚠️ Aapki payment reject kar di gayi. Order: ${payment.OrderID || payment.orderId || ''}. Please contact admin.`);
            }
          }

          await answerCallback(cb.id, 'Rejected ❌');
          if (ADMIN_CHAT) {
            const adminFirst = (ADMIN_CHAT.indexOf(',')>-1) ? ADMIN_CHAT.split(',')[0].trim() : ADMIN_CHAT;
            await sendTelegram(adminFirst, `Payment ${paymentId} rejected by @${cb.from.username || cb.from.id}`);
          }

          return { statusCode:200, body: 'ok' };
        } catch (err) {
          console.error('reject_pay error', err);
          await answerCallback(cb.id, 'Reject failed.');
          return { statusCode:500, body: 'error' };
        }
      }

      // unknown callback
      await answerCallback(cb.id, 'Action received.');
      return { statusCode:200, body: 'ok' };
    }

    // Handle regular messages and /start deep-link mapping
    if (body.message) {
      const msg = body.message;
      const chatId = msg.chat && (msg.chat.id || (msg.from && msg.from.id));
      const text = (msg.text || '').trim();

      // /start handling: payload may be OrderID or custom payload like JOIN:SPONSOR:POSITION:ORDER
      if (text && text.startsWith('/start')) {
        const parts = text.split(' ').filter(Boolean);
        const payload = parts.slice(1).join(' ').trim(); // everything after /start
        if (payload) {
          // if payload looks like an OrderID -> map payment -> telegram chat
          // try multiple possibilities
          try {
            // if payload is simple ORDERID, map payments table
            const orderId = payload;
            // find payment
            const payments = await supaFetch(`/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderId)}&select=*`);
            const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
            if (payment) {
              // patch payment.TelegramChatId
              await supaPatch(`/rest/v1/payments?id=eq.${payment.id}`, { TelegramChatId: String(chatId) });
              await sendTelegram(chatId, `✅ Order ${orderId} aapke Telegram account se link ho gaya. Hum aapko notify karein ge.`);
              return { statusCode:200, body: 'ok' };
            }
            // fallback: user might send custom payload like JOIN:SPONSOR:POSITION:ORDER
            const pp = payload.split(':');
            if (pp[0] && pp[0].toUpperCase() === 'JOIN' && pp[1] && pp[2] && pp[3]) {
              const sponsorId = pp[1];
              const position = pp[2].toLowerCase();
              const orderRef = pp.slice(3).join(':');
              // try to find pending member record for sponsor+position and map telegram_chat_id
              const mems = await supaFetch(`/rest/v1/members?sponsor_id=eq.${encodeURIComponent(sponsorId)}&position=eq.${encodeURIComponent(position)}&status=eq.pending&select=*`);
              const m = Array.isArray(mems) && mems[0] ? mems[0] : null;
              if (m) {
                await supaPatch(`/rest/v1/members?id=eq.${m.id}`, { telegram_chat_id: String(chatId) });
                // also optionally map payment with this orderRef
                if (orderRef) {
                  const pms = await supaFetch(`/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderRef)}&select=*`);
                  if (Array.isArray(pms) && pms[0]) {
                    await supaPatch(`/rest/v1/payments?id=eq.${pms[0].id}`, { TelegramChatId: String(chatId), member_id: m.id });
                  }
                }
                await sendTelegram(chatId, `✅ Aapka account mapped for sponsor ${sponsorId} (${position}).`);
                return { statusCode:200, body: 'ok' };
              }
            }
            // if nothing matched:
            await sendTelegram(chatId, `Payload receive hua: ${payload}. Agar ye OrderID hai to ensure ki aapne site pe payment create kiya ho.`);
            return { statusCode:200, body: 'ok' };
          } catch (err) {
            console.error('/start mapping error', err);
            await sendTelegram(chatId, 'Mapping failed — please contact admin.');
            return { statusCode:500, body: 'error' };
          }
        } else {
          // no payload, show welcome
          await sendTelegram(chatId, `Salam! Agar aap payment link ke saath aaye hain to /start <ORDERID> bhejein. Example: /start INV-2025-001`);
          return { statusCode:200, body: 'ok' };
        }
      }

      // other commands (optional)
      if (text && (text.toLowerCase() === '/help' || text.toLowerCase()==='help')) {
        await sendTelegram(chatId, `Commands:\n/start <ORDERID> — map your account\n/join — start join flow (coming soon)`);
        return { statusCode:200, body: 'ok' };
      }

      // default: ignore or respond
      return { statusCode:200, body: 'ok' };
    }

    return { statusCode:200, body: 'no action' };
  } catch (err) {
    console.error('telegram-webhook error', err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
