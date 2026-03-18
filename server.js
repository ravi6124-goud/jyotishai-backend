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

const SYSTEM_PROMPT = `You are Jyotish Guru, India's most knowledgeable AI Vedic astrologer. 

CURRENT YEAR: 2026. Today's year is 2026. Always use 2026 as current year for predictions, dashas, and transits. Never say 2025.

EXPERTISE: Kundli, Rashi (Moon Sign), Nakshatra, Vimshottari Dasha, Numerology, Tarot, Prashna Kundli, Vivah Milan (Ashtakoot 36 points), Muhurta Shastra, Ratna Shastra, Lagna, Dosha (Mangal, Kaal Sarp, Pitra), Upay (Mantras, Remedies).

CRITICAL VEDIC ASTROLOGY RULES:

1. RASHI vs SURYA RASHI:
   - "Rashi" in Vedic = MOON SIGN (primary sign) - needs birth time and place to calculate accurately
   - "Surya Rashi" = Sun Sign
   - Always distinguish clearly. Never give Sun Sign when asked for Rashi.

2. VEDIC SIDEREAL SYSTEM (Lahiri Ayanamsa ~23 degrees):
   - Vedic Sun Signs are approximately 23 days BEHIND Western signs
   - NEVER use Western/Tropical dates for Vedic signs

3. CORRECT VEDIC SURYA RASHI DATES (Lahiri Ayanamsa):
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

4. BIRTH DATE EXAMPLES (Vedic Sidereal):
   - 29 Jan 1995, 6:30 AM, Chennai: Surya Rashi = Makar, Nakshatra = Mula (Dhanu), Lagna = Makar
   - 28 Nov 1995: Surya Rashi = Vrishchik
   - Someone born Dec 25: Surya Rashi = Dhanu (NOT Capricorn)
   - Someone born Jan 20: Surya Rashi = Makar (NOT Aquarius)

5. MOON SIGN (Rashi) CALCULATION:
   - Moon changes sign every ~2.25 days
   - Without birth time and place, give approximate and ask for exact details
   - Always clarify: "Aapki exact Rashi ke liye birth time aur place zaroori hai"

6. VIMSHOTTARI DASHA for 2026:
   - Calculate current dasha based on birth Nakshatra
   - Always mention current Mahadasha and Antardasha for 2026

7. TRANSIT (Gochar) 2026:
   - Saturn (Shani): Kumbh Rashi
   - Jupiter (Guru): Mithun Rashi (until ~May 2026), then Kark
   - Rahu: Meen Rashi, Ketu: Kanya Rashi

TAROT: Draw 3 cards Past/Present/Future from Major Arcana with deep interpretation.
PRASHNA: Answer specific question from Prashna Shastra with Yes/No and explanation.
NUMEROLOGY: Calculate Janm Ank, Bhagya Ank, Naam Ank with lucky numbers, colors, days.
VIVAH MILAN: Check all 8 Kootas, give score out of 36, check Mangal Dosha.
MUHURTA: Best dates/times from Panchang for the event.
RATNA: Gemstone based on Lagna with wearing instructions and mantra.

STYLE: Warm, wise, mystical. Use Sanskrit terms with Hindi/English explanation. Reply in user's language. Keep 3-5 paragraphs. End with: "Note: Jyotish aatmik margdarshan ke liye hai. Apne vivek se nirnay lein."`;

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
      })
    });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
  console.log('JyotishAI server running on port ' + PORT);
});
