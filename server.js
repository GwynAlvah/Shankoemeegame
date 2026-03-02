import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// --- Utilities ---
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

// --- Game Logic Functions ---
const resolveRound = (game) => {
    const house = game.players.find(p => p.id === game.houseId);
    const hScore = calculateScore(house.hand);
    const hMult = calculateMultiplier(house.hand); 
    let houseNetWin = 0;
    
    game.players.forEach(p => {
        if (p.id === game.houseId) return;
        const pScore = calculateScore(p.hand);
        
        if (pScore > hScore) {
            const mult = calculateMultiplier(p.hand);
            const payoutFromHouse = p.currentBet * mult;
            const actualWinFromPot = Math.min(payoutFromHouse, game.pot);
            
            // 1% Fee on Player Winnings
            const winFee = Math.floor(actualWinFromPot * 0.01);
            const netPayout = actualWinFromPot - winFee;
            
            game.pot -= actualWinFromPot;
            p.balance += (p.currentBet + netPayout);
            p.lastWin = netPayout;
            houseNetWin -= actualWinFromPot;
        } else {
            // HOUSE WINS: Pot increases by player's bet * House's multiplier
            const baseGain = p.currentBet;
            const totalGain = baseGain * hMult;
            
            if (hMult > 1) {
                const extraCharge = totalGain - baseGain;
                p.balance -= extraCharge;
            }

            game.pot += totalGain;
            p.lastWin = -totalGain;
            houseNetWin += totalGain;
        }
        
        const acc = accounts.find(a => a.username === p.id);
        if (acc) acc.balance = p.balance;
    });

    house.lastWin = houseNetWin;
    game.message = "ရလဒ်များ ထွက်ပေါ်လာပါပြီ!";
    game.phase = 'RESULT';
    
    setTimeout(() => nextRound(game), 4000);
};

const nextRound = (game) => {
    if (game.pot <= 0) {
        rotateHouse(game, "ဒိုင်ရှိငွေ ကုန်သွားပါပြီ! ဒိုင်အသစ် ပြောင်းနေသည်...");
    } else if (game.currentRound >= 5) {
        // 5% Fee from the House player winning pot
        const house = game.players.find(p => p.id === game.houseId);
        const houseFee = Math.floor(game.pot * 0.05);
        const netPot = game.pot - houseFee;
        
        house.balance += netPot;
        const acc = accounts.find(a => a.username === house.id);
        if (acc) acc.balance = house.balance;
        
        game.pot = 0;
        rotateHouse(game, "၅ ပွဲ ပြည့်သွားပါပြီ! ဒိုင်မှ လက်ကျန်ငွေ အားလုံး သိမ်းယူသည် (၅% ဝန်ဆောင်ခ နှုတ်ပြီး)။");
    } else {
        game.currentRound++;
        game.phase = 'BETTING';
        game.bettingTimer = 15;
        game.deck = createDeck(); 
        game.players.forEach(pl => { 
            pl.hand = []; 
            pl.currentBet = 0; 
            pl.hasStayed = false; 
            pl.lastWin = undefined;

            if (pl.id.startsWith('AI-')) {
                const amount = game.fee;
                const betFee = Math.floor(amount * 0.01);
                pl.currentBet = amount - betFee;
                pl.balance -= amount;
                pl.isReady = true;
            } else {
                pl.isReady = false;
            }
        });
        game.message = `ပွဲစဉ် ${game.currentRound} စတင်ပါပြီ`;
    }
};

const rotateHouse = (game, msg) => {
    const currentIdx = game.players.findIndex(p => p.id === game.houseId);
    const nextIdx = (currentIdx + 1) % game.players.length;
    const nextHouse = game.players[nextIdx];
    
    if (nextHouse.id === game.firstHouseId) {
        game.message = "ပြိုင်ပွဲစဉ် ပြီးဆုံးပါပြီ! လော်ဘီသို့ ပြန်သွားနေသည်...";
        game.phase = 'CLEANUP'; 
        console.log(`Tournament finished. Room ${game.roomName} entering cleanup.`);
        setTimeout(() => {
            rooms = rooms.filter(r => r.name !== game.roomName);
            delete roomGames[game.roomName];
        }, 10000);
        return;
    }

    game.houseId = nextHouse.id;
    game.pot = game.fee; 
    game.currentRound = 1;
    game.phase = 'BETTING';
    game.bettingTimer = 15;
    game.deck = createDeck(); 
    game.message = `${msg} ဒိုင်အသစ်- ${nextHouse.name}`;
    
    game.players.forEach(p => {
        if (p.id === game.houseId) {
            p.balance -= game.fee;
            const acc = accounts.find(a => a.username === p.id);
            if (acc) acc.balance = p.balance;
        }
        p.hand = [];
        p.currentBet = 0;
        p.hasStayed = false;
        p.lastWin = undefined;

        if (p.id.startsWith('AI-')) {
            const amount = game.fee;
            const betFee = Math.floor(amount * 0.01);
            p.currentBet = amount - betFee;
            p.balance -= amount;
            p.isReady = true;
        } else {
            p.isReady = false;
        }
    });
};

