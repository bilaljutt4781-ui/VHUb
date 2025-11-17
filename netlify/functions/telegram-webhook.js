// netlify/functions/telegram-webhook.js
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Payments';
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s=>s.trim()).filter(Boolean).map(Number);

const airtableHeaders = {
  'Authorization': `Bearer ${AIRTABLE_KEY}`,
  'Content-Type': 'application/json'
};

async function tgApi(method, payload) {
  return fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function sendTelegram(chatId, text, extra={}) {
  const payload = Object.assign({ chat_id: chatId, text, parse_mode: 'Markdown' }, extra);
  return tgApi('sendMessage', payload);
}

async function answerCallback(callbackId, text='') {
  return tgApi('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: false });
}

async function findAirtableRecordByProvider(provider) {
  const filter = `({Provider}='${provider.replace(/'/g,"\\'")}')`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}?filterByFormula=${encodeURIComponent(filter)}&pageSize=1`;
  const res = await fetch(url, { headers: airtableHeaders });
  const j = await res.json();
  return (j.records && j.records[0]) || null;
}

async function createAirtableRecord(fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}`;
  const res = await fetch(url, { method: 'POST', headers: airtableHeaders, body: JSON.stringify({ fields }) });
  return await res.json();
}

async function updateAirtableRecord(id, fields) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}/${id}`;
  const res = await fetch(url, { method: 'PATCH', headers: airtableHeaders, body: JSON.stringify({ fields }) });
  return await res.json();
}

async function listAllPaymentMethods() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}?pageSize=100`;
  const res = await fetch(url, { headers: airtableHeaders });
  const j = await res.json();
  return j.records || [];
}

// Helper to send premium-style welcome (Markdown)
function premiumWelcomeText(botUsername) {
  return [
    "*Welcome to VHub — Premium Edition!*",
    "",
    "👋 Assalamu alaikum! Main VHub official bot hoon — yahan se aap payments add kar sakte hain, verification request bhej sakte hain, aur admin se contact kar sakte hain.",
    "",
    "*Available commands:*",
    "/start — show this help",
    "/profile — view your basic profile",
    "/setpayment <provider> <details> — admin only",
    "/getpayments — list payment methods",
    "",
    "*Quick access:* Click buttons below to open bot link, view how it works, or contact admin.",
    ""
  ].join("\n");
}

// Left/Right concept text (Roman-Urdu) — concise explanation
function leftRightConceptText() {
  return [
    "*Left / Right Concept (Simple):*",
    "",
    "1) Bunyadi idea: Har member ko do sides milti hain — *Left* aur *Right*.",
    "2) Jab aap kisi ko add karte ho, woh ya to left me jata hai ya right me — is se team balanced rehti hai.",
    "3) Jab dono sides me members aur unki purchases hoti hain, to commission distribute hota hai (left vs right comparison).",
    "4) Aapka goal: apni side ko strong banana, jis se aapko zyada commission mil sakti hai.",
    "",
    "_Agar aap chahen, main detailed example aur chart bhej dunga._"
  ].join("\n");
}

