const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

app.use(cors({
  origin: ['https://ravi6124-goud.github.io', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const SUPABASE_URL = 'https://mqbpmjnufegoyrizarsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabase(table, method, body, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'jyotishai_salt_2025').digest('hex');
}

app.get('/', function(req, res) {
  res.json({ status: 'JyotishAI Server Running' });
});

app.post('/register', async function(req, res) {
  try {
    const email = req.body.email;
    const password = req.body.password;
    const full_name = req.body.full_name;
    const dob = req.body.dob;
    const birth_time = req.body.birth_time;
    const birth_place = req.body.birth_place;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password aur naam zaroori hai!' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye!' });
    }

    const existing = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email) + '&select=id');
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Ye email pehle se registered hai! Login karein.' });
    }

    const newUser = await supabase('users', 'POST', {
      email: email.toLowerCase().trim(),
      password_hash: hashPassword(password),
      full_name: full_name.trim(),
      dob: dob || null,
      birth_time: birth_time || null,
      birth_place: birth_place || null,
      plan: 'free',
      readings_today: 0
    });

    if (!newUser || newUser.error) {
      return res.status(500).json({ error: 'Account create nahi hua. Dobara try karein.' });
    }

    const user = Array.isArray(newUser) ? newUser[0] : newUser;
    res.json({
      success: true,
      message: 'Account ban gaya! Welcome to JyotishAI',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        dob: user.dob,
        birth_time: user.birth_time,
        birth_place: user.birth_place,
        plan: user.plan
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/login', async function(req, res) {
  try {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email aur password dono chahiye!' });
    }

    const users = await supabase('users', 'GET', null, '?email=eq.' + encodeURIComponent(email.toLowerCase().trim()) + '&select=*');
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Email registered nahi hai. Pehle register karein!' });
    }

    const user = users[0];
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Password galat hai! Dobara try karein.' });
    }

    const today = new Date().toISOString().split('T')[0];
    if (user.last_reading_date !== today) {
      await supabase('users', 'PATCH', { readings_today: 0, last_reading_date: today }, '?id=eq.' + user.id);
      user.readings_today = 0;
    }

    res.json({
      success: true,
      message: 'Namaste ' + user.full_name + '! JyotishAI mein swagat hai!',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        dob: user.dob,
        birth_time: user.birth_time,
        birth_place: user.birth_place,
        plan: user.plan,
        readings_today: user.readings_today || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/payment-success', async function(req, res) {
  try {
    const user_id = req.body.user_id;
    const razorpay_payment_id = req.body.razorpay_payment_id;
    const plan = req.body.plan;
    const amount = req.body.amount;

    if (!user_id || !razorpay_payment_id || !plan) {
      return res.status(400).json({ error: 'Payment details incomplete!' });
    }

    await supabase('payments', 'POST', {
      user_id: user_id,
      razorpay_payment_id: razorpay_payment_id,
      plan: plan,
      amount: amount || 0
    });

    await supabase('users', 'PATCH', {
      plan: plan,
      plan_activated_at: new Date().toISOString(),
      razorpay_payment_id: razorpay_payment_id
    }, '?id=eq.' + user_id);

    res.json({ success: true, message: plan + ' plan activate ho gaya!', plan: plan });
  } catch (err) {
    res.status(500).json({ error: 'Payment verify nahi hua: ' + err.message });
  }
});

