import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- Database Connection (PostgreSQL for Supabase) ---
// Note: Render's Free Tier doesn't support IPv6.
// To fix this, we'll ensure we use the Session/Transaction mode pooler address from Supabase.
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect()
  .then(() => console.log('Connected to Supabase (PostgreSQL)'))
  .catch(err => {
    console.error('Supabase connection error:', err);
    // If connection fails, we don't want to crash the whole server, 
    // but we should log clearly why it failed.
  });

// --- Database Initialization (Create Tables) ---
const initDb = async () => {
    try {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS accounts (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    balance INTEGER DEFAULT 0,
                    role TEXT CHECK (role IN ('user', 'admin')) DEFAULT 'user'
                );
            `);
            
            const res = await client.query('SELECT COUNT(*) FROM accounts');
            if (parseInt(res.rows[0].count) === 0) {
                await client.query(`
                    INSERT INTO accounts (username, password, balance, role) VALUES
                    ('admin', 'admin123', 0, 'admin'),
                    ('Dragon', 'password123', 50000, 'user'),
                    ('Lucky', 'password123', 15000, 'user');
                `);
                console.log('Seeded default accounts');
            }
        } finally {
            client.release();
        }
    } catch (e) {
        console.error("Database init failed:", e.message);
    }
};
initDb();

// --- Middleware ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(bodyParser.json());

// --- Utilities (Temporary Memory for Active Rooms) ---
let rooms = [];
let roomGames = {}; 

const getMaskedGame = (game, askerId) => {
    if (!game || game.phase === 'NONE') return { phase: 'NONE' };
    const isShowdown = game.phase === 'SHOWDOWN' || game.phase === 'RESULT' || game.phase === 'CLEANUP';
    const maskedPlayers = game.players.map(p => {
        const canSee = isShowdown || p.id === askerId;
        return { ...p, hand: canSee ? p.hand : p.hand.map(() => ({ rank: 0, suit: 'hidden' })) };
    });
    return { ...game, players: maskedPlayers, deck: [] };
};

const createDeck = () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    let deck = [];
    for (const suit of suits) { for (const rank of ranks) { deck.push({ suit, rank }); } }
    return deck.sort(() => Math.random() - 0.5);
};

const calculateScore = (hand) => {
    if (!hand || hand.length === 0) return 0;
    const total = hand.reduce((sum, card) => {
        if (!card) return sum;
        const value = card.rank >= 10 ? 0 : card.rank;
        return sum + value;
    }, 0);
    return total % 10;
};

const calculateMultiplier = (hand) => {
    if (!hand || hand.length < 2 || hand.some(c => !c)) return 1;
    if (hand.length === 2) {
      if (hand[0].rank === hand[1].rank || hand[0].suit === hand[1].suit) return 2;
    } else if (hand.length === 3) {
      if ((hand[0].rank === hand[1].rank && hand[1].rank === hand[2].rank) ||
          (hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit)) return 3;
    }
    return 1;
};

const resolveRound = async (game) => {
    const house = game.players.find(p => p.id === game.houseId);
    const hScore = calculateScore(house.hand);
    const hMult = calculateMultiplier(house.hand); 
    let houseNetWin = 0;
    
    for (const p of game.players) {
        if (p.id === game.houseId) continue;
        const pScore = calculateScore(p.hand);
        if (pScore > hScore) {
            const mult = calculateMultiplier(p.hand);
            const payoutFromHouse = p.currentBet * mult;
            const actualWinFromPot = Math.min(payoutFromHouse, game.pot);
            const netPayout = actualWinFromPot - Math.floor(actualWinFromPot * 0.01);
            game.pot -= actualWinFromPot;
            p.balance += (p.currentBet + netPayout);
            p.lastWin = netPayout;
            houseNetWin -= actualWinFromPot;
        } else {
            const totalGain = p.currentBet * hMult;
            if (hMult > 1) p.balance -= (totalGain - p.currentBet);
            game.pot += totalGain;
            p.lastWin = -totalGain;
            houseNetWin += totalGain;
        }
        try {
            await pool.query('UPDATE accounts SET balance = $1 WHERE username = $2', [p.balance, p.id]);
        } catch (e) { console.error("Balance update failed for", p.id, e.message); }
    }
    house.lastWin = houseNetWin;
    game.message = "ရလဒ်များ ထွက်ပေါ်လာပါပြီ!";
    game.phase = 'RESULT';
    setTimeout(() => nextRound(game), 4000);
};

const nextRound = async (game) => {
    if (game.pot <= 0) rotateHouse(game, "ဒိုင်ရှိငွေ ကုန်သွားပါပြီ! ဒိုင်အသစ် ပြောင်းနေသည်...");
    else if (game.currentRound >= 5) {
        const house = game.players.find(p => p.id === game.houseId);
        const netPot = game.pot - Math.floor(game.pot * 0.05);
        house.balance += netPot;
        try {
            await pool.query('UPDATE accounts SET balance = $1 WHERE username = $2', [house.balance, house.id]);
        } catch (e) { console.error("House balance update failed", e.message); }
        game.pot = 0;
        rotateHouse(game, "၅ ပွဲ ပြည့်သွားပါပြီ! ဒိုင်မှ လက်ကျန်ငွေ အားလုံး သိမ်းယူသည် (၅% ဝန်ဆောင်ခ နှုတ်ပြီး)။");
    } else {
        game.currentRound++; game.phase = 'BETTING'; game.bettingTimer = 15; game.deck = createDeck(); 
        game.players.forEach(pl => { 
            pl.hand = []; pl.currentBet = 0; pl.hasStayed = false; pl.lastWin = undefined;
            if (pl.id.startsWith('AI-')) {
                pl.currentBet = game.fee - Math.floor(game.fee * 0.01);
                pl.balance -= game.fee; pl.isReady = true;
            } else pl.isReady = false;
        });
        game.message = `ပွဲစဉ် ${game.currentRound} စတင်ပါပြီ`;
    }
};

const rotateHouse = async (game, msg) => {
    const currentIdx = game.players.findIndex(p => p.id === game.houseId);
    const nextIdx = (currentIdx + 1) % game.players.length;
    const nextHouse = game.players[nextIdx];
    if (nextHouse.id === game.firstHouseId) {
        game.message = "ပြိုင်ပွဲစဉ် ပြီးဆုံးပါပြီ! လော်ဘီသို့ ပြန်သွားနေသည်...";
        game.phase = 'CLEANUP'; 
        setTimeout(() => { rooms = rooms.filter(r => r.name !== game.roomName); delete roomGames[game.roomName]; }, 10000);
        return;
    }
    game.houseId = nextHouse.id; game.pot = game.fee; game.currentRound = 1; game.phase = 'BETTING'; game.bettingTimer = 15; game.deck = createDeck(); 
    game.message = `${msg} ဒိုင်အသစ်- ${nextHouse.name}`;
    for (const p of game.players) {
        if (p.id === game.houseId) {
            p.balance -= game.fee;
            try {
                await pool.query('UPDATE accounts SET balance = $1 WHERE username = $2', [p.balance, p.id]);
            } catch (e) { console.error("Rotate house balance update failed", e.message); }
        }
        p.hand = []; p.currentBet = 0; p.hasStayed = false; p.lastWin = undefined;
        if (p.id.startsWith('AI-')) {
            p.currentBet = game.fee - Math.floor(game.fee * 0.01);
            p.balance -= game.fee; p.isReady = true;
        } else p.isReady = false;
    }
};

// --- Account API ---
app.get('/api/accounts', async (req, res) => { 
    try {
        const result = await pool.query('SELECT * FROM accounts'); 
        res.json(result.rows); 
    } catch (e) { res.status(500).json({message: "Fetch accounts failed"}); }
});

app.post('/api/accounts', async (req, res) => {
    const { username, password, balance, role } = req.body;
    try {
        const result = await pool.query('INSERT INTO accounts (username, password, balance, role) VALUES ($1, $2, $3, $4) RETURNING *', [username, password, balance, role]);
        res.json(result.rows[0]);
    } catch (e) { res.status(400).json({message:'Account exists or DB error'}); }
});

app.put('/api/accounts/:username', async (req, res) => {
    const { username } = req.params;
    const { balance, password } = req.body;
    try {
        let query = 'UPDATE accounts SET balance = COALESCE($1, balance), password = COALESCE($2, password) WHERE username = $3 RETURNING *';
        const result = await pool.query(query, [balance, password, username]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({message: "Update failed"}); }
});

// --- Rooms API ---
app.get('/api/rooms', (req, res) => res.json(rooms));
app.post('/api/rooms', (req, res) => {
    const r = req.body; 
    if (rooms.some(rm => rm.name === r.name)) return res.status(400).json({message: 'Room exists'});
    const newRoom = { ...r, id: `r-${Date.now()}`, hostId: r.creator.id, players: [r.creator], status: 'waiting' };
    rooms.push(newRoom); res.json(newRoom);
});
app.post('/api/rooms/:name/join', async (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (!room || room.status === 'playing' || room.players.length >= 5) return res.status(400).json({message: 'Join failed'});
    try {
        const playerAcc = await pool.query('SELECT * FROM accounts WHERE username = $1', [req.body.player.id]);
        if (playerAcc.rows[0] && playerAcc.rows[0].balance < room.fee) return res.status(400).json({message: `Insufficient balance.`});
        if (!room.players.some(p => p.id === req.body.player.id)) room.players.push(req.body.player);
        res.json(room);
    } catch (e) { res.status(500).json({message: "Join error"}); }
});
app.post('/api/rooms/:name/bot', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (room && room.players.length < 5) {
        const botId = `AI-${Math.floor(Math.random() * 9000)}`;
        room.players.push({ id: botId, name: botId, isReady: true });
        res.json(room);
    } else res.status(400).json({message: 'Cannot add bot'});
});
app.post('/api/rooms/:name/leave', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (room) {
        if (room.status === 'playing') return res.status(400).json({message: 'Cannot leave while playing'});
        room.players = room.players.filter(p => p.id !== req.body.playerId);
        if (room.players.length === 0) { rooms = rooms.filter(r => r.name !== roomName); delete roomGames[roomName]; }
    }
    res.json({msg:'ok'});
});

// --- Game Engine API ---
app.post('/api/rooms/:name/start', async (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (!room || room.players.length < 2) return res.status(400).json({message:'Needs 2+ players'});
    room.status = 'playing';
    try {
        const players = await Promise.all(room.players.map(async (p) => {
            const acc = await pool.query('SELECT * FROM accounts WHERE username = $1', [p.id]);
            return { ...p, balance: acc.rows[0] ? acc.rows[0].balance : 10000, hand: [], currentBet: 0, hasStayed: false };
        }));
        const dealerIdx = Math.floor(Math.random() * players.length);
        const houseId = players[dealerIdx].id;
        roomGames[roomName] = {
            roomName, players, houseId, firstHouseId: houseId, fee: room.fee,
            pot: room.fee, currentRound: 1, phase: 'BETTING', 
            bettingTimer: 15, decisionTimer: 15, activePlayerIndex: 0, deck: createDeck(),
            message: `ပွဲစဉ် ၁- ${players[dealerIdx].name} သည် ဒိုင်ဖြစ်သည်!`
        };
        const dealerAcc = await pool.query('UPDATE accounts SET balance = balance - $1 WHERE username = $2 RETURNING *', [room.fee, houseId]);
        if (dealerAcc.rows[0]) players.find(p => p.id === houseId).balance = dealerAcc.rows[0].balance;
        players.forEach(p => {
            if (p.id.startsWith('AI-')) {
                p.currentBet = room.fee - Math.floor(room.fee * 0.01);
                p.balance -= room.fee; p.isReady = true;
            } else p.isReady = false;
        });
        res.json(getMaskedGame(roomGames[roomName], houseId));
    } catch (e) { res.status(500).json({message: "Game start failed"}); }
});

app.get('/api/rooms/:name/game', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    res.json(getMaskedGame(roomGames[roomName], req.query.playerId));
});

app.post('/api/rooms/:name/bet', async (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    const { playerId, amount } = req.body;
    if (!game) return res.status(404).send();
    const p = game.players.find(p => p.id === playerId);
    if (p && !p.isReady && p.id !== game.houseId) {
        p.currentBet = amount - Math.floor(amount * 0.01);
        p.balance -= amount; p.isReady = true;
        try {
            await pool.query('UPDATE accounts SET balance = $1 WHERE username = $2', [p.balance, playerId]);
        } catch (e) { console.error("Bet update failed", e.message); }
        if (game.players.filter(pl => pl.id !== game.houseId).every(pl => pl.isReady)) {
            game.phase = 'DEALING';
            game.message = 'လောင်းကြေးများတင်ပြီးပါပြီ! ကတ်များဝေနေသည်...';
            game.players.forEach(pl => { pl.hand = [game.deck.pop(), game.deck.pop()]; });
            const house = game.players.find(p => p.id === game.houseId);
            const hScore = calculateScore(house.hand);
            if (hScore >= 8) {
                game.phase = 'SHOWDOWN'; game.message = `ဒိုင်တွင် ${hScore} ပေါက်နေသည်! ပွဲပြီးပြီ။`;
                setTimeout(() => resolveRound(game), 3000);
            } else {
                game.phase = 'DECISION';
                game.activePlayerIndex = game.players.findIndex(pl => pl.id !== game.houseId);
                const activePlayer = game.players[game.activePlayerIndex];
                game.message = `${activePlayer.name} ဆုံးဖြတ်နေသည်...`;
                game.decisionTimer = 15;
            }
        }
    }
    res.json(getMaskedGame(game, playerId));
});

app.post('/api/rooms/:name/decision', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    const { playerId, decision } = req.body;
    if (!game) return res.status(404).send();
    const p = game.players[game.activePlayerIndex];
    if (p && p.id === playerId) {
        if (decision === 'draw' && p.hand.length < 3) p.hand.push(game.deck.pop());
        p.hasStayed = true;
        const remaining = game.players.filter(pl => pl.id !== game.houseId && !pl.hasStayed);
        if (remaining.length > 0) {
            let next = (game.activePlayerIndex + 1) % game.players.length;
            while (game.players[next].id === game.houseId || game.players[next].hasStayed) { next = (next + 1) % game.players.length; }
            game.activePlayerIndex = next;
            game.message = `${game.players[next].name} ဆုံးဖြတ်နေသည်...`;
            game.decisionTimer = 15;
        } else if (p.id !== game.houseId) {
            game.activePlayerIndex = game.players.findIndex(pl => pl.id === game.houseId);
            game.message = `${game.players[game.activePlayerIndex].name} (ဒိုင်) ဆုံးဖြတ်နေသည်...`;
            game.decisionTimer = 15;
        } else {
            game.phase = 'SHOWDOWN'; game.message = "ကတ်များအားလုံး ဖွင့်ကြည့်မည်...";
            setTimeout(() => resolveRound(game), 3000);
        }
    }
    res.json(getMaskedGame(game, playerId));
});

// --- Game Loop Timer ---
setInterval(() => {
    Object.keys(roomGames).forEach(async (roomName) => {
        const game = roomGames[roomName];
        if (!game || ['NONE', 'RESULT', 'CLEANUP'].includes(game.phase)) return;
        if (game.phase === 'BETTING') {
            game.bettingTimer--;
            if (game.bettingTimer <= 0) {
                for (const p of game.players) {
                    if (p.id !== game.houseId && !p.isReady) {
                        p.currentBet = game.fee - Math.floor(game.fee * 0.01);
                        p.balance -= game.fee; p.isReady = true;
                        try {
                            await pool.query('UPDATE accounts SET balance = $1 WHERE username = $2', [p.balance, p.id]);
                        } catch (e) { console.error("Auto bet balance update failed", e.message); }
                    }
                }
                game.phase = 'DEALING'; game.message = 'အချိန်စေ့သွားပါပြီ! ကတ်များဝေနေသည်...';
                game.players.forEach(pl => pl.hand = [game.deck.pop(), game.deck.pop()]);
                const house = game.players.find(p => p.id === game.houseId);
                const hScore = calculateScore(house.hand);
                setTimeout(() => {
                    if (hScore >= 8) {
                        game.phase = 'SHOWDOWN'; game.message = `ဒိုင်တွင် ${hScore} ပေါက်နေသည်! ပွဲပြီးပြီ။`;
                        setTimeout(() => resolveRound(game), 3000);
                    } else {
                        game.phase = 'DECISION';
                        game.activePlayerIndex = game.players.findIndex(pl => pl.id !== game.houseId);
                        const activePlayer = game.players[game.activePlayerIndex];
                        game.message = `${activePlayer.name} ဆုံးဖြတ်နေသည်...`;
                        game.decisionTimer = 15;
                    }
                }, 2000);
            }
        } else if (game.phase === 'DECISION') {
            game.decisionTimer--;
            if (game.decisionTimer <= 0) {
                const p = game.players[game.activePlayerIndex];
                if (p) {
                    p.hasStayed = true;
                    const remaining = game.players.filter(pl => pl.id !== game.houseId && !pl.hasStayed);
                    if (remaining.length > 0) {
                        let next = (game.activePlayerIndex + 1) % game.players.length;
                        while (game.players[next].id === game.houseId || game.players[next].hasStayed) { next = (next + 1) % game.players.length; }
                        game.activePlayerIndex = next; game.message = `${game.players[next].name} ဆုံးဖြတ်နေသည်...`;
                    } else if (p.id !== game.houseId) {
                        game.activePlayerIndex = game.players.findIndex(pl => pl.id === game.houseId);
                        game.message = `${game.players[game.activePlayerIndex].name} (ဒိုင်) ဆုံးဖြတ်နေသည်...`;
                    } else {
                        game.phase = 'SHOWDOWN'; game.message = "အချိန်စေ့သွားပါပြီ! ကတ်များ ဖွင့်ကြည့်မည်...";
                        setTimeout(() => resolveRound(game), 3000);
                    }
                }
            }
        }
    });
}, 1000);

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
