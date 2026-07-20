module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  var body = req.body;
  var messages = body.messages;
  var system = body.system;
  var sessionId = body.session_id;
  var turnCount = body.turn_count || 0;
  var apiKey = process.env.ANTHROPIC_API_KEY;
  var supabaseUrl = 'https://csijnoonsdyppxpmbtpx.supabase.co';
  var supabaseKey = 'sb_publishable_85WrMl95Q9po_rapfgt38A_UXcY5Ueb';

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        stream: true,
        system: [
          {
            type: 'text',
            text: system,
            cache_control: {type: 'ephemeral'}
          }
        ],
        messages: messages
      })
    });

    if (!response.ok) {
      var errData = await response.json();
      return res.status(response.status).json({ error: errData.error ? errData.error.message : 'API error' });
    }

    // 串流回傳
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    var fullText = '';
    var usage = null;
    var reader = response.body.getReader();
    var decoder = new TextDecoder();

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      
      var chunk = decoder.decode(result.value, {stream: true});
      var lines = chunk.split('\n');
      
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith('data: ')) continue;
        var data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          var parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
            fullText += parsed.delta.text;
            res.write('data: ' + JSON.stringify({text: parsed.delta.text}) + '\n\n');
          }
          if (parsed.type === 'message_delta' && parsed.usage) {
            usage = parsed.usage;
          }
          if (parsed.type === 'message_start' && parsed.message && parsed.message.usage) {
            usage = parsed.message.usage;
          }
        } catch(e) {}
      }
    }

    // 存到Supabase
    if (sessionId && usage) {
      try {
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
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            cache_read_tokens: usage.cache_read_input_tokens || 0,
            cache_write_tokens: usage.cache_creation_input_tokens || 0,
            turn_duration: body.turn_duration || 0
          })
        });
        console.log('Supabase status:', sbR.status);
      } catch(e) {
        console.log('Supabase save failed:', e.message);
      }
    }

    res.write('data: ' + JSON.stringify({done: true, fullText: fullText}) + '\n\n');
    res.end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
