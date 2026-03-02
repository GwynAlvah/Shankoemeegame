import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './App.css';
import { Card as CardComponent } from './components/Card';
import { CoinIcon, WinOverlay, TreasureChestIcon, BronzeCoinIcon, SilverCoinIcon, GoldCoinIcon } from './components/Icons';
import { TablePattern, DealerButton, ThinkingIndicator } from './components/Decorative';
import { BettingModal } from './components/BettingModal';
import { GamePhase, PlayerType } from './game';
import type { Player } from './game';
import { GameRules } from './game/GameRules';

// --- Interfaces ---
interface Account { username: string; password: string; balance: number; role: 'user' | 'admin'; }
interface RoomPlayer { id: string; name: string; isReady: boolean; }
interface Room { id: string; name: string; players: RoomPlayer[]; status: 'waiting' | 'playing'; fee: number; hostId: string; }

// --- API Helpers ---
const API_URL = 'http://localhost:3001/api';
const fetchAccounts = async (): Promise<Account[]> => (await fetch(`${API_URL}/accounts`)).json();
const createAccount = async (account: Account) => (await fetch(`${API_URL}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account) })).json();
const updateAccount = async (username: string, updates: Partial<Account>) => (await fetch(`${API_URL}/accounts/${encodeURIComponent(username)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })).json();
const fetchRooms = async (): Promise<Room[]> => (await fetch(`${API_URL}/rooms`)).json();
const postRoom = async (roomData: any) => (await fetch(`${API_URL}/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(roomData) })).json();
const joinRoomApi = async (roomName: string, player: RoomPlayer) => (await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player }) })).json();
const leaveRoomApi = async (roomName: string, playerId: string) => (await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId }) })).json();
const addBotApi = async (roomName: string) => (await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/bot`, { method: 'POST' })).json();
const startGameApi = async (roomName: string) => (await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/start`, { method: 'POST' })).json();
const getRoomGameState = async (roomName: string, playerId: string) => {
    try {
        const resp = await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/game?playerId=${encodeURIComponent(playerId)}`);
        if (!resp.ok) return { phase: 'NONE' };
        return resp.json();
    } catch (e) {
        return { phase: 'NONE' };
    }
};
const placeBetApi = async (roomName: string, playerId: string, amount: number) => (await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/bet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, amount }) })).json();
const makeDecisionApi = async (roomName: string, playerId: string, decision: 'draw'|'stay') => (await fetch(`${API_URL}/rooms/${encodeURIComponent(roomName)}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, decision }) })).json();

const AnimatedNumber = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value === prevValueRef.current) return;
    const duration = 1000; const startTime = performance.now(); const startValue = displayValue;
    let animationFrame: number;
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1); const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.floor(startValue + (value - startValue) * easeProgress);
      setDisplayValue(currentVal);
      if (progress < 1) animationFrame = requestAnimationFrame(animate); else prevValueRef.current = value;
    };
    animationFrame = requestAnimationFrame(animate); return () => cancelAnimationFrame(animationFrame);
  }, [value, displayValue]);
  return <>{displayValue.toLocaleString()}</>;
};

const MiniCard = ({ suit, rank }: { suit: any, rank: number }) => (
    <div className="mini-card" style={{ transform: 'scale(0.4)', margin: '-25px -35px' }}>
        <CardComponent suit={suit} rank={rank} faceUp={true} />
    </div>
);

// --- Components ---

function AdminLogin({ onLogin, onBack }: { onLogin: () => void, onBack: () => void }) {
    const [secret, setSecret] = useState('');
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (secret === 'admin123') onLogin(); else alert('Invalid Admin Key'); };
    return (
        <div className="admin-login-container"><div className="admin-login-card"><h2 className="admin-login-title">စနစ် စီမံခန့်ခွဲရေး</h2>
                <form onSubmit={handleSubmit}><div className="login-input-group"><label>အက်ဒမင် ဝင်ရောက်ခွင့်ကုဒ်</label>
                <input type="password" className="login-input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ကုဒ်ရိုက်ထည့်ပါ..." autoFocus /></div>
                    <button type="submit" className="btn-admin-login">ခွင့်ပြုချက် ရယူရန်</button><button type="button" className="btn-admin-back" onClick={onBack}>ကစားသမား အကောင့်သို့ ပြန်သွားရန်</button>
                </form></div></div>
    );
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [fillAmounts, setFillAmounts] = useState<Record<string, number>>({});
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [resetUser, setResetUser] = useState<Account | null>(null);
    const [resetPass, setResetPass] = useState('');
    const refresh = useCallback(async () => setAccounts(await fetchAccounts()), []);
    useEffect(() => { refresh(); const interval = setInterval(refresh, 3000); return () => clearInterval(interval); }, [refresh]);
    const totalCirculation = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    return (
        <div className="admin-container" onClick={() => setActiveMenu(null)}>
            <div className="admin-header"><div className="admin-title"><TreasureChestIcon /> အက်ဒမင် ထိန်းချုပ်ရေးစင်တာ</div><button className="btn-admin-logout" onClick={onLogout}>လုံခြုံစွာ ထွက်ရန်</button></div>
            <div className="admin-stats"><div className="admin-stat-item"><div className="admin-stat-label">စုစုပေါင်း အကောင့်များ</div><div className="admin-stat-value">{accounts.length}</div></div><div className="admin-stat-item"><div className="admin-stat-label">လှည့်လည်နေသော ဒင်္ဂါးများ</div><div className="admin-stat-value" style={{ color: 'var(--accent-gold)' }}><AnimatedNumber value={totalCirculation} /></div></div><div className="admin-stat-item"><div className="admin-stat-label">စနစ် အခြေအနေ</div><div className="admin-stat-value" style={{ color: 'var(--accent-green)' }}>ပုံမှန်လည်ပတ်နေသည်</div></div></div>
            <div className="admin-card" style={{ marginBottom: '30px' }}><div style={{ fontWeight: 900, fontSize: '0.8rem', color: 'var(--accent-gold)', marginBottom: '20px', letterSpacing: '2px' }}>ကစားသမား အကောင့်အသစ် ဖွင့်ရန်</div>
                <form onSubmit={async (e) => { e.preventDefault(); await createAccount({ username: newUsername, password: newPassword, balance: 0, role: 'user' }); refresh(); setNewUsername(''); setNewPassword(''); alert(`Created!`); }} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
                    <div className="login-input-group" style={{ flex: 1, margin: 0 }}><label>အသုံးပြုသူအမည်</label><div style={{ display: 'flex', gap: '10px' }}><input type="text" className="login-input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required /><button type="button" className="btn-auto-gen" onClick={(e) => { e.stopPropagation(); const randomNum = Math.floor(1000 + Math.random() * 9000); setNewUsername(`USER-${randomNum}`); if (!newPassword) setNewPassword('123456'); }}>အလိုအလျောက်</button></div></div>
                    <div className="login-input-group" style={{ flex: 1, margin: 0 }}><label>လျှို့ဝှက်နံပါတ်</label><input type="text" className="login-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="လျှို့ဝှက်နံပါတ်..." required /></div>
                    <button type="submit" className="btn-create">အကောင့်ဖွင့်မည်</button></form></div>
            <div className="admin-card"><table className="admin-table"><thead><tr><th>ကစားသမား</th><th>အဆင့်</th><th>လက်ကျန်ငွေ</th><th>ဖြည့်မည်</th><th>လုပ်ဆောင်ချက်</th><th style={{ width: '50px' }}></th></tr></thead>
                    <tbody>{accounts.map(acc => (<tr key={acc.username}><td><div className="user-cell"><div className="user-avatar">{acc.username[0]}</div>{acc.username}</div></td><td>{acc.role.toUpperCase()}</td><td>{acc.balance.toLocaleString()}</td><td><input type="number" className="balance-input" value={fillAmounts[acc.username] || ''} onChange={(e) => setFillAmounts(prev => ({ ...prev, [acc.username]: parseInt(e.target.value) || 0 }))} /></td><td><button className="btn-action btn-fill" onClick={async () => { await updateAccount(acc.username, { balance: fillAmounts[acc.username] }); refresh(); }}>ငွေပမာဏ သတ်မှတ်ရန်</button></td>
                                <td><div className="action-menu-container"><button className="btn-menu" onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === acc.username ? null : acc.username); }}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg></button>
                                {activeMenu === acc.username && (<div className="action-dropdown"><button className="dropdown-item" onClick={() => setResetUser(acc)}>လျှို့ဝှက်နံပါတ် ပြောင်းရန်</button></div>)}</div></td></tr>))}</tbody></table></div>
            {resetUser && (<div className="reset-modal-overlay"><div className="reset-modal"><h3>လျှို့ဝှက်နံပါတ် ပြောင်းရန်</h3><input className="login-input" value={resetPass} onChange={(e) => setResetPass(e.target.value)} /><button className="btn-create" onClick={async () => { await updateAccount(resetUser.username, { password: resetPass }); setResetUser(null); }}>ပြင်ဆင်မည်</button><button onClick={() => setResetUser(null)}>မလုပ်တော့ပါ</button></div></div>)}
        </div>
    );
}

function Login({ onLogin, onGoToAdmin }: { onLogin: (username: string, isAdmin: boolean) => void, onGoToAdmin: () => void }) {
    const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
    const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const accounts = await fetchAccounts(); const account = accounts.find(acc => acc.username === username); if (account && account.password === password) onLogin(username, account.role === 'admin'); else alert('Invalid Credentials'); };
    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo-container">
                    <h1 className="login-title">SHAN KOE MEE</h1>
                    <div className="login-tagline">ဂန္ထဝင်ဝိုင်းတော်သားများ</div>
                </div>
                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="login-input-group">
                        <label>အသုံးပြုသူ အိုင်ဒီ</label>
                        <input type="text" className="login-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="အသုံးပြုသူ အိုင်ဒီ ရိုက်ထည့်ပါ..." required />
                    </div>
                    <div className="login-input-group">
                        <label>လျှို့ဝှက်နံပါတ်</label>
                        <input type="password" className="login-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>
                    <button type="submit" className="btn-login">ဝိုင်းသို့ ဝင်မည်</button>
                </form>
                <div className="login-footer">အက်ဒမင်များ အတွက်လား? <a href="#" onClick={(e) => { e.preventDefault(); onGoToAdmin(); }}>အက်ဒမင် ဝင်ရန်</a></div>
            </div>
        </div>
    );
}

function Lobby({ playerName, balance, rooms, onJoinRoom, onLogout, refreshRooms }: { playerName: string, balance: number, rooms: Room[], onJoinRoom: (roomName: string, fee: number) => Promise<void>, onLogout: () => void, refreshRooms: () => void }) {
    const [showRules, setShowRules] = useState(true);

    return (
        <div className="lobby-container">
            {showRules && (
                <div className="rules-overlay" onClick={() => setShowRules(false)}>
                    <div className="rules-modal" onClick={e => e.stopPropagation()}>
                        <button className="rules-close" onClick={() => setShowRules(false)}>ပိတ်ရန်</button>
                        <h2 className="login-title" style={{ fontSize: '2.5rem', marginBottom: '10px' }}>ဂိမ်းလမ်းညွှန်</h2>
                        
                        <div className="rules-grid">
                            <div className="rules-section">
                                <h3>ကစားနည်း</h3>
                                <ul className="rules-list">
                                    <li>• ၁၅ စက္ကန့်အတွင်း အလောင်းအစားပြုလုပ်ပါ။</li>
                                    <li>• ဒိုင်ထက် ၉ မှတ်နှင့် ပိုနီးစပ်အောင်လုပ်ဆောင်ပါ။</li>
                                    <li>• ၁၀၊ J၊ Q၊ K များသည် ၀ မှတ်ဖြစ်သည်။</li>
                                    <li>• လက်ထဲတွင် အများဆုံး ၃ ကတ်အထိ ကိုင်ထားနိုင်သည်။</li>
                                    <li>• ဒိုင် ၈ သို့မဟုတ် ၉ (ရှမ်း/ကိုး) ပေါက်ပါက ပွဲပြီးမည်။</li>
                                </ul>
                            </div>
                            <div className="rules-section">
                                <h3>အမှီး (ဆပွားများ)</h3>
                                <ul className="rules-list">
                                    <li>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <MiniCard suit="hearts" rank={7} /><MiniCard suit="diamonds" rank={7} />
                                            <span style={{ marginLeft: '10px' }}>အစုံ (၂ ကတ်)</span>
                                        </div>
                                        <span className="rank-badge">2X</span>
                                    </li>
                                    <li>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <MiniCard suit="spades" rank={3} /><MiniCard suit="spades" rank={9} />
                                            <span style={{ marginLeft: '10px' }}>အပွင့်တူ (၂ ကတ်)</span>
                                        </div>
                                        <span className="rank-badge">2X</span>
                                    </li>
                                    <li>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <MiniCard suit="clubs" rank={2} /><MiniCard suit="clubs" rank={5} /><MiniCard suit="clubs" rank={10} />
                                            <span style={{ marginLeft: '10px' }}>အပွင့်တူ (၃ ကတ်)</span>
                                        </div>
                                        <span className="rank-badge">3X</span>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <div className="rules-section" style={{ marginTop: '30px' }}>
                            <h3>ကတ်အဆင့်သတ်မှတ်ချက်များ</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <ul className="rules-list">
                                    <li>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <MiniCard suit="hearts" rank={4} /><MiniCard suit="spades" rank={5} />
                                            <span style={{ marginLeft: '10px' }}>ကိုး (Natural 9)</span>
                                        </div>
                                        <span className="rank-badge">အမြင့်ဆုံး</span>
                                    </li>
                                    <li>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <MiniCard suit="diamonds" rank={13} /><MiniCard suit="clubs" rank={8} />
                                            <span style={{ marginLeft: '10px' }}>ရှမ်း (Natural 8)</span>
                                        </div>
                                        <span className="rank-badge">အဆင့် ၂</span>
                                    </li>
                                </ul>
                                <ul className="rules-list">
                                    <li>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <MiniCard suit="hearts" rank={11} /><MiniCard suit="spades" rank={12} /><MiniCard suit="clubs" rank={10} />
                                            <span style={{ marginLeft: '10px' }}>ဗူး (၀ မှတ်)</span>
                                        </div>
                                        <span className="rank-badge">အနိမ့်ဆုံး</span>
                                    </li>
                                    <li style={{ justifyContent: 'center', opacity: 0.6, fontSize: '0.7rem' }}>
                                        မှတ်တူပါက ဒိုင်စားသည့် စည်းဉ်းကို ကျင့်သုံးသည်။
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="lobby-profile-section"><div className="profile-info"><div className="profile-name">{playerName}</div><div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-gold)', fontSize: '0.6rem', fontWeight: 900 }}><CoinIcon /> <AnimatedNumber value={balance} /></div></div><div className="profile-avatar">{playerName[0].toUpperCase()}</div><button className="btn-logout-lobby" onClick={onLogout}>ထွက်ရန်</button></div>
            <div className="lobby-hero"><h1>SHAN KOE MEE</h1><div className="lobby-subtitle">ဂန္ထဝင်ဝိုင်းတော်သားများ • အောင်ပွဲဆီသို့</div></div>
            <div className="lobby-layout-grid">
                <div className="lobby-card-v2 highlight" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}><div className="card-header"><TreasureChestIcon />ကိုယ်ပိုင်ဝိုင်း တည်ရန်</div>
                    <button className="btn-lobby tier-starter" onClick={async () => { await onJoinRoom(`${playerName}'s Table`, 5000); }} disabled={balance < 5000}><span className="btn-main-text">အခန်းဖွင့်မည်</span><div className="btn-subtitle">BRONZE TIER - 5,000 <BronzeCoinIcon /></div></button>
                    <button className="btn-lobby tier-pro pulse-gold" onClick={async () => { await onJoinRoom(`${playerName}'s Table`, 10000); }} disabled={balance < 10000}><span className="btn-main-text">အခန်းဖွင့်မည်</span><div className="btn-subtitle">SILVER TIER - 10,000 <SilverCoinIcon /></div></button>
                    <button className="btn-lobby tier-high" onClick={async () => { await onJoinRoom(`${playerName}'s Table`, 30000); }} disabled={balance < 30000}><span className="btn-main-text">အခန်းဖွင့်မည်</span><div className="btn-subtitle">GOLD TIER - 30,000 <GoldCoinIcon /></div></button>
                </div>
                <div className="lobby-card-v2">
                    <div className="card-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        လက်ရှိကစားနေသော ဝိုင်းများ 
                        <button className="btn-refresh" onClick={refreshRooms}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            အသစ်ပြန်လုပ်ရန်
                        </button>
                    </div>
                    <div className="room-list-v2">{rooms.map(room => (<div key={room.id} className="room-item-v2"><div className="room-info"><div className="room-name-v2">{room.name}</div><div className="room-meta-v2">{room.players.length}/5 ဦး • {(room.fee || 0).toLocaleString()} ဝင်ကြေး</div></div><button className="btn-join-v2" onClick={() => onJoinRoom(room.name, room.fee)}>ဝင်မည်</button></div>))}</div>
                </div>
            </div>
        </div>
    );
}

