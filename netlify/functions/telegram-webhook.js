// netlify/functions/telegram-webhook.js
// Required env vars (set these in Netlify):
// TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_ADMIN_CHAT_ID (optional)

const fetch = require('node-fetch');

const TELE_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SUPA_URL = process.env.SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

if (!TELE_TOKEN) {
  console.error('WARN: TELEGRAM_BOT_TOKEN is not set in environment variables.');
}

// --- helper: supabase simple fetch/patch (REST) ---
async function supaFetch(path) {
  if (!SUPA_URL || !SUPA_KEY) {
    console.warn('supaFetch skipped — SUPA_URL or SUPA_KEY missing.');
    return null;
  }
  const url = `${SUPA_URL}${path}`;
  const res = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }});
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return text; }
}
async function supaPatch(path, body) {
  if (!SUPA_URL || !SUPA_KEY) {
    console.warn('supaPatch skipped — SUPA_URL or SUPA_KEY missing.');
    return null;
  }
  const url = `${SUPA_URL}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return text; }
}

// --- helper: escape text for Telegram (avoid HTML parse errors) ---
function escapeForTelegram(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- send message to telegram (no parse_mode by default) ---
async function sendTelegram(chatId, text, extra = {}) {
  if (!TELE_TOKEN) {
    console.error('sendTelegram: TELEGRAM_BOT_TOKEN missing.');
    return { ok: false, error: 'no-token' };
  }
  const safeText = escapeForTelegram(String(text || ''));

  const payload = Object.assign({ chat_id: String(chatId), text: safeText }, extra);

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data || !data.ok) {
      console.error('sendTelegram failed', data);
    } else {
      console.log('sendTelegram ok', { chatId, message_id: data.result && data.result.message_id });
    }
    return data;
  } catch (err) {
    console.error('sendTelegram exception', err);
    return { ok: false, error: err.message || err };
  }
}

async function answerCallback(cbId, text) {
  if (!TELE_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELE_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cbId, text })
    });
  } catch (e) { console.error('answerCallback error', e); }
}

// --- Main handler ---
exports.handler = async function(event) {
  try {
    const raw = event.body || '{}';
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch (e) {
      console.error('Invalid JSON body', e, raw);
      return { statusCode: 200, body: 'invalid-json' };
    }

    // callback_query (approve/reject)
    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data || '';
      console.log('callback_query received', { from: cb.from && cb.from.id, data });

      if (data.startsWith('approve_pay:')) {
        const paymentId = data.split(':')[1];
        try {
          const payments = await supaFetch(`/rest/v1/payments?id=eq.${paymentId}&select=*`);
          const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
          if (!payment) {
            await answerCallback(cb.id, 'Payment not found.');
            return { statusCode:200, body:'ok' };
          }

          // link/activate logic (same as previous)
          let memberId = payment.member_id || payment.memberId || null;
          if (!memberId && payment.Notes) {
            try {
              const parsed = typeof payment.Notes === 'string' ? JSON.parse(payment.Notes) : payment.Notes;
              if (parsed && (parsed.memberId || parsed.member_id)) memberId = parsed.memberId || parsed.member_id;
            } catch(e){}
          }
          if (!memberId && payment.TelegramChatId) {
            const arr = await supaFetch(`/rest/v1/members?telegram_chat_id=eq.${encodeURIComponent(payment.TelegramChatId)}&status=eq.pending&select=*`);
            if (Array.isArray(arr) && arr[0]) memberId = arr[0].id;
          }

          if (!memberId) {
            await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'approved_without_member' });
            await answerCallback(cb.id, 'Approved (no member linked).');
            return { statusCode:200, body:'ok' };
          }

          await supaPatch(`/rest/v1/members?id=eq.${memberId}`, { status: 'active' });

          // update sponsor children
          const mres = await supaFetch(`/rest/v1/members?id=eq.${memberId}&select=*`);
          const member = Array.isArray(mres) && mres[0] ? mres[0] : null;
          if (member && member.sponsor_id && member.position) {
            const sponsorId = member.sponsor_id;
            const pos = (member.position || '').toLowerCase();
            if (pos === 'left') {
              await supaPatch(`/rest/v1/members?id=eq.${sponsorId}`, { left_child_id: memberId });
            } else {
              await supaPatch(`/rest/v1/members?id=eq.${sponsorId}`, { right_child_id: memberId });
            }
          }

          await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'approved' });

          const userChat = member && member.telegram_chat_id ? member.telegram_chat_id : payment.TelegramChatId || null;
          if (userChat) {
            await sendTelegram(userChat, `✅ Aapki payment approve ho gayi. Aap ab active member ho. Welcome!`);
          }

          await answerCallback(cb.id, 'Approved ✅');

          if (ADMIN_CHAT) {
            const adminFirst = (ADMIN_CHAT.indexOf(',')>-1) ? ADMIN_CHAT.split(',')[0].trim() : ADMIN_CHAT;
            await sendTelegram(adminFirst, `Payment ${paymentId} approved by @${cb.from && cb.from.username || cb.from && cb.from.id}`);
          }

          return { statusCode:200, body:'ok' };
        } catch (err) {
          console.error('approve_pay error', err);
          await answerCallback(cb.id, 'Approve failed.');
          return { statusCode:500, body:'error' };
        }
      }

      if (data.startsWith('reject_pay:')) {
        const paymentId = data.split(':')[1];
        try {
          const payments = await supaFetch(`/rest/v1/payments?id=eq.${paymentId}&select=*`);
          const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
          if (!payment) {
            await answerCallback(cb.id, 'Payment not found.');
            return { statusCode:200, body:'ok' };
          }

          await supaPatch(`/rest/v1/payments?id=eq.${paymentId}`, { Status: 'rejected' });

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
            await sendTelegram(adminFirst, `Payment ${paymentId} rejected by @${cb.from && cb.from.username || cb.from && cb.from.id}`);
          }

          return { statusCode:200, body:'ok' };
        } catch (err) {
          console.error('reject_pay error', err);
          await answerCallback(cb.id, 'Reject failed.');
          return { statusCode:500, body:'error' };
        }
      }

      await answerCallback(cb.id, 'Action received.');
      return { statusCode:200, body:'ok' };
    }

    // --- message handling ---
    if (body.message) {
      const msg = body.message;
      const chatId = msg.chat && (msg.chat.id || (msg.from && msg.from.id));
      const text = (msg.text || '').trim();
      console.log('message received', { chatId, text });

      // /start handling with payload
      if (text && text.startsWith('/start')) {
        const parts = text.split(' ').filter(Boolean);
        const payload = parts.slice(1).join(' ').trim();
        if (payload) {
          try {
            // Try payment OrderID mapping
            const orderId = payload;
            const payments = await supaFetch(`/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderId)}&select=*`);
            const payment = Array.isArray(payments) && payments[0] ? payments[0] : null;
            if (payment) {
              await supaPatch(`/rest/v1/payments?id=eq.${payment.id}`, { TelegramChatId: String(chatId) });
              await sendTelegram(chatId, `✅ Order ${orderId} aapke Telegram account se link ho gaya. Hum aapko notify karein ge.`);
              return { statusCode:200, body:'ok' };
            }

            // fallback join: JOIN:sponsor:position:order
            const pp = payload.split(':');
            if (pp[0] && pp[0].toUpperCase() === 'JOIN' && pp[1] && pp[2] && pp[3]) {
              const sponsorId = pp[1];
              const position = pp[2].toLowerCase();
              const orderRef = pp.slice(3).join(':');
              const mems = await supaFetch(`/rest/v1/members?sponsor_id=eq.${encodeURIComponent(sponsorId)}&position=eq.${encodeURIComponent(position)}&status=eq.pending&select=*`);
              const m = Array.isArray(mems) && mems[0] ? mems[0] : null;
              if (m) {
                await supaPatch(`/rest/v1/members?id=eq.${m.id}`, { telegram_chat_id: String(chatId) });
                if (orderRef) {
                  const pms = await supaFetch(`/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderRef)}&select=*`);
                  if (Array.isArray(pms) && pms[0]) {
                    await supaPatch(`/rest/v1/payments?id=eq.${pms[0].id}`, { TelegramChatId: String(chatId), member_id: m.id });
                  }
                }
                await sendTelegram(chatId, `✅ Aapka account mapped for sponsor ${sponsorId} (${position}).`);
                return { statusCode:200, body:'ok' };
              }
            }

            await sendTelegram(chatId, `Payload receive hua: ${payload}. Agar ye OrderID hai to ensure ki aapne site pe payment create kiya ho.`);
            return { statusCode:200, body:'ok' };
          } catch (err) {
            console.error('/start mapping error', err);
            await sendTelegram(chatId, 'Mapping failed — please contact admin.');
            return { statusCode:500, body:'error' };
          }
        } else {
          await sendTelegram(chatId, `Salam! Agar aap payment link ke saath aaye hain to /start <ORDERID> bhejein. Example: /start INV-2025-001`);
          return { statusCode:200, body:'ok' };
        }
      }

      if (text && (text.toLowerCase() === '/help' || text.toLowerCase()==='help')) {
        await sendTelegram(chatId, `Commands:\n/start <ORDERID> — map your account\n/join — start join flow (coming soon)`);
        return { statusCode:200, body:'ok' };
      }

      // default ignore
      return { statusCode:200, body:'ok' };
    }

    return { statusCode:200, body:'no action' };
  } catch (err) {
    console.error('telegram-webhook error', err);
    return { statusCode:200, body: JSON.stringify({ ok:false, error: (err && err.message) || err }) };
  }
};