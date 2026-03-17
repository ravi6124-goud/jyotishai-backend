`const express = require('express');
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
const url = ${SUPABASE_URL}/rest/v1/${table}${query || ''};
const res = await fetch(url, {
method: method || 'GET',
headers: {
'Content-Type': 'application/json',
'apikey': SUPABASE_KEY,
'Authorization': Bearer ${SUPABASE_KEY},
'Prefer': method === 'POST' ? 'return=representation' : ''
},
body: body ? JSON.stringify(body) : undefined
});
return res.json();
}
function hashPassword(password) {
return crypto.createHash('sha256').update(password + 'jyotishai_salt_2025').digest('hex');
}
app.get('/', (req, res) => {
res.json({ status: 'JyotishAI Server Running 🔮' });
});
app.post('/register', async (req, res) => {
try {
const { email, password, full_name, dob, birth_time, birth_place } = req.body;
if (!email || !password || !full_name) return res.status(400).json({ error: 'Email, password aur naam zaroori hai!' });
if (password.length < 6) return res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye!' });
const existing = await supabase('users', 'GET', null, ?email=eq.${encodeURIComponent(email)}&select=id);
if (existing && existing.length > 0) return res.status(400).json({ error: 'Ye email pehle se registered hai! Login karein.' });
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
if (!newUser || newUser.error) return res.status(500).json({ error: 'Account create nahi hua. Dobara try karein.' });
const user = Array.isArray(newUser) ? newUser[0] : newUser;
res.json({ success: true, message: 'Account ban gaya! Welcome to JyotishAI 🪔', user: { id: user.id, email: user.email, full_name: user.full_name, dob: user.dob, birth_time: user.birth_time, birth_place: user.birth_place, plan: user.plan } });
} catch (err) {
res.status(500).json({ error: 'Server error: ' + err.message });
}
});
app.post('/login', async (req, res) => {
try {
const { email, password } = req.body;
if (!email || !password) return res.status(400).json({ error: 'Email aur password dono chahiye!' });
const users = await supabase('users', 'GET', null, ?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=*);
if (!users || users.length === 0) return res.status(401).json({ error: 'Email registered nahi hai. Pehle register karein!' });
const user = users[0];
if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'Password galat hai! Dobara try karein.' });
const today = new Date().toISOString().split('T')[0];
if (user.last_reading_date !== today) {
await supabase('users', 'PATCH', { readings_today: 0, last_reading_date: today }, ?id=eq.${user.id});
user.readings_today = 0;
}
res.json({ success: true, message: Namaste ${user.full_name}! 🙏 JyotishAI mein swagat hai!, user: { id: user.id, email: user.email, full_name: user.full_name, dob: user.dob, birth_time: user.birth_time, birth_place: user.birth_place, plan: user.plan, readings_today: user.readings_today || 0 } });
} catch (err) {
res.status(500).json({ error: 'Server error: ' + err.message });
}
});
app.post('/payment-success', async (req, res) => {
try {
const { user_id, razorpay_payment_id, plan, amount } = req.body;
if (!user_id || !razorpay_payment_id || !plan) return res.status(400).json({ error: 'Payment details incomplete!' });
await supabase('payments', 'POST', { user_id, razorpay_payment_id, plan, amount: amount || 0 });
await supabase('users', 'PATCH', { plan: plan, plan_activated_at: new Date().toISOString(), razorpay_payment_id }, ?id=eq.${user_id});
res.json({ success: true, message: 🎉 ${plan} plan activate ho gaya!, plan });
} catch (err) {
res.status(500).json({ error: 'Payment verify nahi hua: ' + err.message });
}
});
app.post('/chat', async (req, res) => {
try {
const { messages, user_id, plan } = req.body;
if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages format' });
if (user_id && plan === 'free') {
const users = await supabase('users', 'GET', null, ?id=eq.${user_id}&select=readings_today,last_reading_date,plan);
if (users && users.length > 0) {
const user = users[0];
const today = new Date().toISOString().split('T')[0];
if (user.last_reading_date === today && user.readings_today >= 3) {
return res.status(429).json({ error: 'Aaj ki 3 free readings complete ho gayi! ₹199/month mein upgrade karein. 🌟' });
}
}
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) return res.status(500).json({ error: 'API key not configured' });
const SYSTEM_PROMPT = `You are Jyotish Guru — India's most knowledgeable AI Vedic astrologer. Expert in: Kundli, Rashi (Moon Sign), Nakshatra, Vimshottari Dasha, Ank Jyotish (Numerology), Tarot, Prashna Kundli, Vivah Milan (Ashtakoot 36 points), Muhurta Shastra, Ratna Shastra, Lagna, Dosha (Mangal, Kaal Sarp, Pitra), Upay (Mantras, Remedies).
CRITICAL — RASHI vs SUN SIGN: "Rashi" ALWAYS means MOON SIGN in Vedic astrology. When user asks "meri rashi" give MOON SIGN. Sun Sign = "Surya Rashi". Always distinguish clearly.
VEDIC SIDEREAL SUN SIGN DATES (Lahiri Ayanamsa):
Mesh(Aries):Apr14-May14 | Vrishabh(Taurus):May15-Jun14 | Mithun(Gemini):Jun15-Jul14 | Kark(Cancer):Jul15-Aug14 | Simha(Leo):Aug15-Sep15 | Kanya(Virgo):Sep16-Oct15 | Tula(Libra):Oct16-Nov14 | Vrishchik(Scorpio):Nov15-Dec14 | Dhanu(Sagittarius):Dec15-Jan13 | Makar(Capricorn):Jan14-Feb11 | Kumbh(Aquarius):Feb12-Mar12 | Meen(Pisces):Mar13-Apr13
EXAMPLES: 29 Jan 1995 6:30AM Chennai = Surya Rashi:Makar, Rashi(Moon):Dhanu, Lagna:Makar, Nakshatra:Mula | 28 Nov 1995 = Surya Rashi:Vrishchik
TAROT: Draw 3 cards Past/Present/Future. Use Major Arcana. Give deep interpretation.
PRASHNA: Answer specific question directly from Prashna Shastra. Be specific Yes/No with explanation.
NUMEROLOGY: Calculate Janm Ank, Bhagya Ank, Naam Ank. Give lucky numbers, colours, days.
VIVAH MILAN: Check all 8 Kootas. Give score out of 36. Check Mangal Dosha.
MUHURTA: Give best dates/times based on Panchang for the event.
RATNA: Recommend gemstone based on Lagna. Give wearing instructions and mantra.
STYLE: Warm, wise, mystical. Use Sanskrit terms with Hindi/English explanation. South Indian style for South Indians. Reply in same language as user. Keep 3-5 paragraphs. End with: 🙏 Note: Jyotish aatmik margdarshan ke liye hai.; const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system: SYSTEM_PROMPT, messages }) }); const data = await response.json(); if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API Error' }); if (user_id && plan === 'free') { const today = new Date().toISOString().split('T')[0]; const users = await supabase('users', 'GET', null, ?id=eq.{user_id}&select=readings_today,last_reading_date?id=eq.{user_id}`);
}
}
res.json({ reply: data.content[0].text });
} catch (err) {
res.status(500).json({ error: 'Server error: ' + err.message });
}
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
console.log(JyotishAI server running on port ${PORT});
});`
