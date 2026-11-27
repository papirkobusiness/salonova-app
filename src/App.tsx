import LandingPage from './LandingPage'
import { useEffect, useMemo, useState } from 'react'
import { supabase, configured, type Salon, type Booking, type Service, type Staff, type Conversation } from './lib'
import { LayoutDashboard, CalendarDays, Inbox, Users, Scissors, Settings, LogOut, Plus, Search, Bell, Menu, X, Check, Clock3, Euro, UserRound, Sparkles, MessageCircle, ArrowUpRight, ChevronRight } from 'lucide-react'

type Page = 'dashboard'|'bookings'|'clients'|'inbox'|'services'|'staff'|'settings'
const nav: {id:Page; label:string; icon:any}[] = [
 {id:'dashboard',label:'Pregled',icon:LayoutDashboard},{id:'bookings',label:'Rezervacije',icon:CalendarDays},{id:'clients',label:'Klijenti',icon:Users},
 {id:'inbox',label:'Virtualna recepcija',icon:Inbox},{id:'services',label:'Usluge i cjenik',icon:Scissors},
 {id:'staff',label:'Zaposlenici',icon:Users},{id:'settings',label:'Postavke salona',icon:Settings}
]
const today = new Date().toISOString().slice(0,10)

function DashboardApp(){
 const [session,setSession]=useState<any>(null), [salon,setSalon]=useState<Salon|null>(null)
 const [page,setPage]=useState<Page>('dashboard'), [mobile,setMobile]=useState(false)
 const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState('')
 const [bookings,setBookings]=useState<Booking[]>([]), [services,setServices]=useState<Service[]>([])
 const [staff,setStaff]=useState<Staff[]>([]), [conversations,setConversations]=useState<Conversation[]>([])
 const [authMode,setAuthMode]=useState<'login'|'signup'>('login')
 const [email,setEmail]=useState(''), [password,setPassword]=useState('')
 const [salonName,setSalonName]=useState(''), [salonSlug,setSalonSlug]=useState('')
 const [modal,setModal]=useState<'editBooking'|'service'|'staff'|null>(null)
 const [editingBooking,setEditingBooking]=useState<Booking|null>(null)
 const [search,setSearch]=useState('')
 const [selectedClient,setSelectedClient]=useState<any>(null)
 const [clientProfiles,setClientProfiles]=useState<Record<string,{notes:string;is_regular:boolean}>>({})
 const [clientNotes,setClientNotes]=useState('')
 const [clientRegular,setClientRegular]=useState(false)
 const [savingClient,setSavingClient]=useState(false)
 const [clientProfileError,setClientProfileError]=useState('')
 const [scheduleDays,setScheduleDays]=useState('ponedjeljak-petak'), [scheduleStart,setScheduleStart]=useState('09:00'), [scheduleEnd,setScheduleEnd]=useState('17:00'), [scheduleBusy,setScheduleBusy]=useState(false)
 const [form,setForm]=useState<any>({client_name:'',service:'',booking_date:today,booking_time:'10:00',phone:'',stylist:'',name:'',duration_minutes:60,price:0})

 useEffect(()=>{ if(!supabase){setLoading(false);return}
   supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);setSalon(null)})
   return ()=>subscription.unsubscribe()
 },[])
 useEffect(()=>{ if(session?.user) loadWorkspace() },[session])
 useEffect(()=>{if(!supabase||!salon)return;supabase.from('salon_settings').select('business_hours').eq('salon_id',salon.id).maybeSingle().then(({data,error})=>{if(error){setError(error.message);return}const hours=(data as any)?.business_hours?.default;if(hours){setScheduleDays(hours.days||'ponedjeljak-petak');setScheduleStart(hours.start||'09:00');setScheduleEnd(hours.end||'17:00')}})},[salon])
 async function loadWorkspace(){
   if(!supabase||!session)return
   setLoading(true);setError('')
   const {data:membership,error:me}=await supabase.from('salon_memberships').select('salon_id,salons(id,name,slug,timezone,public_views)').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
   if(me){setError(me.message);setLoading(false);return}
   const found=(membership as any)?.salons
   if(!found){setSalon(null);setLoading(false);return}
   setSalon(found)
   const sid=found.id
   const [b,s,st,c,cp]=await Promise.all([
     supabase.from('bookings').select('*').eq('salon_id',sid).order('booking_date',{ascending:false}).order('booking_time',{ascending:false}).limit(500),
     supabase.from('salon_services').select('*').eq('salon_id',sid).order('sort_order'),
     supabase.from('salon_staff').select('*').eq('salon_id',sid).order('name'),
     supabase.from('conversations').select('*').eq('salon_id',sid).order('updated_at',{ascending:false}).limit(50),
     supabase.from('client_profiles').select('client_key,notes,is_regular').eq('salon_id',sid)
   ])
   if(b.error||s.error||st.error||c.error)setError(b.error?.message||s.error?.message||st.error?.message||c.error?.message||'Greška učitavanja')
   if(cp.error)setError(cp.error.message.includes('client_profiles')?'Potrebno je uključiti novu evidenciju profila klijenata u Supabase (migracija 0006).':cp.error.message)
   setClientProfiles(Object.fromEntries((cp.data||[]).map((x:any)=>[x.client_key,{notes:x.notes||'',is_regular:!!x.is_regular}])))
   setBookings(((b.data||[]) as Booking[]).sort((x,y)=>x.booking_date.localeCompare(y.booking_date)||x.booking_time.localeCompare(y.booking_time)));setServices((s.data||[]) as Service[]);setStaff((st.data||[]) as Staff[]);setConversations((c.data||[]) as Conversation[])
   setLoading(false)
 }
 async function auth(e:React.FormEvent){
   e.preventDefault();if(!supabase)return
   setBusy(true);setError('')
   const result=authMode==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password})
   if(result.error)setError(result.error.message)
   else if(authMode==='signup'&&!result.data.session)setError('Provjeri e-mail i potvrdi registraciju, zatim se prijavi.')
   setBusy(false)
 }
 async function createSalon(e:React.FormEvent){
   e.preventDefault();if(!supabase||!session)return
   setBusy(true);setError('')
   const slug=(salonSlug||salonName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
   const {data,error}=await supabase.from('salons').insert({name:salonName,slug,owner_id:session.user.id}).select('id,name,slug,timezone').single()
   if(error){setError(error.message);setBusy(false);return}
   const {error:memberError}=await supabase.from('salon_memberships').insert({salon_id:data.id,user_id:session.user.id,role:'owner'})
   if(memberError){setError(memberError.message);setBusy(false);return}
   setSalon(data as Salon);setBusy(false);loadWorkspace()
 }
 async function updateBooking(e:React.FormEvent){
   e.preventDefault();if(!supabase||!salon||!editingBooking)return
   setBusy(true);setError('')
   try{
     const selectedService=services.find(s=>s.name===form.service)
     const duration=selectedService?.duration_minutes||60
     const start=(value:string)=>{const [h,m]=value.slice(0,5).split(':').map(Number);return h*60+m}
     const newStart=start(form.booking_time)
     const {data:dayBookings,error:checkError}=await supabase.from('bookings').select('id,booking_time,service,status').eq('salon_id',salon.id).eq('booking_date',form.booking_date).neq('status','cancelled').neq('id',editingBooking.id)
     if(checkError)throw checkError
     const conflict=(dayBookings||[]).some((b:any)=>{
       const existingService=services.find(s=>s.name===b.service)
       const existingDuration=existingService?.duration_minutes||60
       const existingStart=start(b.booking_time)
       return newStart<existingStart+existingDuration && existingStart<newStart+duration
     })
     if(conflict){setError('Taj termin se preklapa s drugom rezervacijom. Odaberite drugo vrijeme.');setBusy(false);return}
     const {error}=await supabase.from('bookings').update({client_name:form.client_name,booking_date:form.booking_date,booking_time:form.booking_time,service:form.service||null,service_id:selectedService?.id||null,stylist:form.stylist||null,staff_id:staff.find(x=>x.name===form.stylist)?.id||null,phone:form.phone||null}).eq('id',editingBooking.id).eq('salon_id',salon.id)
     if(error)throw error
     setModal(null);setEditingBooking(null);await loadWorkspace()
   }catch(err:any){setError(err.message||'Nije moguće urediti rezervaciju.')}
   setBusy(false)
 }
 function openEditBooking(b:Booking){
   setEditingBooking(b)
   setForm({client_name:b.client_name,service:b.service||'',booking_date:b.booking_date,booking_time:b.booking_time.slice(0,5),phone:b.phone||'',stylist:b.stylist||''})
   setError('');setModal('editBooking')
 }
 async function addService(e:React.FormEvent){
   e.preventDefault();if(!supabase||!salon)return
   setBusy(true);const {error}=await supabase.from('salon_services').insert({salon_id:salon.id,name:form.name,duration_minutes:Number(form.duration_minutes),price:Number(form.price)})
   if(error)setError(error.message);else{setModal(null);await loadWorkspace()}setBusy(false)
 }
 async function addStaff(e:React.FormEvent){
   e.preventDefault();if(!supabase||!salon)return
   setBusy(true);const {error}=await supabase.from('salon_staff').insert({salon_id:salon.id,name:form.name,email:form.email||null,phone:form.phone||null})
   if(error)setError(error.message);else{setModal(null);await loadWorkspace()}setBusy(false)
 }
 async function saveBusinessHours(){
   if(!supabase||!salon)return
   setScheduleBusy(true);setError('')
   try{
     const {data:existing,error:readError}=await supabase.from('salon_settings').select('business_hours,public_profile').eq('salon_id',salon.id).maybeSingle()
     if(readError)throw readError
     const hours:any=existing?.business_hours||{};const profile:any=existing?.public_profile||{}
     hours.default={days:scheduleDays.trim(),start:scheduleStart,end:scheduleEnd}
     const {error:saveError}=await supabase.from('salon_settings').upsert({salon_id:salon.id,business_hours:hours,public_profile:profile,updated_at:new Date().toISOString()},{onConflict:'salon_id'})
     if(saveError)throw saveError

   }catch(e:any){setError(e.message||'Radno vrijeme nije spremljeno.')}finally{setScheduleBusy(false)}
 }
 function clientKey(client:any){
   const phone=(client.phone||'').replace(/\D/g,'')
   return phone?`phone:${phone}`:`name:${(client.name||'').trim().toLocaleLowerCase('hr-HR')}`
 }
 function openClient(client:any){
   const profile=clientProfiles[clientKey(client)]||{notes:'',is_regular:false}
   setSelectedClient(client);setClientNotes(profile.notes);setClientRegular(profile.is_regular);setClientProfileError('');setError('')
 }
 async function saveClientProfile(){
   if(!supabase||!salon||!selectedClient)return
   setSavingClient(true);setClientProfileError('')
   const key=clientKey(selectedClient)
   const {error}=await supabase.from('client_profiles').upsert({salon_id:salon.id,client_key:key,client_name:selectedClient.name,phone:selectedClient.phone,notes:clientNotes.trim(),is_regular:clientRegular,updated_at:new Date().toISOString()},{onConflict:'salon_id,client_key'})
   if(error){setClientProfileError(error.message);setSavingClient(false);return}
   setClientProfiles(prev=>({...prev,[key]:{notes:clientNotes.trim(),is_regular:clientRegular}}))
   setSavingClient(false)
 }
 async function updateStatus(id:string,status:string){
   if(!supabase)return;const {error}=await supabase.from('bookings').update({status}).eq('id',id)
   if(error)setError(error.message);else await loadWorkspace()
 }
 async function signOut(){await supabase?.auth.signOut();setSalon(null)}
 const todays=useMemo(()=>bookings.filter(b=>b.booking_date===today),[bookings])
 const upcoming=useMemo(()=>bookings.filter(b=>b.booking_date>=today&&b.status!=='cancelled').slice(0,6),[bookings])
 const clients=useMemo(()=>{
   const grouped=new Map<string,{name:string;phone:string|null;visits:number;lastDate:string;lastService:string|null;nextDate:string|null}>()
   for(const b of bookings){
     const phone=(b.phone||'').replace(/\D/g,'')
     const key=phone||`${b.client_name.trim().toLocaleLowerCase('hr-HR')}|${b.phone||''}`
     const item=grouped.get(key)
     if(!item)grouped.set(key,{name:b.client_name,phone:b.phone,visits:1,lastDate:b.booking_date,lastService:b.service,nextDate:b.booking_date>=today&&b.status!=='cancelled'?b.booking_date:null})
     else{item.visits++;if(b.booking_date>=item.lastDate){item.lastDate=b.booking_date;item.name=b.client_name;item.lastService=b.service}if(b.booking_date>=today&&b.status!=='cancelled'&&(!item.nextDate||b.booking_date<item.nextDate))item.nextDate=b.booking_date}
   }
   return [...grouped.values()].sort((a,b)=>b.lastDate.localeCompare(a.lastDate))
 },[bookings])
 if(!configured)return <Setup/>
 if(loading)return <div className="loading"><div className="brand-mark">S</div><p>Učitavamo Salonovu…</p></div>
 if(!session)return <div className="auth-shell"><div className="auth-art"><div className="brand"><span className="brand-mark">S</span><span>salonova</span></div><div className="auth-message"><span className="eyebrow">VIRTUALNA RECEPCIJA</span><h1>Vi se posvetite klijentima.<br/><i>Mi brinemo o organizaciji.</i></h1><p>Jedno mjesto za rezervacije, klijente i svakodnevni rad vašeg salona.</p></div><div className="auth-foot">Salonova · Salon management platform</div></div><form className="auth-card" onSubmit={auth}><span className="eyebrow">{authMode==='login'?'DOBRO DOŠLI NATRAG':'ZAPOČNITE S RADOM'}</span><h2>{authMode==='login'?'Prijava u Salonovu':'Kreirajte račun'}</h2><p className="muted">Pristupite svojoj virtualnoj recepciji.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="ime@salon.hr"/></label><label>Lozinka<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} placeholder="Najmanje 6 znakova"/></label>{error&&<div className="alert">{error}</div>}<button className="primary wide" disabled={busy}>{busy?'Molimo pričekajte…':authMode==='login'?'Prijavi se':'Registriraj se'}</button><p className="switch">{authMode==='login'?'Nemate račun?':'Već imate račun?'} <button type="button" className="link" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setError('')}}>{authMode==='login'?'Registracija':'Prijava'}</button></p></form></div>
 if(!salon)return <div className="onboard"><div className="brand"><span className="brand-mark">S</span><span>salonova</span></div><form className="auth-card" onSubmit={createSalon}><span className="eyebrow">JOŠ SAMO JEDAN KORAK</span><h2>Postavite svoj salon</h2><p className="muted">Ovaj salon bit će vaš privatni radni prostor.</p><label>Naziv salona<input value={salonName} onChange={e=>setSalonName(e.target.value)} required placeholder="Studio Ana"/></label><label>Adresa aplikacije (slug)<input value={salonSlug} onChange={e=>setSalonSlug(e.target.value)} placeholder="studio-ana"/></label>{error&&<div className="alert">{error}</div>}<button className="primary wide" disabled={busy}>{busy?'Spremanje…':'Kreiraj salon'}</button></form></div>
 return <div className="app-shell"><aside className={`sidebar ${mobile?'open':''}`}><div className="brand"><span className="brand-mark">S</span><span>salonova</span><button className="mobile-close" onClick={()=>setMobile(false)}><X/></button></div><div className="salon-switch"><div className="salon-avatar">{salon.name.slice(0,1).toUpperCase()}</div><div><strong>{salon.name}</strong><small>Salon workspace</small></div><ChevronRight size={16}/></div><div className="nav-label">RADNI PROSTOR</div><nav>{nav.map(n=><button key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>{setPage(n.id);setMobile(false)}}><n.icon size={18}/><span>{n.label}</span>{n.id==='inbox'&&conversations.length>0&&<em>{conversations.length}</em>}</button>)}</nav><div className="sidebar-bottom"><div className="plan-card"><div className="plan-icon"><Sparkles size={16}/></div><strong>Salonova Pro</strong><p>Vaš salon, na jednom mjestu.</p><span>Upravljanje planom <ArrowUpRight size={13}/></span></div><button className="nav-item logout" onClick={signOut}><LogOut size={18}/> Odjava</button><div className="user-row"><div className="user-avatar">{session.user.email?.slice(0,1).toUpperCase()}</div><div><strong>{session.user.email}</strong><small>Vlasnik salona</small></div></div></div></aside>{mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}<main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><div className="breadcrumb">Salonova <span>/</span> {nav.find(n=>n.id===page)?.label}</div><div className="top-actions"><span className="live-dot">● Povezano</span><button className="icon-btn" title="Obavijesti"><Bell size={18}/></button><div className="top-avatar">{session.user.email?.slice(0,1).toUpperCase()}</div></div></header><div className="content">{error&&<div className="alert global-alert">{error}<button onClick={()=>setError('')}>×</button></div>}
 {page==='dashboard'&&<><div className="page-heading"><div><span className="eyebrow">PREGLED POSLOVANJA</span><h1>Dobro došli u Salonovu</h1><p>Ovdje je pregled današnjeg rada vašeg salona.</p></div></div><div className="stats-grid"><Stat icon={CalendarDays} label="Današnji termini" value={todays.length} hint="Zakazano za danas"/><Stat icon={Users} label="Ukupno rezervacija" value={bookings.length} hint="Učitani termini"/><Stat icon={Euro} label="Usluge u ponudi" value={services.length} hint="Aktivne usluge"/><Stat icon={MessageCircle} label="Razgovori" value={conversations.length} hint="Virtualna recepcija"/><Stat icon={Users} label="Posjete linku" value={salon.public_views||0} hint="Otvaranja javne recepcije"/><Stat icon={CalendarDays} label="Online rezervacije" value={bookings.filter(b=>b.channel==='web').length} hint="Rezervacije preko Instagram linka"/></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h3>Sljedeći termini</h3><p>Pregled nadolazećih rezervacija</p></div><button className="text-action" onClick={()=>setPage('bookings')}>Sve rezervacije <ChevronRight size={15}/></button></div>{upcoming.length===0?<Empty icon={CalendarDays} title="Još nema rezervacija" desc="Rezervacije će se ovdje prikazati kada klijenti rezerviraju putem Virtualne recepcije."/>:<div className="booking-list">{upcoming.map(b=><div className="booking-row" key={b.id}><div className="time-box"><strong>{b.booking_time.slice(0,5)}</strong><small>{b.booking_date===today?'Danas':b.booking_date.slice(5).replace('-','.')+'.'}</small></div><div className="booking-person"><strong>{b.client_name}</strong><small>{b.service||'Usluga nije navedena'}{b.stylist?` · ${b.stylist}`:''}</small></div><Status status={b.status}/><button className="dots" onClick={()=>updateStatus(b.id,b.status==='confirmed'?'pending':'confirmed')} title="Promijeni status"><Check size={16}/></button></div>)}</div>}</section><section className="panel side-panel"><div className="panel-head"><div><h3>Brzi pristup</h3><p>Najčešće radnje</p></div></div><Quick icon={Scissors} title="Uredi usluge" desc="Cijene i trajanje usluga" click={()=>setPage('services')}/><Quick icon={Users} title="Dodaj zaposlenika" desc="Proširite svoj tim" click={()=>setModal('staff')}/><Quick icon={Inbox} title="Virtualna recepcija" desc="Pregledajte upite klijenata" click={()=>setPage('inbox')}/></section></div></>}
 {page==='bookings'&&<><div className="page-heading"><div><span className="eyebrow">RASPORED</span><h1>Rezervacije</h1><p>Upravljajte terminima i statusima klijenata.</p></div></div><div className="toolbar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pretraži klijente ili usluge…"/></div><span className="muted">{bookings.length} rezervacija</span></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Klijent</th><th>Datum i vrijeme</th><th>Usluga</th><th>Djelatnik</th><th>Status</th><th>Akcija</th></tr></thead><tbody>{bookings.filter(b=>(b.client_name+' '+(b.service||'')).toLowerCase().includes(search.toLowerCase())).map(b=><tr key={b.id}><td><strong>{b.client_name}</strong><small>{b.phone||'—'}</small></td><td>{b.booking_date}<small>{b.booking_time.slice(0,5)}</small></td><td>{b.service||'—'}</td><td>{b.stylist||'—'}</td><td><Status status={b.status}/></td><td><button type="button" className="secondary" onClick={()=>openEditBooking(b)}>Uredi</button> <select className="status-select" value={b.status} onChange={e=>updateStatus(b.id,e.target.value)}><option value="pending">Na čekanju</option><option value="confirmed">Potvrđeno</option><option value="completed">Završeno</option><option value="cancelled">Otkazano</option></select></td></tr>)}</tbody></table>{bookings.length===0&&<Empty icon={CalendarDays} title="Nema rezervacija" desc="Rezervacije će se ovdje prikazati nakon što ih klijenti naprave."/>}</div></div></>}
 {page==='clients'&&<><div className="page-heading"><div><span className="eyebrow">ODNOSI S KLIJENTIMA</span><h1>Klijenti</h1><p>Pregled klijenata koji su rezervirali termin u vašem salonu.</p></div><button className="primary" onClick={()=>setPage('bookings')}><CalendarDays size={17}/> Rezervacije</button></div><div className="stats-grid"><Stat icon={Users} label="Ukupno klijenata" value={clients.length} hint="Prema zadnjih 500 rezervacija"/><Stat icon={CalendarDays} label="Ukupno rezervacija" value={bookings.length} hint="Učitane rezervacije salona (do 500)"/><Stat icon={UserRound} label="Klijenti s telefonom" value={clients.filter(c=>!!c.phone).length} hint="Moguća lakša identifikacija"/></div><div className="toolbar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pretraži ime ili telefon…"/></div><span className="muted">{clients.filter(c=>(c.name+' '+(c.phone||'')).toLocaleLowerCase('hr-HR').includes(search.toLocaleLowerCase('hr-HR'))).length} klijenata</span></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Klijent</th><th>Telefon</th><th>Broj rezervacija</th><th>Zadnji posjet</th><th>Zadnja usluga</th><th>Sljedeći termin</th></tr></thead><tbody>{clients.filter(c=>(c.name+' '+(c.phone||'')).toLocaleLowerCase('hr-HR').includes(search.toLocaleLowerCase('hr-HR'))).map((c,i)=><tr key={`${c.phone||c.name}-${i}`}><td><button type="button" className="client-name-button" onClick={()=>openClient(c)}>{c.name}<ChevronRight size={14}/></button>{clientProfiles[clientKey(c)]?.is_regular&&<span className="regular-client-tag">Stalni</span>}</td><td>{c.phone||'—'}</td><td><strong>{c.visits}</strong></td><td>{c.lastDate}</td><td>{c.lastService||'—'}</td><td>{c.nextDate||'—'}</td></tr>)}</tbody></table>{clients.length===0&&<Empty icon={Users} title="Još nema klijenata" desc="Klijenti će se ovdje automatski pojaviti nakon prve rezervacije." action={()=>setPage('bookings')}/>}</div></div><p className="muted small-note">Napomena: evidencija se trenutno sastavlja iz do 500 najnovijih rezervacija. Ako klijent nema upisan telefon, grupiranje se radi prema imenu.</p></>}
 {page==='inbox'&&<><div className="page-heading"><div><span className="eyebrow">KOMUNIKACIJA S KLIJENTIMA</span><h1>Virtualna recepcija</h1><p>Razvijamo recepciju koja samostalno odgovara klijentima i dogovara termine.</p></div><span className="coming-pill"><Sparkles size={14}/> U razvoju</span></div><div className="panel"><div className="panel-head"><div><h3>Automatski razgovori s klijentima</h3><p>Salonova će odgovarati na pitanja o uslugama, cijenama i radnom vremenu, provjeravati dostupnost te pomagati pri rezervaciji, bez potrebe da vlasnik odgovara na poruke.</p></div></div><div className="channel-grid"><Channel name="Instagram" note="Automatski odgovori na poruke" symbol="◎"/><Channel name="Facebook" note="Automatski odgovori na poruke" symbol="f"/><Channel name="WhatsApp" note="Automatski odgovori na poruke" symbol="◉"/></div><div className="inbox-future-note"><strong>Prvo dovršavamo virtualnu recepciju.</strong><p>Ovdje testiramo razgovor koji razumije prirodni jezik i koristi stvarne podatke vašeg salona. Sljedeći korak je omogućiti joj provjeru slobodnih termina i stvaranje rezervacija.</p></div>{salon&&<ReceptionTestChat salon={salon} services={services} hours={scheduleDays&&scheduleStart&&scheduleEnd?{default:{days:scheduleDays,start:scheduleStart,end:scheduleEnd}}:null}/ >}</div><div className="panel"><div className="panel-head"><div><h3>Inbox</h3><p>Primljeni razgovori</p></div><span className="muted">{conversations.length} razgovora</span></div>{conversations.length===0?<Empty icon={Inbox} title="Inbox je trenutno prazan" desc="Razgovori će se prikazati kada komunikacijski kanali budu povezani."/>:<div className="conversation-list">{conversations.map(c=><div className="conversation-row" key={c.id}><div className="conversation-avatar">{(c.customer_name||'?').slice(0,1)}</div><div><strong>{c.customer_name||'Nepoznat klijent'}</strong><small>{c.title||`Razgovor putem ${c.channel}`}</small></div><Status status={c.status}/></div>)}</div>}</div></>} {page==='services'&&<><div className="page-heading"><div><span className="eyebrow">PONUDA SALONA</span><h1>Usluge i cjenik</h1><p>Uredite usluge, trajanje i cijene.</p></div><button className="primary" onClick={()=>{setForm({name:'',duration_minutes:60,price:0});setModal('service')}}><Plus size={17}/> Dodaj uslugu</button></div><div className="service-grid">{services.map(s=><div className="service-card" key={s.id}><div className="service-icon"><Scissors/></div><div className="service-info"><strong>{s.name}</strong><small><Clock3 size={13}/> {s.duration_minutes} min</small></div><div className="service-price">{Number(s.price).toFixed(2)} €</div></div>)}</div>{services.length===0&&<div className="panel"><Empty icon={Scissors} title="Dodajte prvu uslugu" desc="Unesite usluge i cijene koje nudite klijentima." action={()=>setModal('service')}/></div>}</>}
 {page==='staff'&&<><div className="page-heading"><div><span className="eyebrow">VAŠ TIM</span><h1>Zaposlenici</h1><p>Pregledajte i upravljajte članovima tima.</p></div><button className="primary" onClick={()=>{setForm({name:'',email:'',phone:''});setModal('staff')}}><Plus size={17}/> Dodaj zaposlenika</button></div><div className="staff-grid">{staff.map(s=><div className="staff-card" key={s.id}><div className="staff-avatar">{s.name.slice(0,1).toUpperCase()}</div><strong>{s.name}</strong><small>{s.email||s.phone||'Član tima'}</small><span className={`staff-state ${s.is_active?'':'inactive'}`}>{s.is_active?'Aktivan':'Neaktivan'}</span></div>)}</div>{staff.length===0&&<div className="panel"><Empty icon={Users} title="Tim još nije dodan" desc="Dodajte zaposlenike kako biste mogli dodjeljivati termine." action={()=>setModal('staff')}/></div>}</>}
 {page==='settings'&&<><div className="page-heading"><div><span className="eyebrow">KONFIGURACIJA</span><h1>Postavke salona</h1><p>Osnovni podaci i postavke radnog prostora.</p></div></div><div className="settings-grid"><div className="panel settings-panel"><h3>Podaci salona</h3><p className="muted">Osnovne informacije vašeg radnog prostora.</p><label>Naziv salona<input value={salon.name} readOnly/></label><label>Jedinstvena adresa<input value={salon.slug} readOnly/></label><label>Vremenska zona<input value={salon.timezone||'Europe/Zagreb'} readOnly/></label><label>Link za Instagram bio<input readOnly value={`${window.location.origin}/rezervacija/${salon.slug}`} onFocus={e=>e.currentTarget.select()}/></label><button className="secondary" type="button" onClick={()=>navigator.clipboard?.writeText(`${window.location.origin}/rezervacija/${salon.slug}`)}>Kopiraj link za klijente</button><div className="muted small-note">Dodajte ovaj link u Instagram profil kako bi klijenti mogli sami rezervirati termin.</div></div><div className="panel settings-panel"><h3>Radno vrijeme</h3><p className="muted">Postavite dane i sate kada klijenti mogu rezervirati.</p><label>Dani rada<select value={scheduleDays} onChange={e=>setScheduleDays(e.target.value)}><option value="ponedjeljak-petak">Ponedjeljak – petak</option><option value="ponedjeljak-subota">Ponedjeljak – subota</option><option value="ponedjeljak-nedjelja">Ponedjeljak – nedjelja</option><option value="svaki dan">Svaki dan</option>{!['ponedjeljak-petak','ponedjeljak-subota','ponedjeljak-nedjelja','svaki dan'].includes(scheduleDays)&&<option value={scheduleDays}>{scheduleDays}</option>}</select></label><div className="form-row"><label>Od<input type="time" value={scheduleStart} onChange={e=>setScheduleStart(e.target.value)}/></label><label>Do<input type="time" value={scheduleEnd} onChange={e=>setScheduleEnd(e.target.value)}/></label></div><button className="primary" type="button" onClick={saveBusinessHours} disabled={scheduleBusy||!scheduleDays.trim()||scheduleEnd<=scheduleStart}>{scheduleBusy?'Spremam…':'Spremi radno vrijeme'}</button><div className="muted small-note">Radno vrijeme trenutno se postavlja za odabrani raspon dana s istim satima. Pojedinačni raspored po danima i pauze dodat ćemo naknadno.</div></div><div className="panel settings-panel"><h3>Plan i naplata</h3><p className="muted">SaaS pretplate i Stripe naplata.</p><div className="billing-placeholder"><Sparkles/><strong>Salonova SaaS</strong><p>Modul pretplata pripremit ćemo za Stripe Checkout i portal za upravljanje planom.</p><span className="coming-pill">Stripe još nije povezan</span></div></div></div></>}
 </div></main>
 {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={modal==='editBooking'?updateBooking:modal==='service'?addService:addStaff}><div className="modal-head"><div><span className="eyebrow">SALONOVA</span><h2>{modal==='editBooking'?'Uredi rezervaciju':modal==='service'?'Nova usluga':'Novi zaposlenik'}</h2></div><button type="button" className="icon-btn" onClick={()=>setModal(null)}><X/></button></div>{modal==='editBooking'?<><label>Ime klijenta<input required value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/></label><div className="form-row"><label>Datum<input type="date" required value={form.booking_date} onChange={e=>setForm({...form,booking_date:e.target.value})}/></label><label>Vrijeme<input type="time" required value={form.booking_time} onChange={e=>setForm({...form,booking_time:e.target.value})}/></label></div><label>Usluga<select value={form.service} onChange={e=>setForm({...form,service:e.target.value})}><option value="">Odaberite uslugu</option>{services.map(s=><option key={s.id}>{s.name}</option>)}</select></label><label>Zaposlenik<select value={form.stylist} onChange={e=>setForm({...form,stylist:e.target.value})}><option value="">Nije dodijeljen</option>{staff.map(s=><option key={s.id}>{s.name}</option>)}</select></label><label>Telefon<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label></>:modal==='service'?<><label>Naziv usluge<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="form-row"><label>Trajanje (min)<input type="number" min="5" step="5" value={form.duration_minutes} onChange={e=>setForm({...form,duration_minutes:e.target.value})}/></label><label>Cijena (€)<input type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label></div></>:<><label>Ime i prezime<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>E-mail<input type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Telefon<input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label></>}{error&&<div className="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(null)}>Odustani</button><button className="primary" disabled={busy}>{busy?'Spremanje…':modal==='editBooking'?'Spremi promjene':'Spremi'}</button></div></form></div>}
 {selectedClient&&<div className="modal-backdrop" onClick={()=>setSelectedClient(null)}><section className="modal client-detail-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">KARTICA KLIJENTA</span><h2>{selectedClient.name}</h2></div><button type="button" className="icon-btn" onClick={()=>setSelectedClient(null)}><X/></button></div><div className="client-detail-stats"><div><small>Telefon</small><strong>{selectedClient.phone||'Nije upisan'}</strong></div><div><small>Ukupno rezervacija</small><strong>{selectedClient.visits}</strong></div></div><div className="client-profile-editor"><div className="client-profile-heading"><h3>Profil klijenta</h3><label className="regular-client-toggle"><input type="checkbox" checked={clientRegular} onChange={e=>setClientRegular(e.target.checked)}/> Stalni klijent</label></div><label className="client-notes-label">Interna bilješka salona<textarea rows={4} value={clientNotes} onChange={e=>setClientNotes(e.target.value)} placeholder="Npr. preferira termin ujutro, omiljena boja, posebne napomene…"/></label>{clientProfileError&&<div className="alert">{clientProfileError}</div>}<button type="button" className="primary" onClick={saveClientProfile} disabled={savingClient}>{savingClient?'Spremanje…':'Spremi profil'}</button></div><h3>Povijest rezervacija</h3><div className="client-history">{bookings.filter(b=>{const phone=(b.phone||'').replace(/\D/g,'');const selectedPhone=(selectedClient.phone||'').replace(/\D/g,'');return selectedPhone?phone===selectedPhone:b.client_name.trim().toLocaleLowerCase('hr-HR')===selectedClient.name.trim().toLocaleLowerCase('hr-HR')}).sort((a,b)=>`${b.booking_date} ${b.booking_time}`.localeCompare(`${a.booking_date} ${a.booking_time}`)).map((b,i)=><div className="client-history-row" key={b.id||i}><div><strong>{b.service||'Usluga'}</strong><small>{b.booking_date} · {b.booking_time}</small></div><span className={`status ${b.status==='completed'?'blue':b.status==='cancelled'?'red':b.status==='confirmed'?'green':'yellow'}`}>{b.status==='completed'?'Završeno':b.status==='cancelled'?'Otkazano':b.status==='confirmed'?'Potvrđeno':'Na čekanju'}</span></div>)}{!bookings.some(b=>{const phone=(b.phone||'').replace(/\D/g,'');const selectedPhone=(selectedClient.phone||'').replace(/\D/g,'');return selectedPhone?phone===selectedPhone:b.client_name.trim().toLocaleLowerCase('hr-HR')===selectedClient.name.trim().toLocaleLowerCase('hr-HR')})&&<p className="muted">Nema pronađenih rezervacija.</p>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setSelectedClient(null)}>Zatvori</button></div></section></div>}
 </div>
}
function Stat({icon:Icon,label,value,hint}:any){return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={18}/></div></div><strong>{value}</strong><small>{hint}</small></div>}
function Empty({icon:Icon,title,desc,action}:any){return <div className="empty"><div className="empty-icon"><Icon size={22}/></div><strong>{title}</strong><p>{desc}</p>{action&&<button className="secondary" onClick={action}><Plus size={15}/> Dodaj</button>}</div>}
function Status({status}:any){const map:any={pending:['Na čekanju','yellow'],confirmed:['Potvrđeno','green'],completed:['Završeno','blue'],cancelled:['Otkazano','red'],open:['Otvoren','green'],closed:['Zatvoren','gray']};const [label,cls]=map[status]||[status,'gray'];return <span className={`status ${cls}`}>{label}</span>}
function Quick({icon:Icon,title,desc,click}:any){return <button className="quick-link" onClick={click}><div className="quick-icon"><Icon size={17}/></div><div><strong>{title}</strong><small>{desc}</small></div><ChevronRight size={16}/></button>}
function Channel({name,note,symbol}:any){return <div className="channel-card"><div className="channel-symbol">{symbol}</div><div><strong>{name}</strong><small>{note}</small></div><span className="coming-pill">U pripremi</span></div>}
function Setup(){return <div className="setup"><div className="brand"><span className="brand-mark">S</span><span>salonova</span></div><div className="panel setup-panel"><Sparkles size={28}/><h1>Još jedan korak do Salonove</h1><p>Dodajte Supabase podatke u Netlify environment variables ili lokalni <code>.env</code>.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><p className="muted">Vrijednosti pronađite u Supabase projektu pod Project Settings → API. Koristite samo publishable/anon ključ.</p></div></div>}


type PublicService = {id:string;name:string;duration_minutes:number;price:number}
type PublicSalon = {id:string;name:string;slug:string;timezone:string;phone?:string|null;services:PublicService[];staff:{id:string;name:string}[];business_hours?:{default?:{days?:string;start?:string;end?:string};[key:string]:any}}
function localDate(d:Date){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function ReceptionTestChat({salon,services,hours}:{salon:Salon;services:Service[];hours:any}) {
 const [messages,setMessages]=useState<{role:'user'|'assistant';content:string}[]>([{role:'assistant',content:`Pozdrav! Ja sam probna virtualna recepcija salona ${salon.name}. Pitajte me bilo što o uslugama, cijenama ili radnom vremenu.`}]);
 const [input,setInput]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState('');
 async function send(){
  const text=input.trim();if(!text||sending)return;
  const next=[...messages,{role:'user' as const,content:text}];setMessages(next);setInput('');setSending(true);setError('');
  try{
   const response=await fetch('/api/reception',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context:{salonName:salon.name,services:services.filter(s=>s.is_active).map(s=>({name:s.name,duration_minutes:s.duration_minutes,price:s.price})),businessHours:hours,timezone:salon.timezone},messages:next.slice(-12)})});
   const data=await response.json();if(!response.ok)throw new Error(data?.error||'Virtualna recepcija trenutačno ne odgovara.');
   setMessages(m=>[...m,{role:'assistant',content:data.reply||'Oprostite, nisam uspjela sastaviti odgovor.'}]);
  }catch(e:any){setError(e.message||'Greška povezivanja');}
  finally{setSending(false)}
 }
 return <div className="reception-test"><div className="reception-test-head"><div><strong><Sparkles size={16}/> Testirajte pametnu recepciju</strong><small>Probni razgovor s podacima vašeg salona</small></div><span className="test-status">PROTOTIP</span></div><div className="reception-test-messages">{messages.map((m,i)=><div key={i} className={m.role==='user'?'test-message user':'test-message assistant'}><span>{m.content}</span></div>)}{sending&&<div className="test-message assistant"><span>Razmišljam…</span></div>}</div>{error&&<p className="reception-test-error">{error}</p>}<form className="reception-test-input" onSubmit={e=>{e.preventDefault();send()}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Npr. Koliko košta šišanje?" disabled={sending}/><button type="submit" disabled={!input.trim()||sending} aria-label="Pošalji"><ArrowUpRight size={17}/></button></form></div>
}

