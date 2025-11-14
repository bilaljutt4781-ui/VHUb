// netlify/functions/distribute-commission.js
const fetch = global.fetch;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { memberId } = body;
    if (!memberId) return { statusCode: 400, body: 'missing memberId' };

    const AIR_BASE = process.env.AIRTABLE_BASE_ID;
    const AIR_TABLE_MEMBERS = process.env.AIRTABLE_TABLE_NAME || 'Members';
    const AIR_TABLE_EARN = process.env.AIRTABLE_EARN_TABLE_NAME || 'Earnings';
    const AIR_KEY = process.env.AIRTABLE_API_KEY;
    if (!AIR_BASE || !AIR_TABLE_MEMBERS || !AIR_KEY) return { statusCode: 500, body: 'airtable not configured' };

    const LEVEL_AMOUNTS = [100, 50, 25, 10, 5];

    async function getMember(recId) {
      const r = await fetch(`https://api.airtable.com/v0/${AIR_BASE}/${encodeURIComponent(AIR_TABLE_MEMBERS)}/${recId}`, {
        headers: { Authorization: `Bearer ${AIR_KEY}` }
      });
      if (!r.ok) return null;
      const j = await r.json();
      return { id: j.id, fields: j.fields };
    }

    async function createEarning(fields) {
      const r = await fetch(`https://api.airtable.com/v0/${AIR_BASE}/${encodeURIComponent(AIR_TABLE_EARN)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIR_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      return r.ok;
    }

    const current = await getMember(memberId);
    if (!current) return { statusCode: 404, body: 'member not found' };

    let parentId = current.fields.UplineID || null;

    for (let level = 1; level <= LEVEL_AMOUNTS.length; level++) {
      if (!parentId) break;
      const parent = await getMember(parentId);
      if (!parent) break;

      const earning = {
        MemberID: parentId,
        FromMemberID: memberId,
        Level: level,
        Amount: LEVEL_AMOUNTS[level-1],
        Status: 'Pending',
        CreatedAt: new Date().toISOString()
      };

      await createEarning(earning);
      parentId = parent.fields.UplineID || null;
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
