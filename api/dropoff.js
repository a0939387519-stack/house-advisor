module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  var supabaseUrl = 'https://csijnoonsdyppxpmbtpx.supabase.co';
  var supabaseKey = 'sb_publishable_85WrMl95Q9po_rapfgt38A_UXcY5Ueb';

  try {
    var body = req.body;
    var sessionId = body.session_id;
    var dropoffTurn = body.dropoff_turn;

    if (!sessionId || !dropoffTurn) return res.status(400).end();

    // 找到這個session最後一筆對話，更新dropoff_turn
    await fetch(supabaseUrl + '/rest/v1/conversations?session_id=eq.' + sessionId + '&turn_count=eq.' + dropoffTurn, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey
      },
      body: JSON.stringify({ dropoff_turn: dropoffTurn })
    });

    return res.status(200).end();
  } catch(e) {
    return res.status(500).end();
  }
};