// --- DB ---
let accounts = [
    { username: 'admin', password: 'admin123', balance: 0, role: 'admin' },
    { username: 'Dragon', password: 'password123', balance: 50000, role: 'user' },
    { username: 'Lucky', password: 'password123', balance: 15000, role: 'user' },
];

let rooms = [
    { id: 'r1', name: 'High Rollers', players: [{ id: 'Dragon', name: 'Dragon', isReady: true }], status: 'waiting', fee: 5000, hostId: 'Dragon' },
];

let roomGames = {}; 

let withdrawals = []; // { id, username, amount, method, details, status, date }

// --- Account API ---
app.get('/api/accounts', (req, res) => res.json(accounts));
app.post('/api/accounts', (req, res) => {
    const newAcc = req.body;
    if (accounts.some(a => a.username === newAcc.username)) return res.status(400).json({message:'Account exists'});
    accounts.push(newAcc); res.json(newAcc);
});
app.put('/api/accounts/:username', (req, res) => {
    const { username } = req.params;
    accounts = accounts.map(a => a.username === username ? { ...a, ...req.body } : a);
    res.json(accounts.find(a => a.username === username));
});

// --- Withdrawal API ---
app.get('/api/withdrawals', (req, res) => res.json(withdrawals));

app.post('/api/withdrawals', (req, res) => {
    const { username, amount, method, details } = req.body;
    const acc = accounts.find(a => a.username === username);
    
    if (!acc) return res.status(404).json({message: 'User not found'});
    if (acc.balance < amount) return res.status(400).json({message: 'Insufficient balance'});
    
    // Deduct balance immediately
    acc.balance -= amount;
    
    const newWithdrawal = {
        id: `w-${Date.now()}`,
        username,
        amount,
        method,
        details,
        status: 'pending',
        date: new Date().toISOString()
    };
    withdrawals.push(newWithdrawal);
    
    res.json({ withdrawal: newWithdrawal, newBalance: acc.balance });
});

app.post('/api/withdrawals/:id/action', (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const wdIndex = withdrawals.findIndex(w => w.id === id);
    
    if (wdIndex === -1) return res.status(404).json({message: 'Request not found'});
    const wd = withdrawals[wdIndex];
    
    if (wd.status !== 'pending') return res.status(400).json({message: 'Already processed'});
    
    if (action === 'approve') {
        wd.status = 'approved';
    } else if (action === 'reject') {
        wd.status = 'rejected';
        // Refund the user
        const acc = accounts.find(a => a.username === wd.username);
        if (acc) acc.balance += wd.amount;
    }
    
    res.json(wd);
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

app.post('/api/rooms/:name/join', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (!room) return res.status(404).json({message: 'Room not found'});
    if (room.status === 'playing') return res.status(400).json({message: 'Game in progress'});
    if (room.players.length >= 5) return res.status(400).json({message: 'Room full'});
    
    const playerAcc = accounts.find(a => a.username === req.body.player.id);
    if (playerAcc && playerAcc.balance < room.fee) {
        return res.status(400).json({message: `Insufficient balance. Min ${room.fee.toLocaleString()} required.`});
    }

    if (!room.players.some(p => p.id === req.body.player.id)) {
        room.players.push(req.body.player);
    }
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
        if (room.status === 'playing') return res.status(400).json({message: 'Cannot leave table while game is in progress'});
        room.players = room.players.filter(p => p.id !== req.body.playerId);
        if (room.players.length === 0 && !['High Rollers'].includes(roomName)) {
            rooms = rooms.filter(r => r.name !== roomName);
            delete roomGames[roomName];
        }
    }
    res.json({msg:'ok'});
});

// --- Game Engine API ---
app.post('/api/rooms/:name/start', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const room = rooms.find(r => r.name === roomName);
    if (!room) return res.status(404).json({message:'Room not found'});
    if (room.players.length < 2) return res.status(400).json({message:'Need 2+ players'});

    room.status = 'playing';
    const deck = createDeck();
    const players = room.players.map(p => {
        const acc = accounts.find(a => a.username === p.id);
        return {
            ...p,
            balance: acc ? acc.balance : 10000,
            hand: [], 
            currentBet: 0, 
            hasStayed: false
        };
    });

    const dealerIdx = Math.floor(Math.random() * players.length);
    const houseId = players[dealerIdx].id;

    roomGames[roomName] = {
        roomName, players, houseId, firstHouseId: houseId, fee: room.fee,
        pot: room.fee, currentRound: 1, phase: 'BETTING', 
        bettingTimer: 15, decisionTimer: 15, activePlayerIndex: 0, deck,
        message: `ပွဲစဉ် ၁- ${players[dealerIdx].name} သည် ဒိုင်ဖြစ်သည်!`
    };

    const dealerAcc = accounts.find(a => a.username === houseId);
    if (dealerAcc) {
        dealerAcc.balance -= room.fee;
        const dealerPlayer = players.find(p => p.id === houseId);
        if (dealerPlayer) dealerPlayer.balance = dealerAcc.balance;
    }

    players.forEach(p => {
        if (p.id.startsWith('AI-')) {
            const amount = room.fee;
            const betFee = Math.floor(amount * 0.01);
            p.currentBet = amount - betFee;
            p.balance -= amount;
            p.isReady = true;
        } else {
            p.isReady = false;
        }
    });

    res.json(getMaskedGame(roomGames[roomName], houseId));
});

