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
    var helpful = body.helpful;
    var turnCount = body.turn_count || 0;

    if (!sessionId || !helpful) return res.status(400).json({error: 'missing fields'});

    // INSERT一筆評分紀錄
    var sbR = await fetch(supabaseUrl + '/rest/v1/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey
      },
      body: JSON.stringify({
        session_id: sessionId,
        turn_count: turnCount,
        helpful: helpful,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        turn_duration: 0
      })
    });
    console.log('Rating saved:', sbR.status, sessionId, helpful);
    return res.status(200).json({ok: true});
  } catch(e) {
    console.log('Rating error:', e.message);
    return res.status(500).json({error: e.message});
  }
};