// Handler
exports.handler = async function(event) {
  try {
    // Telegram can POST updates as JSON. It can be message OR callback_query.
    const body = event.body ? JSON.parse(event.body) : {};
    // handle callback_query first
    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data;
      const fromId = cb.from && cb.from.id;
      const chatId = cb.message && cb.message.chat && cb.message.chat.id;
      // simple handlers
      if (data === 'how_it_works') {
        await answerCallback(cb.id, 'Opening explanation...');
        await sendTelegram(chatId, leftRightConceptText());
        return { statusCode: 200, body: 'ok' };
      }
      if (data === 'contact_admin') {
        await answerCallback(cb.id, 'Contacting admin...');
        // send admin contact (use ADMIN_IDS first if set)
        const adminHint = ADMIN_IDS.length ? `Admin IDs: ${ADMIN_IDS.join(', ')}` : 'Contact admin via @your_admin_username';
        await sendTelegram(chatId, `Admin contact: ${adminHint}`);
        return { statusCode: 200, body: 'ok' };
      }
      // unknown callback
      
// === SUPABASE: Admin approve/reject handlers for payments ===
if (data && data.startsWith('approve_pay:')) {
  const recId = data.split(':')[1];
  try {
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPA_URL || !SUPA_KEY) {
      await answerCallback(cb.id, 'Server not configured (supabase).');
      return { statusCode: 200, body: 'no-supabase' };
    }
    const recRes = await fetch(`${SUPA_URL}/rest/v1/payments?id=eq.${recId}&select=*`, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
    const recJsonArr = await recRes.json();
    const recJson = (Array.isArray(recJsonArr) && recJsonArr[0]) ? recJsonArr[0] : null;
    const userChat = recJson && recJson.TelegramChatId ? recJson.TelegramChatId : null;
    // patch status -> approved
    await fetch(`${SUPA_URL}/rest/v1/payments?id=eq.${recId}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json','apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ Status: 'approved' })
    });
    await answerCallback(cb.id, 'Approved ✅');
    if (userChat) await sendTelegram(userChat, `✅ Aapki payment approve ho gayi. Order: ${recJson && recJson.OrderID ? recJson.OrderID : recId}`);
    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_IDS;
    if (adminChat) await sendTelegram((adminChat.split(',')[0]), `Payment ${recId} approved by @${cb.from.username || cb.from.id}`);
  } catch (err) {
    console.error('approve error', err);
    await answerCallback(cb.id, 'Approve failed.');
  }
  return { statusCode: 200, body: 'ok' };
}

if (data && data.startsWith('reject_pay:')) {
  const recId = data.split(':')[1];
  try {
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPA_URL || !SUPA_KEY) {
      await answerCallback(cb.id, 'Server not configured (supabase).');
      return { statusCode: 200, body: 'no-supabase' };
    }
    const recRes = await fetch(`${SUPA_URL}/rest/v1/payments?id=eq.${recId}&select=*`, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
    const recJsonArr = await recRes.json();
    const recJson = (Array.isArray(recJsonArr) && recJsonArr[0]) ? recJsonArr[0] : null;
    const userChat = recJson && recJson.TelegramChatId ? recJson.TelegramChatId : null;
    // patch status -> rejected
    await fetch(`${SUPA_URL}/rest/v1/payments?id=eq.${recId}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json','apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ Status: 'rejected' })
    });
    await answerCallback(cb.id, 'Rejected ❌');
    if (userChat) await sendTelegram(userChat, `⚠️ Aapki payment reject kar di gayi. Order: ${recJson && recJson.OrderID ? recJson.OrderID : recId}. Please contact admin.`);
    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_IDS;
    if (adminChat) await sendTelegram((adminChat.split(',')[0]), `Payment ${recId} rejected by @${cb.from.username || cb.from.id}`);
  } catch (err) {
    console.error('reject error', err);
    await answerCallback(cb.id, 'Reject failed.');
  }
  return { statusCode: 200, body: 'ok' };
}

await answerCallback(cb.id, 'Action received.');
      return { statusCode: 200, body: 'ok' };
    }

    const message = body.message;
    if (!message) return { statusCode: 200, body: 'no message' };

    const chatId = message.chat && message.chat.id;
    const from = message.from || {};
    const userId = from.id;
    const text = (message.text || '').trim();

    if (!text) {
      // non-text messages (photos) can be handled separately if desired
      return { statusCode: 200, body: 'no-text' };
    }

    const parts = text.split(' ').filter(Boolean);
    const cmd = parts[0].toLowerCase();