app.get('/api/rooms/:name/game', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    res.json(getMaskedGame(game, req.query.playerId));
});

app.post('/api/rooms/:name/bet', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    if (!game || game.phase !== 'BETTING') return res.status(400).send();

    const { playerId, amount } = req.body;
    const p = game.players.find(p => p.id === playerId);
    if (p && !p.isReady && p.id !== game.houseId) {
        const betFee = Math.floor(amount * 0.01);
        p.currentBet = amount - betFee;
        p.balance -= amount;
        p.isReady = true;
        
        const acc = accounts.find(a => a.username === playerId);
        if (acc) acc.balance = p.balance;

        const playersToBet = game.players.filter(pl => pl.id !== game.houseId);
        if (playersToBet.every(pl => pl.isReady)) {
            game.phase = 'DEALING';
            game.message = 'လောင်းကြေးများတင်ပြီးပါပြီ! ကတ်များဝေနေသည်...';
            game.players.forEach(pl => { pl.hand = [game.deck.pop(), game.deck.pop()]; });

            const house = game.players.find(p => p.id === game.houseId);
            const hScore = calculateScore(house.hand);
            const isNatural = hScore >= 8;

            setTimeout(() => {
                if (isNatural) {
                    game.phase = 'SHOWDOWN';
                    game.message = `ဒိုင်တွင် ${hScore} ပေါက်နေသည်! ပွဲပြီးပြီ။`;
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
    }
    res.json(getMaskedGame(game, playerId));
});

app.post('/api/rooms/:name/decision', (req, res) => {
    const roomName = decodeURIComponent(req.params.name);
    const game = roomGames[roomName];
    if (!game || game.phase !== 'DECISION') return res.status(400).send();

    const { playerId, decision } = req.body;
    const p = game.players[game.activePlayerIndex];
    if (p && p.id === playerId) {
        if (decision === 'draw' && p.hand.length < 3) { p.hand.push(game.deck.pop()); }
        p.hasStayed = true;
        
        const remainingPlayers = game.players.filter(pl => pl.id !== game.houseId && !pl.hasStayed);
        if (remainingPlayers.length > 0) {
            let nextCandidateIdx = (game.activePlayerIndex + 1) % game.players.length;
            while (game.players[nextCandidateIdx].id === game.houseId || game.players[nextCandidateIdx].hasStayed) {
                nextCandidateIdx = (nextCandidateIdx + 1) % game.players.length;
            }
            game.activePlayerIndex = nextCandidateIdx;
            game.message = `${game.players[nextCandidateIdx].name} ဆုံးဖြတ်နေသည်...`;
            game.decisionTimer = 15;
        } else if (p.id !== game.houseId) {
            game.activePlayerIndex = game.players.findIndex(pl => pl.id === game.houseId);
            game.message = `${game.players[game.activePlayerIndex].name} (ဒိုင်) ဆုံးဖြတ်နေသည်...`;
            game.decisionTimer = 15;
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
        if (!game || game.phase === 'NONE' || game.phase === 'RESULT' || game.phase === 'CLEANUP') return;

        if (game.phase === 'BETTING') {
            game.bettingTimer--;
            if (game.bettingTimer <= 0) {
                game.players.forEach(p => {
                    if (p.id !== game.houseId && !p.isReady) {
                        const amount = game.fee; 
                        const betFee = Math.floor(amount * 0.01);
                        p.currentBet = amount - betFee;
                        p.balance -= amount;
                        p.isReady = true;
                        const acc = accounts.find(a => a.username === p.id);
                        if (acc) acc.balance = p.balance;
                    }
                });
                game.phase = 'DEALING';
                game.message = 'အချိန်စေ့သွားပါပြီ! ကတ်များဝေနေသည်...';
                game.players.forEach(pl => pl.hand = [game.deck.pop(), game.deck.pop()]);

                const house = game.players.find(p => p.id === game.houseId);
                const hScore = calculateScore(house.hand);
                const isNatural = hScore >= 8;

                setTimeout(() => {
                    if (isNatural) {
                        game.phase = 'SHOWDOWN';
                        game.message = `ဒိုင်တွင် ${hScore} ပေါက်နေသည်! ပွဲပြီးပြီ။`;
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
                        let nextCandidateIdx = (game.activePlayerIndex + 1) % game.players.length;
                        while (game.players[nextCandidateIdx].id === game.houseId || game.players[nextCandidateIdx].hasStayed) {
                            nextCandidateIdx = (nextCandidateIdx + 1) % game.players.length;
                        }
                        game.activePlayerIndex = nextCandidateIdx;
                        game.message = `${game.players[nextCandidateIdx].name} ဆုံးဖြတ်နေသည်...`;
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
