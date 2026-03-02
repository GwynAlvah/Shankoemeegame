import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- Database Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shankoe-mee';

// --- Schemas & Models ---
const accountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
});
const Account = mongoose.model('Account', accountSchema);

// Seed default accounts if empty
const seedAccounts = async () => {
    try {
        const count = await Account.countDocuments();
        if (count === 0) {
            await Account.create([
                { username: 'admin', password: 'admin123', balance: 0, role: 'admin' },
                { username: 'Dragon', password: 'password123', balance: 50000, role: 'user' },
                { username: 'Lucky', password: 'password123', balance: 15000, role: 'user' },
            ]);
            console.log('Seeded default accounts');
        }
    } catch (e) {
        console.error("Seeding failed", e);
    }
};

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedAccounts();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    // On Render, we want to see the error, but maybe not crash immediately 
    // if it's a transient network issue. However, status 1 helps Render logs.
    setTimeout(() => process.exit(1), 5000); 
  });

// --- Middleware ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(bodyParser.json());

// --- Utilities (Temporary Memory for Active Rooms) ---
let rooms = [];
let roomGames = {}; 

const getMaskedGame = (game, askerId) => {
    if (!game || game.phase === 'NONE') return { phase: 'NONE' };
    const isShowdown = game.phase === 'SHOWDOWN' || game.phase === 'RESULT' || game.phase === 'CLEANUP';
    const maskedPlayers = game.players.map(p => {
        const canSee = isShowdown || p.id === askerId;
        return {
            ...p,
            hand: canSee ? p.hand : p.hand.map(() => ({ rank: 0, suit: 'hidden' }))
        };
    });
    return { ...game, players: maskedPlayers, deck: [] };
};

const createDeck = () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    let deck = [];
    for (const suit of suits) {
        for (const rank of ranks) { deck.push({ suit, rank }); }
    }
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
    if (!hand || hand.length < 2) return 1;
    if (hand.some(c => !c)) return 1;
    if (hand.length === 2) {
      if (hand[0].rank === hand[1].rank || hand[0].suit === hand[1].suit) return 2;
    } else if (hand.length === 3) {
      if ((hand[0].rank === hand[1].rank && hand[1].rank === hand[2].rank) ||
          (hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit)) return 3;
    }
    return 1;
};

const resolveRound = (game) => {
    const house = game.players.find(p => p.id === game.houseId);
    const hScore = calculateScore(house.hand);
    const hMult = calculateMultiplier(house.hand); 
    let houseNetWin = 0;
    
    game.players.forEach(async (p) => {
        if (p.id === game.houseId) return;
        const pScore = calculateScore(p.hand);
        
        if (pScore > hScore) {
            const mult = calculateMultiplier(p.hand);
            const payoutFromHouse = p.currentBet * mult;
            const actualWinFromPot = Math.min(payoutFromHouse, game.pot);
            const winFee = Math.floor(actualWinFromPot * 0.01);
            const netPayout = actualWinFromPot - winFee;
            game.pot -= actualWinFromPot;
            p.balance += (p.currentBet + netPayout);
            p.lastWin = netPayout;
            houseNetWin -= actualWinFromPot;
        } else {
            const baseGain = p.currentBet;
            const totalGain = baseGain * hMult;
            if (hMult > 1) { p.balance -= (totalGain - baseGain); }
            game.pot += totalGain;
            p.lastWin = -totalGain;
            houseNetWin += totalGain;
        }
        await Account.findOneAndUpdate({ username: p.id }, { balance: p.balance });
    });

    house.lastWin = houseNetWin;
    game.message = "ရလဒ်များ ထွက်ပေါ်လာပါပြီ!";
    game.phase = 'RESULT';
    setTimeout(() => nextRound(game), 4000);
};

