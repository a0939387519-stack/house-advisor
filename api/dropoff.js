module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  var supabaseUrl = 'https://csijnoonsdyppxpmbtpx.supabase.co';
  var supabaseKey = 'sb_publishable_85WrMl95Q9po_rapfgt38A_UXcY5Ueb';

  try {
    // 嘗試從body或raw body解析
    var body = req.body;
    
    // 如果body是字串，嘗試解析
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    
    // 如果body還是空的，嘗試讀raw body
    if (!body || (!body.session_id && !body.dropoff_turn)) {
      var rawBody = await new Promise(function(resolve) {
        var chunks = [];
        req.on('data', function(chunk) { chunks.push(chunk); });
        req.on('end', function() { resolve(Buffer.concat(chunks).toString()); });
      });
      try { body = JSON.parse(rawBody); } catch(e) {}
    }

    var sessionId = body && body.session_id;
    var dropoffTurn = body && body.dropoff_turn;

    console.log('Dropoff received:', sessionId, dropoffTurn);

    if (!sessionId || !dropoffTurn) return res.status(400).end();

    var sbR = await fetch(supabaseUrl + '/rest/v1/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey
      },
      body: JSON.stringify({
        session_id: sessionId,
        turn_count: 0,
        dropoff_turn: dropoffTurn,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        turn_duration: 0
      })
    });
    console.log('Supabase dropoff status:', sbR.status);
    return res.status(200).end();
  } catch(e) {
    console.log('Dropoff error:', e.message);
    return res.status(500).end();
  }
};