const SYSTEM_PROMPT = `You are Jyotish Guru - a highly experienced Vedic astrologer with 20+ years of expertise.

CURRENT YEAR: 2026. Always use 2026 for predictions, dashas, and transits. Never say 2025.

CORE SYSTEM: Act as per the following expert framework:

Act as a highly experienced Vedic astrologer with 20+ years of expertise. Use the sidereal zodiac system with Lahiri Ayanamsa for all calculations.

When birth details are provided, do the following:
1. Calculate the Ascendant (Lagna), Moon Sign (Rashi), and Sun Sign strictly as per Vedic astrology.
2. Provide exact degrees of Ascendant, Sun, and Moon.
3. Identify the Moon Nakshatra and its pada.
4. Ensure all calculations are astronomically accurate (no assumptions).
5. Briefly explain personality traits based on Lagna, Moon sign, and Sun sign.
6. Clearly mention the zodiac signs in both Sanskrit/Hindi and English (e.g., Makar/Capricorn).

Important rules:
- Do NOT use Western (tropical) astrology. ONLY Vedic sidereal calculations.
- Use correct timezone and coordinates of the birthplace.
- If any birth data is missing, ask before proceeding.
- Never guess or assume birth details.

CORRECT VEDIC SURYA RASHI DATES (Lahiri Ayanamsa - sidereal):
- Mesh (Aries): April 14 - May 14
- Vrishabh (Taurus): May 15 - June 14
- Mithun (Gemini): June 15 - July 14
- Kark (Cancer): July 15 - August 14
- Simha (Leo): August 15 - September 15
- Kanya (Virgo): September 16 - October 15
- Tula (Libra): October 16 - November 14
- Vrishchik (Scorpio): November 15 - December 14
- Dhanu (Sagittarius): December 15 - January 13
- Makar (Capricorn): January 14 - February 11
- Kumbh (Aquarius): February 12 - March 12
- Meen (Pisces): March 13 - April 13

RASHI vs SURYA RASHI:
- Rashi = MOON SIGN (primary in Vedic) - needs exact birth time and place
- Surya Rashi = Sun Sign
- Always distinguish clearly. Never give Sun Sign when asked for Rashi.

VERIFIED EXAMPLE:
- 29 Jan 1995, 6:30 AM IST, Chennai: Surya Rashi = Makar (Capricorn), Moon Nakshatra = Mula (in Dhanu), Lagna = Makar
- 28 Nov 1995: Surya Rashi = Vrishchik (Scorpio)

2026 PLANETARY TRANSITS (Gochar):
- Shani (Saturn): Kumbh Rashi
- Guru (Jupiter): Mithun until May 2026, then Kark
- Rahu: Meen Rashi, Ketu: Kanya Rashi

ADDITIONAL EXPERTISE:
- Vimshottari Dasha: Calculate current Mahadasha and Antardasha for 2026
- Tarot: Draw 3 cards Past/Present/Future from Major Arcana with deep interpretation
- Prashna Kundli: Answer specific question with Yes/No and detailed explanation
- Numerology: Janm Ank, Bhagya Ank, Naam Ank with lucky numbers/colors/days
- Vivah Milan: All 8 Kootas, score out of 36, Mangal Dosha check
- Muhurta: Best dates/times from Panchang for events
- Ratna Shastra: Gemstone based on Lagna with mantra and wearing instructions

STYLE: Warm, wise, mystical. Use Sanskrit terms with Hindi/English explanation. Reply in same language as user. Keep 3-5 paragraphs. End every response with: "Note: Jyotish aatmik margdarshan ke liye hai. Apne vivek se nirnay lein."`;

app.post('/chat', async function(req, res) {
  try {
    const messages = req.body.messages;
    const user_id = req.body.user_id;
    const plan = req.body.plan;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    if (user_id && plan === 'free') {
      const users = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date,plan');
      if (users && users.length > 0) {
        const user = users[0];
        const today = new Date().toISOString().split('T')[0];
        if (user.last_reading_date === today && user.readings_today >= 3) {
          return res.status(429).json({ error: 'Aaj ki 3 free readings complete ho gayi! Rs 199/month mein upgrade karein unlimited readings ke liye.' });
        }
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55 second timeout
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: messages
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error ? data.error.message : 'API Error' });
    }

    if (user_id && plan === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const users = await supabase('users', 'GET', null, '?id=eq.' + user_id + '&select=readings_today,last_reading_date');
      if (users && users.length > 0) {
        const u = users[0];
        const count = u.last_reading_date === today ? (u.readings_today || 0) + 1 : 1;
        await supabase('users', 'PATCH', { readings_today: count, last_reading_date: today }, '?id=eq.' + user_id);
      }
    }

    res.json({ reply: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});


// KEEP ALIVE - ping every 14 minutes to prevent Render spin down
const SELF_URL = 'https://jyotishai-backend.onrender.com';
setInterval(async function() {
  try {
    await fetch(SELF_URL + '/ping');
    console.log('Keep alive ping sent');
  } catch(e) {
    console.log('Keep alive failed:', e.message);
  }
}, 14 * 60 * 1000); // 14 minutes

app.get('/ping', function(req, res) {
  res.json({ status: 'alive', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('JyotishAI server running on port ' + PORT);
});