const nextRound = async (game) => {
    if (game.pot <= 0) {
        rotateHouse(game, "ဒိုင်ရှိငွေ ကုန်သွားပါပြီ! ဒိုင်အသစ် ပြောင်းနေသည်...");
    } else if (game.currentRound >= 5) {
        const house = game.players.find(p => p.id === game.houseId);
        const houseFee = Math.floor(game.pot * 0.05);
        const netPot = game.pot - houseFee;
        house.balance += netPot;
        await Account.findOneAndUpdate({ username: house.id }, { balance: house.balance });
        game.pot = 0;
        rotateHouse(game, "၅ ပွဲ ပြည့်သွားပါပြီ! ဒိုင်မှ လက်ကျန်ငွေ အားလုံး သိမ်းယူသည် (၅% ဝန်ဆောင်ခ နှုတ်ပြီး)။");
    } else {
        game.currentRound++;
        game.phase = 'BETTING';
        game.bettingTimer = 15;
        game.deck = createDeck(); 
        game.players.forEach(pl => { 
            pl.hand = []; pl.currentBet = 0; pl.hasStayed = false; pl.lastWin = undefined;
            if (pl.id.startsWith('AI-')) {
                const amount = game.fee;
                pl.currentBet = amount - Math.floor(amount * 0.01);
                pl.balance -= amount;
                pl.isReady = true;
            } else { pl.isReady = false; }
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
    game.houseId = nextHouse.id;
    game.pot = game.fee; 
    game.currentRound = 1;
    game.phase = 'BETTING';
    game.bettingTimer = 15;
    game.deck = createDeck(); 
    game.message = `${msg} ဒိုင်အသစ်- ${nextHouse.name}`;
    game.players.forEach(async (p) => {
        if (p.id === game.houseId) {
            p.balance -= game.fee;
            await Account.findOneAndUpdate({ username: p.id }, { balance: p.balance });
        }
        p.hand = []; p.currentBet = 0; p.hasStayed = false; p.lastWin = undefined;
        if (p.id.startsWith('AI-')) {
            const amount = game.fee;
            p.currentBet = amount - Math.floor(amount * 0.01);
            p.balance -= amount;
            p.isReady = true;
        } else { p.isReady = false; }
    });
};

// --- Account API ---
app.get('/api/accounts', async (req, res) => res.json(await Account.find()));
app.post('/api/accounts', async (req, res) => {
    const { username, password, balance, role } = req.body;
    const exists = await Account.findOne({ username });
    if (exists) return res.status(400).json({message:'Account exists'});
    const newAcc = await Account.create({ username, password, balance, role });
    res.json(newAcc);
});
app.put('/api/accounts/:username', async (req, res) => {
    const { username } = req.params;
    const updated = await Account.findOneAndUpdate({ username }, req.body, { new: true });
    res.json(updated);
});

// --- Rooms API ---
app.get('/api/rooms', (req, res) => res.json(rooms));
app.post('/api/rooms', (req, res) => {
    const r = req.body; 
    if (rooms.some(rm => rm.name === r.name)) return res.status(400).json({message: 'Room exists'});
    const newRoom = { ...r, id: `r-${Date.now()}`, hostId: r.creator.id, players: [r.creator], status: 'waiting' };
    rooms.push(newRoom);
    res.json(newRoom);
});
app.post('/api/rooms/:name/join', async (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (!room) return res.status(404).json({message: 'Room not found'});
    if (room.status === 'playing') return res.status(400).json({message: 'Game in progress'});
    if (room.players.length >= 5) return res.status(400).json({message: 'Room full'});
    const playerAcc = await Account.findOne({ username: req.body.player.id });
    if (playerAcc && playerAcc.balance < room.fee) return res.status(400).json({message: `Insufficient balance.`});
    if (!room.players.some(p => p.id === req.body.player.id)) room.players.push(req.body.player);
    res.json(room);
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
    const players = await Promise.all(room.players.map(async (p) => {
        const acc = await Account.findOne({ username: p.id });
        return { ...p, balance: acc ? acc.balance : 10000, hand: [], currentBet: 0, hasStayed: false };
    }));
    const dealerIdx = Math.floor(Math.random() * players.length);
    const houseId = players[dealerIdx].id;
    roomGames[roomName] = {
        roomName, players, houseId, firstHouseId: houseId, fee: room.fee,
        pot: room.fee, currentRound: 1, phase: 'BETTING', 
        bettingTimer: 15, decisionTimer: 15, activePlayerIndex: 0, deck: createDeck(),
        message: `ပွဲစဉ် ၁- ${players[dealerIdx].name} သည် ဒိုင်ဖြစ်သည်!`
    };
    const dealerAcc = await Account.findOneAndUpdate({ username: houseId }, { $inc: { balance: -room.fee } }, { new: true });
    if (dealerAcc) { players.find(p => p.id === houseId).balance = dealerAcc.balance; }
    players.forEach(p => {
        if (p.id.startsWith('AI-')) {
            const amount = room.fee; p.currentBet = amount - Math.floor(amount * 0.01);
            p.balance -= amount; p.isReady = true;
        } else p.isReady = false;
    });
    res.json(getMaskedGame(roomGames[roomName], houseId));
});

app.get('/api/rooms/:name/game', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    res.json(getMaskedGame(roomGames[roomName], req.query.playerId));
});

app.post('/api/rooms/:name/bet', async (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    const { playerId, amount } = req.body;
    const p = game.players.find(p => p.id === playerId);
    if (p && !p.isReady && p.id !== game.houseId) {
        const betFee = Math.floor(amount * 0.01);
        p.currentBet = amount - betFee;
        p.balance -= amount;
        p.isReady = true;
        await Account.findOneAndUpdate({ username: playerId }, { balance: p.balance });
        if (game.players.filter(pl => pl.id !== game.houseId).every(pl => pl.isReady)) {
            game.phase = 'DEALING';
            game.message = 'လောင်းကြေးများတင်ပြီးပါပြီ! ကတ်များဝေနေသည်...';
            game.players.forEach(pl => { pl.hand = [game.deck.pop(), game.deck.pop()]; });
            const house = game.players.find(p => p.id === game.houseId);
            const hScore = calculateScore(house.hand);
            if (hScore >= 8) {
                game.phase = 'SHOWDOWN';
                game.message = `ဒိုင်တွင် ${hScore} ပေါက်နေသည်! ပွဲပြီးပြီ။`;
                setTimeout(() => resolveRound(game), 3000);
            } else {
                game.phase = 'DECISION';
                game.activePlayerIndex = game.players.findIndex(pl => pl.id !== game.houseId);
                game.message = `${game.players[game.activePlayerIndex].name} ဆုံးဖြတ်နေသည်...`;
            }
        }
    }
    res.json(getMaskedGame(game, playerId));
});

app.post('/api/rooms/:name/decision', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    const { playerId, decision } = req.body;
    const p = game.players[game.activePlayerIndex];
    if (p && p.id === playerId) {
        if (decision === 'draw' && p.hand.length < 3) { p.hand.push(game.deck.pop()); }
        p.hasStayed = true;
        const remaining = game.players.filter(pl => pl.id !== game.houseId && !pl.hasStayed);
        if (remaining.length > 0) {
            let next = (game.activePlayerIndex + 1) % game.players.length;
            while (game.players[next].id === game.houseId || game.players[next].hasStayed) { next = (next + 1) % game.players.length; }
            game.activePlayerIndex = next;
            game.message = `${game.players[next].name} ဆုံးဖြတ်နေသည်...`;
        } else if (p.id !== game.houseId) {
            game.activePlayerIndex = game.players.findIndex(pl => pl.id === game.houseId);
            game.message = `${game.players[game.activePlayerIndex].name} (ဒိုင်) ဆုံးဖြတ်နေသည်...`;
        } else {
            game.phase = 'SHOWDOWN';
            game.message = "ကတ်များအားလုံး ဖွင့်ကြည့်မည်...";
            setTimeout(() => resolveRound(game), 3000);
        }
    }
    res.json(getMaskedGame(game, playerId));
});

// --- Game Loop Timer ---
setInterval(() => {
    Object.keys(roomGames).forEach(roomName => {
        const game = roomGames[roomName];
        if (!game || ['NONE', 'RESULT', 'CLEANUP'].includes(game.phase)) return;
        if (game.phase === 'BETTING') {
            game.bettingTimer--;
            if (game.bettingTimer <= 0) {
                game.players.forEach(async (p) => {
                    if (p.id !== game.houseId && !p.isReady) {
                        const amount = game.fee; 
                        p.currentBet = amount - Math.floor(amount * 0.01);
                        p.balance -= amount;
                        p.isReady = true;
                        await Account.findOneAndUpdate({ username: p.id }, { balance: p.balance });
                    }
                });
                game.phase = 'DEALING';
                game.message = 'အချိန်စေ့သွားပါပြီ! ကတ်များဝေနေသည်...';
                game.players.forEach(pl => pl.hand = [game.deck.pop(), game.deck.pop()]);
                const house = game.players.find(p => p.id === game.houseId);
                const hScore = calculateScore(house.hand);
                setTimeout(() => {
                    if (hScore >= 8) {
                        game.phase = 'SHOWDOWN';
                        game.message = `ဒိုင်တွင် ${hScore} ပေါက်နေသည်! ပွဲပြီးပြီ။`;
                        setTimeout(() => resolveRound(game), 3000);
                    } else {
                        game.phase = 'DECISION';
                        game.activePlayerIndex = game.players.findIndex(pl => pl.id !== game.houseId);
                        game.message = `${game.players[game.activePlayerIndex].name} ဆုံးဖြတ်နေသည်...`;
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
                        game.activePlayerIndex = next;
                        game.message = `${game.players[next].name} ဆုံးဖြတ်နေသည်...`;
                        game.decisionTimer = 15;
                    } else if (p.id !== game.houseId) {
                        game.activePlayerIndex = game.players.findIndex(pl => pl.id === game.houseId);
                        game.message = `${game.players[game.activePlayerIndex].name} (ဒိုင်) ဆုံးဖြတ်နေသည်...`;
                        game.decisionTimer = 15;
                    } else {
                        game.phase = 'SHOWDOWN';
                        game.message = "အချိန်စေ့သွားပါပြီ! ကတ်များ ဖွင့်ကြည့်မည်...";
                        setTimeout(() => resolveRound(game), 3000);
                    }
                }
            }
        }
    });
}, 1000);

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