function PublicBooking({slug}:{slug:string}){
 const [salon,setSalon]=useState<PublicSalon|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [service,setService]=useState(''),[date,setDate]=useState(''),[slots,setSlots]=useState<string[]>([]),[slot,setSlot]=useState('')
 const [availability,setAvailability]=useState<Record<string,boolean>>({}),[availabilityBusy,setAvailabilityBusy]=useState(false)
 const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)})
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[clientEmail,setClientEmail]=useState(''),[staff,setStaff]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState<any>(null)
 const [question,setQuestion]=useState(''),[messages,setMessages]=useState<{role:'user'|'assistant';text:string}[]>([]),[showServices,setShowServices]=useState(false)
 const today=localDate(new Date()),maxDate=localDate(new Date(Date.now()+60*86400000))
 useEffect(()=>{(async()=>{if(!supabase){setError('Recepcija se trenutno ne može povezati.');setLoading(false);return}
   const {data,error}=await supabase.rpc('get_public_salon',{p_slug:slug})
   if(error||!data){setError('Ovaj salon nije pronađen ili još nije aktivirao online rezervacije.');setLoading(false);return}
   setSalon(data as PublicSalon);await supabase.rpc('track_public_visit',{p_slug:slug});setLoading(false)
 })()},[slug])
 useEffect(()=>{(async()=>{if(!supabase||!service)return;setAvailabilityBusy(true);const first=new Date(month.getFullYear(),month.getMonth(),1);const last=new Date(month.getFullYear(),month.getMonth()+1,0);const dates:string[]=[]
   for(let d=new Date(first);d<=last;d.setDate(d.getDate()+1)){const key=localDate(d);if(key>=today&&key<=maxDate)dates.push(key)}
   const pairs=await Promise.all(dates.map(async key=>{const {data}=await supabase!.rpc('get_public_slots',{p_slug:slug,p_service_id:service,p_date:key});return [key,!!data?.length] as const}))
   setAvailability(Object.fromEntries(pairs));setAvailabilityBusy(false)
 })()},[slug,service,month,today,maxDate])
 useEffect(()=>{(async()=>{if(!supabase||!service||!date)return;setSlot('');setSlots([]);const {data,error}=await supabase.rpc('get_public_slots',{p_slug:slug,p_service_id:service,p_date:date});if(error){setError(error.message);return}setSlots((data||[]).map((x:any)=>String(x.slot_time).slice(0,5)))})()},[slug,service,date])
 async function confirmBooking(){if(!supabase||!service||!slot||!name.trim()||!phone.trim()||!clientEmail.trim())return;setBusy(true);setError('');const {data,error}=await supabase.rpc('create_public_booking',{p_slug:slug,p_service_id:service,p_date:date,p_time:slot,p_client_name:name,p_phone:phone,p_staff_id:staff||null,p_client_email:clientEmail.trim()});if(error){setError(error.message);setMessages(m=>[...m,{role:'assistant',text:'Žao mi je, taj termin više nije dostupan. Odaberite drugi slobodan termin u kalendaru.'}])}else{setConfirmed(data);setMessages(m=>[...m,{role:'assistant',text:`Odlično, ${name}! Vaša rezervacija za ${chosen?.name} potvrđena je za ${new Date(`${date}T12:00:00`).toLocaleDateString('hr-HR')} u ${slot}. Hvala vam!`}])}setBusy(false)}
 const money=(n:number)=>new Intl.NumberFormat('hr-HR',{style:'currency',currency:'EUR'}).format(Number(n||0))
 const chosen=salon?.services.find(s=>s.id===service)
 function chooseService(s:PublicService){setService(s.id);setDate('');setSlot('');setShowServices(false);setConfirmed(null);setMessages(m=>[...m,{role:'user',text:`Želim rezervirati ${s.name}.`},{role:'assistant',text:`Odlično! ${s.name} traje ${s.duration_minutes} minuta${s.price>0?` i košta ${money(s.price)}`:''}. Sada odaberite zeleni dan u kalendaru, a zatim slobodan sat.`}])}
 async function ask(text?:string){
   const q=(text??question).trim();if(!q||!salon)return
   const n=q.toLocaleLowerCase('hr-HR').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   let answer='Mogu vam pomoći s rezervacijom, uslugama, cijenama i radnim vremenom. Napišite što vas zanima.'
   const monthAliases:Record<string,number>={
     sijecnja:0,sijecanj:0,veljace:1,veljaca:1,ozujka:2,ozujak:2,travnja:3,travanj:3,
     svibnja:4,svibanj:4,lipnja:5,lipanj:5,srpnja:6,srpanj:6,kolovoza:7,kolovoz:7,
     rujna:8,rujan:8,listopada:9,listopad:9,studenog:10,studeni:10,prosinca:11,prosinac:11
   }
   let parsedDate=''
   const monthMatch=n.match(/\b(\d{1,2})\.?\s*(sijecnja|sijecanj|veljace|veljaca|ozujka|ozujak|travnja|travanj|svibnja|svibanj|lipnja|lipanj|srpnja|srpanj|kolovoza|kolovoz|rujna|rujan|listopada|listopad|studenog|studeni|prosinca|prosinac)\b/)
   const numericMatch=n.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\.?(?=$|\s|[^0-9])/)
   if(monthMatch||numericMatch){
     const day=Number((monthMatch||numericMatch)![1])
     const monthIndex=monthMatch?monthAliases[monthMatch[2]]:Number(numericMatch![2])-1
     let year=numericMatch?.[3]?Number(numericMatch[3]):new Date().getFullYear()
     if(year<100)year+=2000
     const candidate=new Date(year,monthIndex,day)
     if(candidate.getFullYear()===year&&candidate.getMonth()===monthIndex&&candidate.getDate()===day){
       if(!numericMatch?.[3]&&localDate(candidate)<today)candidate.setFullYear(year+1)
       parsedDate=localDate(candidate)
     }
   }
   if(service&&parsedDate){
     const chosenService=salon.services.find(x=>x.id===service)
     if(parsedDate<today||parsedDate>maxDate){
       answer='Molim odaberite datum unutar sljedećih 60 dana.'
     }else{
       setDate(parsedDate);setMonth(new Date(Number(parsedDate.slice(0,4)),Number(parsedDate.slice(5,7))-1,1))
       const {data,error}=await supabase!.rpc('get_public_slots',{p_slug:slug,p_service_id:service,p_date:parsedDate})
       const available=(data||[]).map((x:any)=>String(x.slot_time).slice(0,5))
       setSlots(available)
       const pretty=new Date(parsedDate+'T12:00:00').toLocaleDateString('hr-HR')
       answer=error?'Trenutačno ne mogu provjeriti termine. Pokušajte ponovno.':available.length
         ?`Za ${pretty} slobodni termini za ${chosenService?.name||'odabranu uslugu'} su: ${available.join(', ')}. Koji vam odgovara?`
         :`Nažalost, za ${pretty} nema slobodnih termina za ${chosenService?.name||'odabranu uslugu'}. Želite li provjeriti drugi datum?`
     }
     setMessages(m=>[...m,{role:'user',text:q},{role:'assistant',text:answer}]);setQuestion('');return
   }
   // If the bot has just offered available times, interpret a short reply such as
   // '11', '11:00', or 'u 11' as selection of one of those offered slots.
   if(service && slots.length){
     const timeMatch=n.match(/(?:^|\s|u\s*)(\d{1,2})(?::(\d{2}))?(?:\s*(?:h|sati?|\.)?)?(?:$|\s)/)
     if(timeMatch){
       const hour=String(Number(timeMatch[1])).padStart(2,'0')
       const minute=timeMatch[2]||'00'
       const requestedTime=`${hour}:${minute}`
       const selectedTime=slots.find(t=>t===requestedTime)
       if(selectedTime){
         const selectedService=salon.services.find(x=>x.id===service)
         setSlot(selectedTime)
         answer=`Odabrali ste ${selectedService?.name||'uslugu'} u ${selectedTime}. Molimo unesite ime i prezime te broj telefona u obrascu ispod kalendara kako biste potvrdili rezervaciju.`
       }else{
         answer=`Taj termin nije na popisu slobodnih termina. Odaberite jedan od ponuđenih: ${slots.join(', ')}.`
       }
       setMessages(m=>[...m,{role:'user',text:q},{role:'assistant',text:answer}]);setQuestion('');return
     }
   }
   // Match the complete service name first. Do not match only the generic word
   // 'sisanje', otherwise every haircut question can incorrectly select the first haircut.
   const normalizeServiceName=(value:string)=>value.toLocaleLowerCase('hr-HR')
     .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
     .replace(/\([^)]*\)/g,' ')
     .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
   const matched=[...salon.services]
     .sort((a,b)=>normalizeServiceName(b.name).length-normalizeServiceName(a.name).length)
     .find(x=>{
       const serviceName=normalizeServiceName(x.name)
       return serviceName.length>0 && (` ${n.replace(/[^a-z0-9]+/g,' ').trim()} `).includes(` ${serviceName} `)
     }) || [...salon.services].find(x=>{
       const words=normalizeServiceName(x.name).split(/\s+/).filter(w=>w.length>2 && !['od','min'].includes(w))
       const queryWords=n.replace(/[^a-z0-9]+/g,' ').split(/\s+/)
       return words.length>=2 && words.every(w=>queryWords.includes(w))
     })
   const dayAliases:[string,string[]][]=[
     ['monday',['ponedjeljak','ponedjeljkom','pon']],
     ['tuesday',['utorak','utorkom','uto']],
     ['wednesday',['srijeda','srijedom','sri']],
     ['thursday',['cetvrtak','cetvrtkom','cet']],
     ['friday',['petak','petkom','pet']],
     ['saturday',['subota','subotom','sub']],
     ['sunday',['nedjelja','nedjeljom','ned']]
   ]
   const requestedDay=dayAliases.find(([,aliases])=>aliases.some(a=>n.includes(a)))
   const hours:any=salon.business_hours||{}
   const dayHours=requestedDay?(hours[requestedDay[0]]||hours[requestedDay[1][0]]):null
   const hasHoursQuestion=!!requestedDay||n.includes('radno vrijeme')||n.includes('kad rad')||n.includes('otvoreni')||n.includes('radite')
   if(requestedDay){
     if(dayHours?.closed===true||dayHours?.is_closed===true){
       answer=`Nažalost, ${requestedDay[1][0]==='subota'?'subotom':requestedDay[1][0]==='nedjelja'?'nedjeljom':`dan ${requestedDay[1][0]}`} ne radimo. Želite li provjeriti neki drugi dan?`
     }else if(dayHours?.start&&dayHours?.end){
       const dayLabel=requestedDay[1][0]==='subota'?'Subotom':requestedDay[1][0]==='nedjelja'?'Nedjeljom':`Danom ${requestedDay[1][0]}`
       answer=`${dayLabel} radimo od ${dayHours.start} do ${dayHours.end}. Želite li provjeriti slobodne termine?`
     }else{
       const fallback=hours.default
       answer=fallback?.start&&fallback?.end
         ?`Za ${requestedDay[1][0]} nemam posebno potvrđeno radno vrijeme. Opći raspored je ${fallback.days||'prema rasporedu'} od ${fallback.start} do ${fallback.end}.`
         :`Radno vrijeme za ${requestedDay[1][0]} još nije uneseno.`
     }
   }else if(hasHoursQuestion){
     const h=hours.default
     const dayOrder=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
     const names:any={monday:'Ponedjeljak',tuesday:'Utorak',wednesday:'Srijeda',thursday:'Četvrtak',friday:'Petak',saturday:'Subota',sunday:'Nedjelja'}
     const localKeys:any={monday:'ponedjeljak',tuesday:'utorak',wednesday:'srijeda',thursday:'cetvrtak',friday:'petak',saturday:'subota',sunday:'nedjelja'}
     const details=dayOrder.map(k=>{
       const v=hours[k]||hours[localKeys[k]]
       if(!v||typeof v!=='object')return null
       return v.closed||v.is_closed?`${names[k]}: zatvoreno`:v.start&&v.end?`${names[k]}: ${v.start}–${v.end}`:null
     }).filter(Boolean)
     answer=details.length?`Radno vrijeme:\n${details.join('\n')}`:h?.start&&h?.end?`Radimo ${h.days||'prema rasporedu'} od ${h.start} do ${h.end}.`:'Radno vrijeme još nije uneseno.'
   }else if(matched&&(n.includes('rezerv')||n.includes('termin')||n.includes('naruc')||n.includes('zelim'))){
     chooseService(matched);setMessages(m=>[...m,{role:'user',text:q}]);setQuestion('');return
   }else if(n.includes('rezerv')||n.includes('termin')||n.includes('naruc')){
     if(!salon.services.length)answer='Rado ćemo vam pomoći s rezervacijom. Salon još nije unio popis usluga, pa rezervacija trenutno nije dostupna.'
     else{answer='Naravno! Odaberite uslugu koju želite rezervirati:';setShowServices(true)}
   }else if(matched&&(n.includes('cijen')||n.includes('kosta')||n.includes('koliko')||n.includes('traj')||n.includes('minut'))){
     // Remember the exact service the customer asked about, so "Da" can continue
     // directly into booking instead of losing the selected service.
     setService(matched.id);setDate('');setSlot('');setShowServices(false);setConfirmed(null)
     answer=`${matched.name} traje ${matched.duration_minutes} minuta${matched.price>0?` i košta ${money(matched.price)}`:''}. Želite li rezervirati termin?`
   }else if(n.includes('cijen')||n.includes('uslug')){
     answer=salon.services.length?'U ponudi imamo: '+salon.services.map(x=>`${x.name} — ${money(x.price)}, ${x.duration_minutes} min`).join('; ')+'.':'Popis usluga i cijena još nije unesen.'
   }else if(matched){
     // Store the service as soon as the customer names it. This lets a following
     // affirmative reply ('Da') continue to date selection without showing the
     // full service list again.
     setService(matched.id);setDate('');setSlot('');setShowServices(false);setConfirmed(null)
     answer=`Pronašla sam uslugu ${matched.name}. Traje ${matched.duration_minutes} minuta${matched.price>0?` i košta ${money(matched.price)}`:''}. Želite li rezervirati?`
   }else if(/bok|pozdrav|dobar dan|hello|hej/.test(n)){
     answer='Pozdrav! Dobro došli u '+salon.name+'. Želite li rezervirati termin ili provjeriti usluge i cijene?'
   }else if(/^(moze|da|da molim|naravno|ajde|moze hvala|da hvala)[.!? ]*$/i.test(n)&&service){
     answer='Naravno! Koji datum vam odgovara? Napišite, primjerice, „10. studenog”, pa ću provjeriti slobodne termine za odabranu uslugu.'
   }else if(/^(moze|da|da molim|naravno|ajde|moze hvala|da hvala)[.!? ]*$/i.test(n)&&!service){
     answer='Naravno! Prvo odaberite uslugu koju želite rezervirati:'
     setShowServices(true)
   }else if(!salon.services.length){
     answer='Trenutačno još nisu unesene usluge salona. Možete nam napisati što vas zanima.'
   }else if(service){
     answer='Razumijem. Usluga je već odabrana. Mogu provjeriti slobodne termine — napišite datum koji vam odgovara.'
   }
   setMessages(m=>[...m,{role:'user',text:q},{role:'assistant',text:answer}]);setQuestion('')
 }
 const hours=salon?.business_hours?.default;const configuredHours=!!(hours?.start&&hours?.end);const startParts=(hours?.start||'00:00').split(':').map(Number);const endParts=(hours?.end||'00:00').split(':').map(Number);const startMinutes=startParts[0]*60+(startParts[1]||0);const endMinutes=endParts[0]*60+(endParts[1]||0);const timeOptions:string[]=[];if(configuredHours&&chosen){for(let t=startMinutes;t<endMinutes-chosen.duration_minutes+1;t+=30)timeOptions.push(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`)}const monthLabel=month.toLocaleDateString('hr-HR',{month:'long',year:'numeric'});const offset=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();const days:(number|null)[]=[...Array.from({length:offset},()=>null as number|null),...Array.from({length:count},(_,i)=>i+1)]
 if(loading)return <div className="public-shell"><div className="public-loading">Salonova · Učitavamo recepciju…</div></div>
 if(!salon)return <div className="public-shell"><div className="public-error"><span className="public-mark">S</span><h1>Salonova</h1><p>{error}</p></div></div>
 return <div className="public-shell"><header className="public-header"><div className="public-brand"><span className="public-mark">S</span><span>{salon.name}<small>VIRTUALNA RECEPCIJA</small></span></div><span className="public-online"><i/> Online</span></header>
  <main className="public-main"><div className="public-chat-head"><span className="public-mark large">S</span><h1>{salon.name}</h1><p>Dobro došli! Napišite što želite rezervirati ili odaberite jedno od ponuđenih pitanja.</p></div>
   <section className="public-conversation"><div className="chat-bubble assistant">Pozdrav! 👋 Ja sam virtualna recepcija salona {salon.name}. Mogu vam pomoći pronaći uslugu i slobodan termin. Što želite rezervirati?</div><div className="chat-actions"><button onClick={()=>ask('Želim rezervirati termin')}>Rezerviraj termin</button><button onClick={()=>ask('Koje su cijene usluga?')}>Usluge i cijene</button><button onClick={()=>ask('Koje je radno vrijeme?')}>Radno vrijeme</button></div>
    {messages.map((m,i)=><div key={i} className={`chat-bubble ${m.role}`}>{m.text}</div>)}
    {showServices&&<div className="chat-service-options">{salon.services.length?salon.services.map(s=><button key={s.id} onClick={()=>chooseService(s)}><span>{s.name}<small>{s.duration_minutes} min · {money(s.price)}</small></span><b>Odaberi</b></button>):<p className="public-muted">Salon još nije unio usluge. Rezervacije će biti dostupne čim ih unese.</p>}</div>}
    <form className="public-ask" onSubmit={e=>{e.preventDefault();ask()}}><input aria-label="Vaša poruka" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Napišite poruku…"/><button type="submit" disabled={!question.trim()}>Pošalji</button></form>{error&&<div className="public-alert">{error}</div>}
   </section>
   <section className="public-calendar"><div className="calendar-heading"><div><strong>Kalendar slobodnih termina</strong><small>{!salon.services.length?'Usluge još nisu unesene.':!service?'Prvo u chatu odaberite uslugu.':`Odabrana usluga: ${chosen?.name}`}</small></div><div className="calendar-month"><button aria-label="Prethodni mjesec" disabled={month.getFullYear()===new Date().getFullYear()&&month.getMonth()===new Date().getMonth()} onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><b>{monthLabel}</b><button aria-label="Sljedeći mjesec" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button></div></div>
    <div className="calendar-grid calendar-weekdays">{['Pon','Uto','Sri','Čet','Pet','Sub','Ned'].map(x=><span key={x}>{x}</span>)}</div>
    <div className="calendar-grid">{days.map((day,i)=>{if(!day)return <span key={`blank-${i}`}/>;const key=localDate(new Date(month.getFullYear(),month.getMonth(),day));const past=key<today||key>maxDate;const available=availability[key];return <button key={key} disabled={!service||past||!available||availabilityBusy} className={`${date===key?'active':''} ${available?'available':''}`} onClick={()=>{setDate(key);setSlot('');setConfirmed(null)}}>{day}</button>})}</div>
    <div className="calendar-legend"><span><i className="legend-free"/> Slobodno</span><span><i className="legend-full"/> Zauzeto / nedostupno</span></div>
    {!salon.services.length&&<p className="calendar-note">Salon još nije unio usluge.</p>}{salon.services.length>0&&!configuredHours&&<p className="calendar-note">Radno vrijeme još nije uneseno. Slobodni termini prikazat će se nakon unosa radnog vremena.</p>}
    {availabilityBusy&&service&&<p className="calendar-note">Provjeravam slobodne dane…</p>}
    {service&&date&&<><div className="public-slots-title">Slobodni termini · {new Date(`${date}T12:00:00`).toLocaleDateString('hr-HR',{day:'numeric',month:'long'})}</div><div className="public-slots">{timeOptions.filter(t=>slots.includes(t)).map(t=><button key={t} className={`${slot===t?'selected':'time-free'}`} onClick={()=>setSlot(t)}>{t}</button>)}{!slots.length&&<p className="public-muted">Nema slobodnih termina za odabrani dan. Odaberite drugi zeleni dan.</p>}</div></>}
    {service&&slot&&<div className="calendar-booking"><p>Odabrali ste <b>{chosen?.name}</b> u <b>{slot}</b>.</p><label className="public-field">Ime i prezime<input value={name} onChange={e=>setName(e.target.value)} placeholder="Vaše ime i prezime"/></label><label className="public-field">Broj telefona<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+385…" inputMode="tel"/></label><label className="public-field">E-mail za podsjetnik<input type="email" value={clientEmail} onChange={e=>setClientEmail(e.target.value)} placeholder="ime@email.com" autoComplete="email" required/></label>{salon.staff.length>0&&<label className="public-field">Djelatnik (nije obavezno)<select value={staff} onChange={e=>setStaff(e.target.value)}><option value="">Bilo tko</option>{salon.staff.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}<button className="public-confirm" disabled={busy||name.trim().length<2||phone.trim().length<6||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())} onClick={confirmBooking}>{busy?'Potvrđujemo…':'Potvrdi rezervaciju'}</button></div>}
    {confirmed&&<div className="public-success"><span>✓</span><h2>Termin je potvrđen!</h2><strong>{new Date(`${date}T12:00:00`).toLocaleDateString('hr-HR')} u {slot}</strong><small>Potvrda je spremljena.</small></div>}
   </section>
  </main><footer className="public-footer">Virtualna recepcija · <a href="https://salonova.eu">Salonova</a></footer>
 </div>
}

export default function App() {
  const path = window.location.pathname

  const match = path.match(/^\/rezervacija\/([^/]+)\/?$/)

  if (match) {
    return <PublicBooking slug={decodeURIComponent(match[1])} />
  }

  if (path === '/vlasnik' || path.startsWith('/vlasnik/')) {
    return <DashboardApp />
  }

  return <LandingPage />
}