// === SUPABASE: handle /start <orderId> deep-link mapping ===
if (cmd === '/start' || text.startsWith('/start ')) {
  const payload = parts.slice(1).join(' ').trim();
  const orderId = payload || (text.split(' ')[1] || '').trim();
  if (orderId) {
    try {
      const SUPA_URL = process.env.SUPABASE_URL;
      const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!SUPA_URL || !SUPA_KEY) {
        await sendTelegram(chatId, '⚠️ Server not configured to save mapping.');
        return { statusCode: 200, body: 'no-supabase' };
      }
      const url = `${SUPA_URL}/rest/v1/payments?OrderID=eq.${encodeURIComponent(orderId)}&select=*`;
      const res = await fetch(url, { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } });
      const j = await res.json();
      const rec = (Array.isArray(j) && j[0]) ? j[0] : null;
      if (!rec) {
        await sendTelegram(chatId, `Order ID not found: ${orderId}`);
        return { statusCode: 200, body: 'order-not-found' };
      }
      const recId = rec.id;
      // patch record to set TelegramChatId
      await fetch(`${SUPA_URL}/rest/v1/payments?id=eq.${recId}`, {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json','apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({ TelegramChatId: String(chatId) })
      });
      await sendTelegram(chatId, `✅ Order ${orderId} mapped to this Telegram account. We'll notify you when payment is updated.`);
      return { statusCode: 200, body: 'ok' };
    } catch (err) {
      console.error('mapping error', err);
      await sendTelegram(chatId, '⚠️ Mapping failed - please contact admin.');
      return { statusCode: 500, body: 'mapping-error' };
    }
  }
}



    // /start -> premium welcome + inline keyboard
    if (cmd === '/start') {
      const BOT = (process.env.SITE_BOT_USERNAME || from.username || 'lisadavid_bot').replace(/^@/,'');
      const welcome = premiumWelcomeText(BOT);

      // inline keyboard: How it works, Open Bot (t.me), Contact Admin
      const keyboard = {
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: 'How it works', callback_data: 'how_it_works' }],
            [{ text: 'Open Telegram Bot', url: `https://t.me/${BOT}` }, { text: 'Contact Admin', callback_data: 'contact_admin' }]
          ]
        })
      };

      await sendTelegram(chatId, welcome, keyboard);
      return { statusCode: 200, body: 'ok' };
    }

    // /profile
    if (cmd === '/profile') {
      const name = process.env.SITE_NAME || 'VHub';
      await sendTelegram(chatId, `Profile\nName: ${name}\nID: ${chatId}\nTelegram: @${from.username || ''}`);
      return { statusCode: 200, body: 'ok' };
    }

    // /setpayment <provider> <details>  (admin only)
    if (cmd === '/setpayment') {
      if (!ADMIN_IDS.includes(userId)) {
        await sendTelegram(chatId, `Permission denied. Only admins can set payment details.`);
        return { statusCode: 200, body: 'not-admin' };
      }

      if (parts.length < 3) {
        await sendTelegram(chatId, `Usage: /setpayment <provider> <details>\nExample: /setpayment easypaisa 03xx-xxxxxxx`);
        return { statusCode: 200, body: 'usage' };
      }

      const provider = parts[1].toLowerCase();
      const details = parts.slice(2).join(' ');

      // upsert in Airtable
      const existing = await findAirtableRecordByProvider(provider);
      if (existing) {
        await updateAirtableRecord(existing.id, { Provider: provider, Details: details });
        await sendTelegram(chatId, `✅ Updated *${provider}* details.`);
      } else {
        await createAirtableRecord({ Provider: provider, Details: details });
        await sendTelegram(chatId, `✅ Created *${provider}* details.`);
      }
      return { statusCode: 200, body: 'ok' };
    }

    // /getpayments
    if (cmd === '/getpayments' || cmd === '/payments') {
      const records = await listAllPaymentMethods();
      if (!records || !records.length) {
        await sendTelegram(chatId, `No payment details configured yet.`);
        return { statusCode: 200, body: 'empty' };
      }
      let lines = ['*Current Payment Details:*', ''];
      records.forEach(r => {
        const f = r.fields || {};
        const p = f.Provider || 'unknown';
        const d = f.Details || 'unknown';
        lines.push(`- *${p}*: ${d}`);
      });
      await sendTelegram(chatId, lines.join('\n'));
      return { statusCode: 200, body: 'ok' };
    }

    // unknown
    await sendTelegram(chatId, `Unknown command. Use /start to see available commands.` );
    return { statusCode: 200, body: 'unknown' };

  } catch (err) {
    console.error('webhook error', err);
    return { statusCode: 200, body: 'error' }; // respond 200 to Telegram to avoid retries
  }
};
