// functions/telegramWebhook.js
const fetch = require('node-fetch');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || 'Payments';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// helper: send message back via Telegram
async function telegramSend(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

// Airtable helpers
async function airtableGetRecordByProvider(provider) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?filterByFormula=${encodeURIComponent(`{Provider} = "${provider}"`)}&maxRecords=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }});
  const data = await res.json();
  return data.records && data.records[0];
}

async function airtableCreateOrUpdate(provider, details) {
  const existing = await airtableGetRecordByProvider(provider);
  if (existing) {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}/${existing.id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { Provider: provider, Details: details }})
    });
    return await res.json();
  } else {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { Provider: provider, Details: details }})
    });
    return await res.json();
  }
}

async function airtableGetAllPayments() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE)}?maxRecords=50&view=Grid%20view`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }});
  const data = await res.json();
  return data.records || [];
}

// Netlify function handler
exports.handler = async function(event) {
  // Telegram sends POST JSON updates to webhook
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

  let body;
  try { body = JSON.parse(event.body); } catch (e) { return { statusCode: 400, body: 'invalid json' }; }
  const update = body;
  const message = update.message || update.edited_message;
  if (!message) return { statusCode: 200, body: 'no message' };

  const chatId = message.chat.id;
  const from = message.from;
  const text = (message.text || '').trim();

  // admin check
  const isAdmin = TELEGRAM_ADMIN_IDS.includes(String(from.id));
  const chatIdentifier = `${from.first_name || ''} ${from.last_name || ''} (@${from.username || 'no-username'}) [${from.id}]`;

  if (!text) {
    await telegramSend(chatId, 'Sir, koi text command bhejiye. Example: /setpayment jazzcash 0312-1234567');
    return { statusCode: 200, body: 'no text' };
  }

  const parts = text.split(' ').filter(Boolean);
  const cmd = parts[0].toLowerCase();

  try {
    if (cmd === '/setpayment' || cmd === '/setpayments') {
      if (!isAdmin) {
        await telegramSend(chatId, '❌ Aap admin nahi hain — is command ko sirf allowed admins chala sakte hain.');
        return { statusCode: 200, body: 'not admin' };
      }
      // format: /setpayment <provider> <details...>
      if (parts.length < 3) {
        await telegramSend(chatId, 'Usage: /setpayment <provider> <details>\nExample: /setpayment jazzcash 0312-1234567');
        return { statusCode: 200, body: 'bad usage' };
      }
      const provider = parts[1].toLowerCase();
      const details = parts.slice(2).join(' ');
      // allowed providers: jazzcash, easypaisa (you can add more)
      if (!['jazzcash','easypaisa'].includes(provider)) {
        await telegramSend(chatId, 'Allowed providers: jazzcash, easypaisa');
        return { statusCode: 200, body: 'invalid provider' };
      }

      const result = await airtableCreateOrUpdate(provider, details);
      await telegramSend(chatId, `✅ Updated *${provider}* details successfully.\nDetails: \`${details}\`\nBy: ${chatIdentifier}`);
      return { statusCode: 200, body: 'updated' };
    } else if (cmd === '/getpayments' || cmd === '/payments') {
      const records = await airtableGetAllPayments();
      if (!records.length) {
        await telegramSend(chatId, 'No payments configured yet.');
        return { statusCode: 200, body: 'no payments' };
      }
      let msg = '*Current Payment Details:*\n';
      for (const r of records) {
        const p = (r.fields.Provider || 'unknown');
        const d = (r.fields.Details || '---');
        msg += `\n*${p}*: \`${d}\``;
      }
      await telegramSend(chatId, msg);
      return { statusCode: 200, body: 'got payments' };
    } else {
      // unknown command: ignore or reply help
      // keep it polite
      // reply only for admins who ask for help
      if (text.startsWith('/')) {
        await telegramSend(chatId, 'Unknown command. Use:\n/setpayment <provider> <details>\n/getpayments');
        return { statusCode: 200, body: 'unknown cmd' };
      }
    }
  } catch (err) {
    console.error('ERROR', err);
    await telegramSend(chatId, '⚠️ An error occurred while processing. Check server logs.');
    return { statusCode: 500, body: 'error' };
  }

  return { statusCode: 200, body: 'ok' };
};