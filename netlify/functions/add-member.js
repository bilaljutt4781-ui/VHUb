// netlify/functions/add-member.js
const fetch = require('node-fetch');
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ------------ Helpers -------------- */
async function supaInsert(table, payload){
  const url = `${SUPA_URL}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':'application/json',
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  return r.json();
}

/* ------------ Main Handler -------------- */
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { sponsorId, position, name, username, phone } = body;

    if (!sponsorId || !position || !['left','right'].includes(position)) {
      return { statusCode:400, body: 'Missing sponsor or position' };
    }

    /* 1) Check sponsor exists */
    const sponsorRes = await fetch(
      `${SUPA_URL}/rest/v1/members?id=eq.${sponsorId}&select=*`,
      {
        headers:{
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      }
    );
    const sponsorArr = await sponsorRes.json();
    const sponsor = sponsorArr[0];

    if (!sponsor)
      return { statusCode:404, body: 'Sponsor not found' };

    /* 2) Check slot empty */
    if (position === 'left' && sponsor.left_child_id)
      return { statusCode:409, body: 'Left slot already filled' };

    if (position === 'right' && sponsor.right_child_id)
      return { statusCode:409, body: 'Right slot already filled' };

    /* 3) Create pending member */
    const newMemberRecord = {
      sponsor_id: sponsorId,
      position,
      name: name || null,
      username: username || null,
      phone: phone || null,
      status: 'pending',
      level: (sponsor.level || 0) + 1
    };

    const created = await supaInsert('members', newMemberRecord);
    const newMember = created[0];

    return {
      statusCode:200,
      body: JSON.stringify({
        ok: true,
        message: 'Member created as pending, awaiting admin approval.',
        member: newMember
      })
    };

  } catch (err) {
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};