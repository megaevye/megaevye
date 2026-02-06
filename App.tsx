import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import { UserRole, ActiveUser, UserLocation, VehicleType } from './types';
import { calculateDistance } from './utils/geoUtils';
import { 
  Navigation, MapPin, Send, Clock, 
  Users, PhoneCall, Timer, Zap, ShieldCheck
} from 'lucide-react';

// --- SUPABASE AYARLARI ---
// Bu bilgileri Supabase panelinden (Settings > API) alıp tırnak içine yapıştırın
const SUPABASE_URL = "https://daregbnkyngslxqfucii.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_TmsPTaHbpPgMmrkBKy0aGg_aC2cGKj9";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PRICE_PER_KM = 40; // KM başı 40 TL
const MIN_PRICE = 150; 

const createCustomIcon = (rank: number, role: UserRole) => {
  const color = role === UserRole.DRIVER ? '#10b981' : '#4f46e5';
  return L.divIcon({
    html: `<div style="background-color:${color}; width:24px; height:24px; border-radius:8px; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px rgba(0,0,0,0.1); font-size:12px; position:relative;">
            ${role === UserRole.DRIVER ? '🚗' : '👤'}
            <div style="position:absolute; top:-8px; right:-8px; background:#1e293b; color:white; border-radius:50%; width:14px; height:14px; font-size:8px; display:flex; align-items:center; justify-content:center; border:1px solid white; font-weight:bold;">${rank}</div>
          </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

function MapControl({ center }: { center: UserLocation }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView([center.lat, center.lng], 14); }, [center, map]);
  return null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<ActiveUser | null>(null);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [allUsers, setAllUsers] = useState<ActiveUser[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [nextSyncSeconds, setNextSyncSeconds] = useState(60);
  const [telegramID, setTelegramID] = useState('');
  const [targetDest, setTargetDest] = useState('');

  // Canlı Konum Takibi (10 saniye aralıkla hassas güncelleme)
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error("Konum izni hatası:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Supabase Veritabanı Senkronizasyonu
  const syncWithDatabase = useCallback(async () => {
    if (!location) return;

    try {
      if (isOnline && currentUser) {
        await supabase.from('active_users').upsert({
          id: currentUser.id,
          role: currentUser.role,
          lat: location.lat,
          lng: location.lng,
          destination: targetDest,
          telegram_username: telegramID.replace('@',''),
          last_seen: Date.now(),
          created_at: currentUser.createdAt
        });
      }

      // 30 dakika kuralı: Sadece son 30 dk içinde güncellenenleri çek
      const { data } = await supabase
        .from('active_users')
        .select('*')
        .gt('last_seen', Date.now() - 1800000);

      if (data) {
        const formatted = data
          .filter(u => u.id !== currentUser?.id)
          .map(u => ({
            id: u.id,
            role: u.role as UserRole,
            location: { lat: u.lat, lng: u.lng },
            destination: u.destination,
            telegramUsername: u.telegram_username,
            createdAt: u.created_at,
            vehicleType: VehicleType.CAR
          }));
        setAllUsers(formatted);
      }
    } catch (err) {
      console.error("Senkronizasyon Hatası:", err);
    }
  }, [location, isOnline, currentUser, targetDest, telegramID]);

  useEffect(() => {
    const timer = setInterval(() => {
      const s = new Date().getSeconds();
      setNextSyncSeconds(60 - s);
      if (s === 0) syncWithDatabase();
    }, 1000);
    syncWithDatabase();
    return () => clearInterval(timer);
  }, [syncWithDatabase]);

  const filtered = useMemo(() => {
    if (!location) return [];
    const targetRole = isOnline 
      ? (currentUser?.role === UserRole.DRIVER ? UserRole.PASSENGER : UserRole.DRIVER)
      : null;

    return allUsers
      .map(u => ({ ...u, distanceToViewer: calculateDistance(location, u.location) }))
      .filter(u => !targetRole || u.role === targetRole)
      .sort((a, b) => a.distanceToViewer! - b.distanceToViewer!)
      .slice(0, 10) 
      .map((u, i) => ({ ...u, rank: i + 1 }));
  }, [allUsers, location, currentUser, isOnline]);

  const toggleOnline = async (role: UserRole) => {
    if (!location || !telegramID) return alert("Hata: Telegram kullanıcı adı ve Konum izni gereklidir.");
    if (isOnline) { 
      await supabase.from('active_users').delete().eq('id', currentUser?.id);
      setIsOnline(false); 
      setCurrentUser(null); 
      return; 
    }
    const newUser: ActiveUser = {
      id: `u-${Math.random().toString(36).substr(2, 6)}`,
      role,
      vehicleType: role === UserRole.DRIVER ? VehicleType.CAR : VehicleType.NONE,
      location,
      destination: targetDest || "Belirtilmedi",
      telegramUsername: telegramID.replace('@',''),
      createdAt: Date.now()
    };
    setCurrentUser(newUser);
    setIsOnline(true);
    setTimeout(syncWithDatabase, 200);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="bg-white border-b px-4 py-3 flex justify-between items-center z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg"><Navigation className="w-4 h-4 text-white" /></div>
          <h1 className="font-black text-xs tracking-tighter uppercase">YOLARKADAŞIM <span className="text-indigo-600">CANLI</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 px-2 py-1 rounded-full text-[9px] font-black text-slate-500 uppercase"><Timer className="w-3 h-3 inline mr-1" /> {nextSyncSeconds}S</div>
          {isOnline && <button onClick={() => toggleOnline(currentUser!.role)} className="bg-red-500 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase shadow-lg">AYRIL</button>}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <aside className="w-full md:w-80 bg-white border-r flex flex-col z-40 shadow-xl overflow-hidden shrink-0">
          <div className="p-4 border-b space-y-3 bg-slate-50/50">
            <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase"><ShieldCheck className="w-4 h-4 text-emerald-500" /> Veriler 30 dk sonra silinir</div>
            <div className="grid grid-cols-2 gap-2">
              <input disabled={isOnline} type="text" placeholder="@Telegram" value={telegramID} onChange={(e) => setTelegramID(e.target.value)} className="w-full px-3 py-3 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
              <input disabled={isOnline} type="text" placeholder="Nereye?" value={targetDest} onChange={(e) => setTargetDest(e.target.value)} className="w-full px-3 py-3 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
            </div>
            {!isOnline ? (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => toggleOnline(UserRole.PASSENGER)} className="bg-indigo-600 text-white py-4 rounded-xl font-black text-[10px] uppercase shadow-lg">Yolcu Bul</button>
                <button onClick={() => toggleOnline(UserRole.DRIVER)} className="bg-emerald-600 text-white py-4 rounded-xl font-black text-[10px] uppercase shadow-lg">Sürücü Bul</button>
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-700 py-4 rounded-xl font-black text-[10px] text-center border-2 border-emerald-100 animate-pulse uppercase tracking-widest"><Zap className="w-4 h-4 inline mr-2" /> Haritada Aktifsiniz</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2"><Users className="w-4 h-4" /> Yakındaki Adaylar</h3>
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-[10px] font-black text-slate-300 uppercase italic">Henüz Yakınınızda<br/>Kimse Yok</div>
            ) : (
              filtered.map(u => {
                const estPrice = Math.max(MIN_PRICE, Math.ceil(4.5 * PRICE_PER_KM));
                return (
                  <div key={u.id} className="p-4 bg-white border-2 border-slate-50 rounded-2xl shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center font-black text-xs text-slate-500">#{u.rank}</div>
                        <span className={`text-[9px] font-black uppercase ${u.role === UserRole.DRIVER ? 'text-emerald-600' : 'text-indigo-600'}`}>{u.role === UserRole.DRIVER ? 'Sürücü' : 'Yolcu'}</span>
                      </div>
                      <div className="flex gap-2">
                        <a href={`https://t.me/${u.telegramUsername}`} target="_blank" className="p-2 bg-sky-500 text-white rounded-lg"><Send className="w-4 h-4" /></a>
                        <a href={`https://t.me/${u.telegramUsername}`} target="_blank" className="p-2 bg-emerald-500 text-white rounded-lg"><PhoneCall className="w-4 h-4" /></a>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 flex items-center gap-2 truncate bg-slate-50 p-2 rounded-lg">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-red-400" /> {u.destination}
                    </div>
                    <div className="flex justify-between mt-3 pt-3 border-t border-slate-50 text-[10px] font-black">
                      <div className="flex flex-col"><span className="text-indigo-700 text-lg uppercase leading-none">{estPrice}₺</span><span className="text-[7px] text-slate-400">40₺/KM FIX</span></div>
                      <div className="text-right"><span className="text-slate-400 block">{u.distanceToViewer?.toFixed(1)} KM</span><span className="text-[7px] text-slate-300 uppercase">MESAFE</span></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex-1 relative overflow-hidden">
          <MapContainer center={[location?.lat || 39.9, location?.lng || 32.8]} zoom={13} zoomControl={false} className="h-full w-full">
            <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" attribution="Google" />
            {location && <MapControl center={location} />}
            {location && <Marker position={[location.lat, location.lng]} icon={L.divIcon({ html: '<div class="w-5 h-5 bg-indigo-600 border-4 border-white rounded-full shadow-2xl animate-pulse"></div>', className: '' })} />}
            {filtered.map(u => <Marker key={u.id} position={[u.location.lat, u.location.lng]} icon={createCustomIcon(u.rank || 0, u.role)} />)}
          </MapContainer>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] md:w-auto">
             <div className="bg-white/95 p-3 rounded-xl shadow-2xl border text-[9px] font-black flex items-center justify-center gap-4">
                <div className="text-indigo-600"><Zap className="w-3 h-3 inline mr-1" /> 40₺/KM FIX TARİFE</div>
                <div className="text-slate-400"><Clock className="w-3 h-3 inline mr-1" /> 30 DK GEÇERLİ İLANLAR</div>
             </div>
          </div>
        </section>
      </div>
    </div>
  );
}
