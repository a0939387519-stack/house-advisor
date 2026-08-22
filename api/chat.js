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
  var isStream = !body.no_stream;
  var userMessage = body.user_message || '';
  var apiKey = process.env.ANTHROPIC_API_KEY;
  var supabaseUrl = 'https://csijnoonsdyppxpmbtpx.supabase.co';
  var supabaseKey = 'sb_publishable_85WrMl95Q9po_rapfgt38A_UXcY5Ueb';

  // 安全限制常數
  var MAX_TURNS_PER_SESSION = 10;
  var MAX_DAILY_TOKENS = 600000; // 每日token上限，約$5

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // 安全上限檢查（只有有session_id且有user_message才檢查，Gate call不檢查）
  if (sessionId && userMessage) {
    try {
      // 第一層：單一session輪數上限
      if (turnCount > MAX_TURNS_PER_SESSION) {
        return res.status(200).json({ 
          text: '這次對話已經聊了很多輪了，建議你先整理一下目前的資訊，有新的問題可以重新開始一段對話。希望以上說明有幫到你，有任何問題隨時再來。',
          usage: null,
          limit: 'turns'
        });
      }

      // 第二層：每日總token上限
      var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      var tokenR = await fetch(supabaseUrl + '/rest/v1/conversations?select=input_tokens,output_tokens&created_at=gte.' + today + 'T00:00:00Z', {
        headers: {
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey
        }
      });
      if (tokenR.ok) {
        var tokenData = await tokenR.json();
        var totalTokens = tokenData.reduce(function(sum, r) {
          return sum + (parseInt(r.input_tokens) || 0) + (parseInt(r.output_tokens) || 0);
        }, 0);
        if (totalTokens >= MAX_DAILY_TOKENS) {
          return res.status(200).json({ 
            text: '今天的使用量已經達到上限，明天再來繼續聊吧！感謝你的使用。',
            usage: null,
            limit: 'daily'
          });
        }
      }
    } catch(e) {
      console.log('Safety check failed:', e.message);
      // 安全檢查失敗就繼續，不擋住正常使用
    }
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
        stream: isStream,
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
      var errText = await response.text();
      var errData;
      try { errData = JSON.parse(errText); } catch(e) { errData = {}; }
      return res.status(response.status).json({ error: errData.error ? errData.error.message : 'API error' });
    }

    // 非串流模式（Gate call和快速模式用）
    if (!isStream) {
      var rawText = await response.text();
      var data;
      try { data = JSON.parse(rawText); } catch(e) {
        return res.status(500).json({ error: 'parse error: ' + rawText.slice(0,100) });
      }
      var text = data.content && data.content[0] && data.content[0].text ? data.content[0].text : '抱歉，請再試一次。';
      
      // 快速模式有session_id才存（Gate call沒有user_message，不存）
      if (sessionId && userMessage && data.usage) {
        try {
          await fetch(supabaseUrl + '/rest/v1/conversations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': 'Bearer ' + supabaseKey
            },
            body: JSON.stringify({
              session_id: sessionId,
              turn_count: turnCount,
              input_tokens: data.usage.input_tokens || 0,
              output_tokens: data.usage.output_tokens || 0,
              cache_read_tokens: data.usage.cache_read_input_tokens || 0,
              cache_write_tokens: data.usage.cache_creation_input_tokens || 0,
              turn_duration: body.turn_duration || 0,
              user_message: userMessage.slice(0, 500),
              ai_response: text.slice(0, 1000)
            })
          });
        } catch(e) {
          console.log('Supabase quick mode save failed:', e.message);
        }
      }
      
      return res.status(200).json({ text: text, usage: data.usage });
    }

    // 串流模式（主call用）
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
        var evtData = line.slice(6);
        if (evtData === '[DONE]') continue;
        try {
          var parsed = JSON.parse(evtData);
          if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
            fullText += parsed.delta.text;
            res.write('data: ' + JSON.stringify({text: parsed.delta.text}) + '\n\n');
          }
          if (parsed.type === 'message_delta' && parsed.usage) usage = parsed.usage;
          if (parsed.type === 'message_start' && parsed.message && parsed.message.usage) usage = parsed.message.usage;
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
            turn_duration: body.turn_duration || 0,
            user_message: userMessage.slice(0, 500),
            ai_response: fullText.slice(0, 1000)
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