function WaitingRoom({ roomName, playerName, balance, roomFee, isHost, onStartGame, onLeave }: { roomName: string, playerName: string, balance: number, roomFee: number, isHost: boolean, onStartGame: () => void, onLeave: () => void }) {
    const [players, setPlayers] = useState<RoomPlayer[]>([]);
    const refreshRoom = useCallback(async () => { try { const roomsData = await fetchRooms(); const thisRoom = roomsData.find(r => r.name === roomName); if (thisRoom) { setPlayers(thisRoom.players); if (thisRoom.status === 'playing') onStartGame(); } } catch (e) { console.error("Refresh room failed", e); } }, [roomName, onStartGame]);
    useEffect(() => { refreshRoom(); const interval = setInterval(refreshRoom, 2000); return () => clearInterval(interval); }, [refreshRoom]);
    const addBot = async () => { await addBotApi(roomName); await refreshRoom(); };
    return (
        <div className="lobby-container">
            <button className="btn-exit" onClick={onLeave}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                အခန်းမှ ထွက်ရန်
            </button>
            <div className="lobby-hero" style={{ padding: '20px' }}>
                <h1>{roomName.toUpperCase()}</h1>
                <div className="room-code"><SilverCoinIcon /> ဝင်ကြေး: {roomFee.toLocaleString()}</div>
            </div>
            <div className="lobby-card-v2" style={{ maxWidth: '900px', width: '100%', marginTop: '20px' }}>
                <div className="card-header"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>ဝိုင်းရှိ ကစားသမားများ ({players.length}/5)</div>
                <div className="waiting-players-grid">{[0, 1, 2, 3, 4].map(idx => {
                        const p = players[idx];
                        return (
                            <div key={idx} className={`waiting-player-slot ${p ? 'occupied' : ''}`}>
                                {p ? (<><div className="waiting-avatar">{p.name[0]}</div><div className="waiting-name">{p.id === playerName ? 'သင်' : p.name}</div><div className="waiting-status">အဆင်သင့်</div></>) : (<div className="waiting-loader"></div>)}
                            </div>
                        );
                    })}</div>
                <div className="modal-actions" style={{ padding: '0 40px', gap: '20px' }}>
                    {isHost ? (
                        <>
                            <button className="btn-add-ai" onClick={addBot} disabled={players.length >= 5} style={{ flex: 1 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                                အိုင်အေ ထည့်ရန်
                            </button>
                            <button 
                                className="btn-lobby pulse-gold" 
                                style={{ flex: 2, margin: 0 }} 
                                onClick={async () => { await startGameApi(roomName); onStartGame(); }} 
                                disabled={players.length < 2}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', width: '100%' }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                    ဂိမ်းစတင်မည်
                                </div>
                            </button>
                        </>
                    ) : (<div className="waiting-tag"><ThinkingIndicator />ဝိုင်းရှင် စတင်သည်အထိ စောင့်နေသည်...</div>)}
                </div>
            </div>
        </div>
    );
}

function Game({ roomName, localPlayerId, onUpdateBalance, onLeave }: { roomName: string, localPlayerId: string, onUpdateBalance: (b: number) => void, onLeave: () => void }) {
  const [gameState, setGameState] = useState<any>(null); 
  const [houseAnnouncement, setHouseAnnouncement] = useState<string | null>(null);
  const [resultAnnouncement, setResultAnnouncement] = useState<{name: string, amount: number, type: 'win' | 'loss'} | null>(null);
  const [potAnimation, setPotAnimation] = useState<{type: 'win' | 'loss', amount: number} | null>(null);
  
  const lastHouseIdRef = useRef<string | null>(null);
  const lastPhaseRef = useRef<string | null>(null);
  const onLeaveRef = useRef(onLeave);
  const hasStartedExit = useRef(false);

  useEffect(() => { onLeaveRef.current = onLeave; }, [onLeave]);

  const refreshSync = useCallback(async () => {
      const state = await getRoomGameState(roomName, localPlayerId); 
      if (!state) return;
      
      if (state.phase === 'NONE' || !state.players) {
          setGameState(state);
          return;
      }

      // House Announcement Logic
      if (state.houseId && state.houseId !== lastHouseIdRef.current) {
         const newHouse = state.players?.find((p: any) => p.id === state.houseId);
         if (newHouse) {
             setHouseAnnouncement(newHouse.name);
             setTimeout(() => setHouseAnnouncement(null), 4000);
         }
      }
      lastHouseIdRef.current = state.houseId;

      // Result Announcement Logic
      if (state.phase === 'RESULT' && lastPhaseRef.current !== 'RESULT') {
          const isHouse = localPlayerId === state.houseId;
          const lp = state.players?.find((p:any) => p.id === localPlayerId);
          
          if (lp && lp.lastWin !== undefined && lp.lastWin !== 0) {
              if (isHouse) {
                  setPotAnimation({ type: lp.lastWin > 0 ? 'win' : 'loss', amount: Math.abs(lp.lastWin) });
                  setTimeout(() => setPotAnimation(null), 2500);
              } else {
                  const isWin = lp.lastWin > 0;
                  setResultAnnouncement({ 
                      name: isWin ? 'YOU' : 'DEFEATED', 
                      amount: Math.abs(lp.lastWin), 
                      type: isWin ? 'win' : 'loss' 
                  });
                  setTimeout(() => setResultAnnouncement(null), 4500);
              }
          }
      }
      lastPhaseRef.current = state.phase;

      setGameState(state);
      const local = state.players?.find((p: any) => p.id === localPlayerId); 
      if (local) onUpdateBalance(local.balance);
  }, [roomName, localPlayerId, onUpdateBalance]);

  useEffect(() => { 
      refreshSync(); 
      const interval = setInterval(refreshSync, 2000); 
      return () => clearInterval(interval); 
  }, [refreshSync]);

  useEffect(() => {
    if (gameState?.phase === 'CLEANUP' && !hasStartedExit.current) {
      hasStartedExit.current = true;
      const timer = setTimeout(() => { onLeaveRef.current(); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase]);

  if (!gameState || !gameState.players || gameState.phase === 'NONE') {
      const isEnding = hasStartedExit.current;
      return (
        <div className="lobby-container">
            <div className="lobby-hero">
                <h1>{isEnding ? 'အခန်း ပိတ်သွားပါပြီ' : 'ဝိုင်း ပြင်ဆင်နေသည်'}</h1>
                <div className="waiting-tag">
                    {isEnding ? 'ကစားပွဲ ပြီးဆုံးပါပြီ။ လော်ဘီသို့ ပြန်သွားနေသည်...' : <><ThinkingIndicator />ဒိုင်နှင့် ချိတ်ဆက်နေသည်...</>}
                </div>
            </div>
        </div>
      );
  }

  const { players, pot, currentRound, phase, message, houseId, activePlayerIndex, decisionTimer } = gameState;
  const localPlayer = players.find((p: any) => p.id === localPlayerId);

  return (
    <div className="game-container">
        <TablePattern />

        {phase === 'CLEANUP' && (
            <div className="house-announcement-overlay" style={{ backdropFilter: 'blur(30px)' }}>
                <div className="tournament-card">
                    <div className="tournament-title">ပွဲစဉ် ပြီးဆုံးပါပြီ</div>
                    <div className="tournament-msg">ပြိုင်ပွဲစဉ် ပြီးဆုံးပါပြီ။<br/>လော်ဘီသို့ ပြန်သွားနေသည်...</div>
                </div>
            </div>
        )}

        {houseAnnouncement && phase !== 'CLEANUP' && (
            <div className="house-announcement-overlay">
                <div className="dealer-card">
                    <div className="dealer-title">ဒိုင်အသစ်</div>
                    <div className="dealer-name-v2">{houseAnnouncement === localPlayerId ? 'သင်' : houseAnnouncement}</div>
                </div>
            </div>
        )}

        {resultAnnouncement && localPlayerId !== houseId && (
            <div className="house-announcement-overlay">
                {resultAnnouncement.type === 'win' ? (
                    <div className="winner-card">
                        <div className="winner-title">ထီပေါက်သူ!</div>
                        <div className="winner-name-v2">{resultAnnouncement.name === 'YOU' ? 'သင်' : resultAnnouncement.name}</div>
                        <div className="winner-win-box">
                            <div className="winner-win-label">စုစုပေါင်း ရရှိငွေ</div>
                            <div className="winner-win-amount">
                                <CoinIcon /> +<AnimatedNumber value={resultAnnouncement.amount} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="loser-card">
                        <div className="loser-title">ကံမကောင်းသေးပါ...</div>
                        <div className="loser-name-v2">{resultAnnouncement.name === 'YOU' ? 'သင်' : (resultAnnouncement.name === 'DEFEATED' ? 'ရှုံးနိမ့်သွားပါသည်' : resultAnnouncement.name)}</div>
                        <div className="loser-win-box">
                            <div className="loser-win-label">စုစုပေါင်း ဆုံးရှုံးငွေ</div>
                            <div className="loser-win-amount">
                                <CoinIcon /> -<AnimatedNumber value={resultAnnouncement.amount} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

      <div className="hud"><div className="brand"><h1 className="game-title">SHAN KOE MEE</h1><div className="table-label">ဂန္ထဝင်ဝိုင်းတော်သားများ</div></div>
        <div className="stats-row">
          <div className={`stat-box primary ${potAnimation?.type === 'win' ? 'pot-win' : potAnimation?.type === 'loss' ? 'pot-loss' : ''}`}>
            <div className="stat-label">ဒိုင်ရှိငွေ စုစုပေါင်း</div>
            <div className="stat-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TreasureChestIcon />
                <span className="pot-count-display">
                    <AnimatedNumber value={pot || 0} />
                </span>
            </div>
            {potAnimation && ( <div className={`pot-indicator ${potAnimation.type === 'win' ? 'gain' : 'loss'}`}>{potAnimation.type === 'win' ? '+' : '-'}{potAnimation.amount.toLocaleString()}</div> )}
          </div>
          <div className="stat-box secondary"><div className="stat-label">{phase === 'DECISION' ? 'ဆုံးဖြတ်ရန် အချိန်' : 'ပွဲစဉ်'}</div><div className="stat-value">{phase === 'DECISION' ? `${decisionTimer || 0}s` : `${currentRound || 0}/၅`}</div></div></div></div>
      <div className="game-message">{message}</div>
      {phase === 'BETTING' && localPlayerId !== houseId && localPlayer && !localPlayer.isReady && (
          <BettingModal onBet={(amt) => placeBetApi(roomName, localPlayerId, amt)} timeLeft={gameState.bettingTimer || 15} maxBet={pot || 0} balance={localPlayer.balance || 0} />
      )}
      <div className="players-grid">
        {players
          .filter((p: any) => {
            const isVisiblePhase = phase === 'SHOWDOWN' || phase === 'RESULT' || phase === 'CLEANUP';
            const isLocal = p.id === localPlayerId;
            return isLocal || isVisiblePhase;
          })
          .map((p: any) => {
            const idx = players.findIndex((pl: any) => pl.id === p.id);
            const isActive = phase === 'DECISION' && idx === activePlayerIndex;
            const isLocal = p.id === localPlayerId;
            const isVisiblePhase = phase === 'SHOWDOWN' || phase === 'RESULT' || phase === 'CLEANUP';
            const hasHand = Array.isArray(p.hand) && p.hand.length > 0;
            const showCardsFaceUp = hasHand && p.hand[0] && p.hand[0].rank !== 0;
            const shouldShowCardsAtAll = isLocal || isVisiblePhase;

            return (
              <div key={p.id} className={`player-seat ${isLocal ? 'is-local' : ''} ${p.id === houseId ? 'is-house' : ''} ${isActive ? 'active-turn' : ''}`}>
                {p.id === houseId && <div className="dealer-badge"><DealerButton /></div>}
                <div className="player-name">{isLocal ? 'သင်' : (p.name || p.id)}</div>
                <div className="balance-chip"><CoinIcon /><span className="balance-amount"><AnimatedNumber value={p.balance || 0} /></span></div>
                <div className="hand-display">
                  {hasHand && shouldShowCardsAtAll ? p.hand.map((card: any, cIdx: number) => (
                    <div key={cIdx} className="card-deal"><CardComponent suit={card.suit} rank={card.rank} faceUp={showCardsFaceUp} /></div>
                  )) : (
                    <div style={{ height: '190px', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.1)', fontSize: '0.7rem' }}>
                      {phase === 'BETTING' && p.id !== houseId ? (p.isReady ? 'လောင်းကြေးတင်ပြီး' : 'လောင်းကြေးစောင့်နေသည်...') : ''}
                    </div>
                  )}
                </div>
                {shouldShowCardsAtAll && hasHand && (
                  <div className="player-score-container">
                     <div className="points-badge">
                        {GameRules.calculateScore(p.hand)} မှတ်
                        {GameRules.calculateMultiplier(p.hand) > 1 && ( <span style={{ color: '#000', marginLeft: '5px', opacity: 0.8 }}>({GameRules.calculateMultiplier(p.hand)}X)</span> )}
                     </div>
                  </div>
                )}
                <div className="player-actions-container">
                  {isActive && isLocal && ( <div className="decision-controls"><button className="btn btn-green" onClick={() => makeDecisionApi(roomName, localPlayerId, 'draw')}>ဆွဲမည်</button><button className="btn btn-danger" onClick={() => makeDecisionApi(roomName, localPlayerId, 'stay')}>ရပ်မည်</button></div>)}
                  {p.currentBet > 0 && ( <div className="wager-info"><span className="wager-label">လောင်းကြေး</span><span className="wager-amount">{Math.floor(p.currentBet).toLocaleString()}</span></div> )}
                </div>              </div>
            );
          })}
      </div>
    </div>
  );
}

function App() {
    const [view, setView] = useState<'login' | 'lobby' | 'waiting' | 'game' | 'admin' | 'admin_login'>('login');
    const [user, setUser] = useState<Account | null>(null); const [rooms, setRooms] = useState<Room[]>([]);
    const [currentRoom, setCurrentRoom] = useState(''); const [currentFee, setCurrentFee] = useState(0);
    const refreshRooms = useCallback(async () => { try { const data = await fetchRooms(); setRooms(data); } catch(e) { console.error(e); } }, []);
    useEffect(() => { refreshRooms(); const interval = setInterval(refreshRooms, 3000); return () => clearInterval(interval); }, [refreshRooms]);
    const handleLogin = async (username: string) => { const accounts = await fetchAccounts(); let account = accounts.find(acc => acc.username === username); if (!account) { account = await createAccount({ username, password: 'password123', balance: 0, role: 'user' }); } setUser(account); setView('lobby'); };
    const handleJoinRoom = async (roomName: string, fee: number) => { 
        if (!user) return;
        try {
            setCurrentRoom(roomName); setCurrentFee(fee);
            const currentRooms = await fetchRooms(); const exists = currentRooms.find(r => r.name === roomName); 
            let res;
            if (!exists) { res = await postRoom({ name: roomName, fee, creator: { id: user.username, name: user.username, isReady: true } }); } 
            else { res = await joinRoomApi(roomName, { id: user.username, name: user.username, isReady: true }); }
            if (res && res.message) { alert(res.message); return; }
            await refreshRooms(); setView('waiting'); 
        } catch (e) { alert("Connection error. Is the server running?"); }
    };
    const handleLeave = useCallback(async () => { 
        if (user) { try { await leaveRoomApi(currentRoom, user.username); const accounts = await fetchAccounts(); const updated = accounts.find(a => a.username === user.username); if (updated) setUser(updated); } catch(e) {} } 
        setView('lobby'); setCurrentRoom(''); refreshRooms(); 
    }, [user, currentRoom, refreshRooms]);

    const handleUpdateBalance = useCallback((b: number) => {
        setUser(prev => prev ? {...prev, balance: b} : null);
    }, []);

    if (view === 'login') return <Login onLogin={handleLogin} onGoToAdmin={() => setView('admin_login')} />;
    if (view === 'admin_login') return <AdminLogin onLogin={() => setView('admin')} onBack={() => setView('login')} />;
    if (view === 'admin') return <AdminPanel onLogout={() => setView('login')} />;
    if (view === 'lobby' && user) return <Lobby playerName={user.username} balance={user.balance} rooms={rooms} onJoinRoom={handleJoinRoom} onLogout={() => setView('login')} refreshRooms={refreshRooms} />;
    if (view === 'waiting' && user) return <WaitingRoom roomName={currentRoom} playerName={user.username} balance={user.balance} roomFee={currentFee} isHost={currentRoom.includes(user.username)} onStartGame={() => setView('game')} onLeave={handleLeave} />;
    
    return <Game 
        key={currentRoom}
        roomName={currentRoom} 
        localPlayerId={user?.username || ''} 
        onUpdateBalance={handleUpdateBalance} 
        onLeave={handleLeave} 
    />;
}
export default App;
