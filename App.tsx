import { useEffect, useMemo, useState } from 'react'
import { supabase, configured, type Salon, type Booking, type Service, type Staff, type Conversation } from './lib'
import { LayoutDashboard, CalendarDays, Inbox, Users, Scissors, Settings, LogOut, Plus, Search, Bell, Menu, X, Check, Clock3, Euro, UserRound, Sparkles, MessageCircle, ArrowUpRight, ChevronRight } from 'lucide-react'

type Page = 'dashboard'|'bookings'|'inbox'|'services'|'staff'|'settings'
const nav: {id:Page; label:string; icon:any}[] = [
 {id:'dashboard',label:'Pregled',icon:LayoutDashboard},{id:'bookings',label:'Rezervacije',icon:CalendarDays},
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
 const [modal,setModal]=useState<'booking'|'service'|'staff'|null>(null)
 const [search,setSearch]=useState('')
 const [ownerInput,setOwnerInput]=useState('')
 const [ownerReply,setOwnerReply]=useState('Pozdrav! Ovdje možete upisati podatke koje ste dobili od vlasnika, npr. ‘Šišanje košta 20 eura i traje 45 minuta’ ili ‘Radimo ponedjeljak do petka od 9 do 17’.')
 const [ownerBusy,setOwnerBusy]=useState(false)
 const [form,setForm]=useState<any>({client_name:'',service:'',booking_date:today,booking_time:'10:00',phone:'',stylist:'',name:'',duration_minutes:60,price:0})

 useEffect(()=>{ if(!supabase){setLoading(false);return}
   supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);setSalon(null)})
   return ()=>subscription.unsubscribe()
 },[])
 useEffect(()=>{ if(session?.user) loadWorkspace() },[session])
 async function loadWorkspace(){
   if(!supabase||!session)return
   setLoading(true);setError('')
   const {data:membership,error:me}=await supabase.from('salon_memberships').select('salon_id,salons(id,name,slug,timezone,public_views)').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
   if(me){setError(me.message);setLoading(false);return}
   const found=(membership as any)?.salons
   if(!found){setSalon(null);setLoading(false);return}
   setSalon(found)
   const sid=found.id
   const [b,s,st,c]=await Promise.all([
     supabase.from('bookings').select('*').eq('salon_id',sid).order('booking_date',{ascending:true}).order('booking_time',{ascending:true}).limit(100),
     supabase.from('salon_services').select('*').eq('salon_id',sid).order('sort_order'),
     supabase.from('salon_staff').select('*').eq('salon_id',sid).order('name'),
     supabase.from('conversations').select('*').eq('salon_id',sid).order('updated_at',{ascending:false}).limit(50)
   ])
   if(b.error||s.error||st.error||c.error)setError(b.error?.message||s.error?.message||st.error?.message||c.error?.message||'Greška učitavanja')
   setBookings((b.data||[]) as Booking[]);setServices((s.data||[]) as Service[]);setStaff((st.data||[]) as Staff[]);setConversations((c.data||[]) as Conversation[])
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
 async function addBooking(e:React.FormEvent){
   e.preventDefault();if(!supabase||!salon)return
   setBusy(true);const {error}=await supabase.from('bookings').insert({...form,salon_id:salon.id,service:form.service||null,stylist:form.stylist||null,status:'pending',channel:'manual'})
   if(error)setError(error.message);else{setModal(null);setForm({...form,client_name:'',phone:''});await loadWorkspace()}
   setBusy(false)
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
 async function saveOwnerInstruction(){
   if(!supabase||!salon||!ownerInput.trim())return
   const raw=ownerInput.trim(); const lower=raw.toLocaleLowerCase('hr-HR'); setOwnerBusy(true); setError('')
   try{
     const {data:existing}=await supabase.from('salon_settings').select('business_hours,public_profile').eq('salon_id',salon.id).maybeSingle()
     const hours:any=existing?.business_hours||{}; const profile:any=existing?.public_profile||{}
     const moneyMatch=lower.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:€|eur(?:a|o)?)/i)
     const durationMatch=lower.match(/(\d+)\s*(?:min(?:uta|ute|uta)?|minuta)/i)
     const hourMatch=lower.match(/(?:od\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:-|do|–)\s*(\d{1,2})(?::(\d{2}))?/i)
     const dayMatch=lower.match(/(pon(?:edjeljak)?[^.]*?(?:pet(?:ak)?|sub(?:ota)?|ned(?:jelja)?))/i)
     if(moneyMatch&&durationMatch){
       let name=raw.slice(0, moneyMatch.index).replace(/^(cijena\s+)?(usluga\s+)?/i,'').replace(/\b(je|iznosi|košta|kosta|cijena)\b/gi,'').trim().replace(/[,:;.-]+$/,'')
       if(!name)name='Nova usluga'
       const {data:found}=await supabase.from('salon_services').select('id').eq('salon_id',salon.id).ilike('name',name).maybeSingle()
       const payload={salon_id:salon.id,name,duration_minutes:Number(durationMatch[1]),price:Number(moneyMatch[1].replace(',','.')),is_active:true}
       const result=found?await supabase.from('salon_services').update(payload).eq('id',found.id):await supabase.from('salon_services').insert(payload)
       if(result.error)throw result.error
       setOwnerReply(`Razumjela sam. Usluga „${name}” spremljena je: ${payload.price.toFixed(2)} € i ${payload.duration_minutes} minuta. Ove podatke sada mogu prikazati klijentima.`)
       setOwnerInput(''); await loadWorkspace(); return
     }
     if(hourMatch){
       const days=dayMatch?.[1]||'ponedjeljak-petak'
       const start=`${hourMatch[1].padStart(2,'0')}:${(hourMatch[2]||'00')}`; const end=`${hourMatch[3].padStart(2,'0')}:${(hourMatch[4]||'00')}`
       hours.default={days,start,end};
       const {error}=await supabase.from('salon_settings').upsert({salon_id:salon.id,business_hours:hours,public_profile:profile,updated_at:new Date().toISOString()},{onConflict:'salon_id'})
       if(error)throw error
       setOwnerReply(`Spremljeno radno vrijeme: ${days}, od ${start} do ${end}.`);setOwnerInput('');return
     }
     profile.instructions=[...(Array.isArray(profile.instructions)?profile.instructions:[]),raw].slice(-30)
     const {error}=await supabase.from('salon_settings').upsert({salon_id:salon.id,business_hours:hours,public_profile:profile,updated_at:new Date().toISOString()},{onConflict:'salon_id'})
     if(error)throw error
     setOwnerReply('Poruku sam spremila u upute salona. Za automatsko strukturirano ažuriranje usluge napišite, primjerice: „Balayage 90 eura, traje 180 minuta”. Za radno vrijeme: „Radimo ponedjeljak do petka od 9 do 17”.')
     setOwnerInput('')
   }catch(e:any){setError(e.message||'Nije moguće spremiti uputu.')}finally{setOwnerBusy(false)}
 }
 async function updateStatus(id:string,status:string){
   if(!supabase)return;const {error}=await supabase.from('bookings').update({status}).eq('id',id)
   if(error)setError(error.message);else await loadWorkspace()
 }
 async function signOut(){await supabase?.auth.signOut();setSalon(null)}
 const todays=useMemo(()=>bookings.filter(b=>b.booking_date===today),[bookings])
 const upcoming=useMemo(()=>bookings.filter(b=>b.booking_date>=today&&b.status!=='cancelled').slice(0,6),[bookings])
 if(!configured)return <Setup/>
 if(loading)return <div className="loading"><div className="brand-mark">S</div><p>Učitavamo Salonovu…</p></div>
 if(!session)return <div className="auth-shell"><div className="auth-art"><div className="brand"><span className="brand-mark">S</span><span>salonova</span></div><div className="auth-message"><span className="eyebrow">VIRTUALNA RECEPCIJA</span><h1>Vi se posvetite klijentima.<br/><i>Mi brinemo o organizaciji.</i></h1><p>Jedno mjesto za rezervacije, klijente i svakodnevni rad vašeg salona.</p></div><div className="auth-foot">Salonova · Salon management platform</div></div><form className="auth-card" onSubmit={auth}><span className="eyebrow">{authMode==='login'?'DOBRO DOŠLI NATRAG':'ZAPOČNITE S RADOM'}</span><h2>{authMode==='login'?'Prijava u Salonovu':'Kreirajte račun'}</h2><p className="muted">Pristupite svojoj virtualnoj recepciji.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="ime@salon.hr"/></label><label>Lozinka<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} placeholder="Najmanje 6 znakova"/></label>{error&&<div className="alert">{error}</div>}<button className="primary wide" disabled={busy}>{busy?'Molimo pričekajte…':authMode==='login'?'Prijavi se':'Registriraj se'}</button><p className="switch">{authMode==='login'?'Nemate račun?':'Već imate račun?'} <button type="button" className="link" onClick={()=>{setAuthMode(authMode==='login'?'signup':'login');setError('')}}>{authMode==='login'?'Registracija':'Prijava'}</button></p></form></div>
 if(!salon)return <div className="onboard"><div className="brand"><span className="brand-mark">S</span><span>salonova</span></div><form className="auth-card" onSubmit={createSalon}><span className="eyebrow">JOŠ SAMO JEDAN KORAK</span><h2>Postavite svoj salon</h2><p className="muted">Ovaj salon bit će vaš privatni radni prostor.</p><label>Naziv salona<input value={salonName} onChange={e=>setSalonName(e.target.value)} required placeholder="Studio Ana"/></label><label>Adresa aplikacije (slug)<input value={salonSlug} onChange={e=>setSalonSlug(e.target.value)} placeholder="studio-ana"/></label>{error&&<div className="alert">{error}</div>}<button className="primary wide" disabled={busy}>{busy?'Spremanje…':'Kreiraj salon'}</button></form></div>
 return <div className="app-shell"><aside className={`sidebar ${mobile?'open':''}`}><div className="brand"><span className="brand-mark">S</span><span>salonova</span><button className="mobile-close" onClick={()=>setMobile(false)}><X/></button></div><div className="salon-switch"><div className="salon-avatar">{salon.name.slice(0,1).toUpperCase()}</div><div><strong>{salon.name}</strong><small>Salon workspace</small></div><ChevronRight size={16}/></div><div className="nav-label">RADNI PROSTOR</div><nav>{nav.map(n=><button key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>{setPage(n.id);setMobile(false)}}><n.icon size={18}/><span>{n.label}</span>{n.id==='inbox'&&conversations.length>0&&<em>{conversations.length}</em>}</button>)}</nav><div className="sidebar-bottom"><div className="plan-card"><div className="plan-icon"><Sparkles size={16}/></div><strong>Salonova Pro</strong><p>Vaš salon, na jednom mjestu.</p><span>Upravljanje planom <ArrowUpRight size={13}/></span></div><button className="nav-item logout" onClick={signOut}><LogOut size={18}/> Odjava</button><div className="user-row"><div className="user-avatar">{session.user.email?.slice(0,1).toUpperCase()}</div><div><strong>{session.user.email}</strong><small>Vlasnik salona</small></div></div></div></aside>{mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}<main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><div className="breadcrumb">Salonova <span>/</span> {nav.find(n=>n.id===page)?.label}</div><div className="top-actions"><span className="live-dot">● Povezano</span><button className="icon-btn" title="Obavijesti"><Bell size={18}/></button><div className="top-avatar">{session.user.email?.slice(0,1).toUpperCase()}</div></div></header><div className="content">{error&&<div className="alert global-alert">{error}<button onClick={()=>setError('')}>×</button></div>}
 {page==='dashboard'&&<><div className="page-heading"><div><span className="eyebrow">PREGLED POSLOVANJA</span><h1>Dobro došli u Salonovu</h1><p>Ovdje je pregled današnjeg rada vašeg salona.</p></div><button className="primary" onClick={()=>setModal('booking')}><Plus size={17}/> Nova rezervacija</button></div><div className="stats-grid"><Stat icon={CalendarDays} label="Današnji termini" value={todays.length} hint="Zakazano za danas"/><Stat icon={Users} label="Ukupno rezervacija" value={bookings.length} hint="Učitani termini"/><Stat icon={Euro} label="Usluge u ponudi" value={services.length} hint="Aktivne usluge"/><Stat icon={MessageCircle} label="Razgovori" value={conversations.length} hint="Virtualna recepcija"/><Stat icon={Users} label="Posjete linku" value={salon.public_views||0} hint="Otvaranja javne recepcije"/><Stat icon={CalendarDays} label="Online rezervacije" value={bookings.filter(b=>b.channel==='web').length} hint="Rezervacije preko Instagram linka"/></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h3>Sljedeći termini</h3><p>Pregled nadolazećih rezervacija</p></div><button className="text-action" onClick={()=>setPage('bookings')}>Sve rezervacije <ChevronRight size={15}/></button></div>{upcoming.length===0?<Empty icon={CalendarDays} title="Još nema rezervacija" desc="Dodajte prvu rezervaciju i počnite organizirati svoj raspored." action={()=>setModal('booking')}/>:<div className="booking-list">{upcoming.map(b=><div className="booking-row" key={b.id}><div className="time-box"><strong>{b.booking_time.slice(0,5)}</strong><small>{b.booking_date===today?'Danas':b.booking_date.slice(5).replace('-','.')+'.'}</small></div><div className="booking-person"><strong>{b.client_name}</strong><small>{b.service||'Usluga nije navedena'}{b.stylist?` · ${b.stylist}`:''}</small></div><Status status={b.status}/><button className="dots" onClick={()=>updateStatus(b.id,b.status==='confirmed'?'pending':'confirmed')} title="Promijeni status"><Check size={16}/></button></div>)}</div>}</section><section className="panel side-panel"><div className="panel-head"><div><h3>Brzi pristup</h3><p>Najčešće radnje</p></div></div><Quick icon={CalendarDays} title="Dodaj rezervaciju" desc="Zabilježite novi termin" click={()=>setModal('booking')}/><Quick icon={Scissors} title="Uredi usluge" desc="Cijene i trajanje usluga" click={()=>setPage('services')}/><Quick icon={Users} title="Dodaj zaposlenika" desc="Proširite svoj tim" click={()=>setModal('staff')}/><Quick icon={Inbox} title="Virtualna recepcija" desc="Pregledajte upite klijenata" click={()=>setPage('inbox')}/></section></div></>}
 {page==='bookings'&&<><div className="page-heading"><div><span className="eyebrow">RASPORED</span><h1>Rezervacije</h1><p>Upravljajte terminima i statusima klijenata.</p></div><button className="primary" onClick={()=>setModal('booking')}><Plus size={17}/> Nova rezervacija</button></div><div className="toolbar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pretraži klijente ili usluge…"/></div><span className="muted">{bookings.length} rezervacija</span></div><div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Klijent</th><th>Datum i vrijeme</th><th>Usluga</th><th>Djelatnik</th><th>Status</th><th>Akcija</th></tr></thead><tbody>{bookings.filter(b=>(b.client_name+' '+(b.service||'')).toLowerCase().includes(search.toLowerCase())).map(b=><tr key={b.id}><td><strong>{b.client_name}</strong><small>{b.phone||'—'}</small></td><td>{b.booking_date}<small>{b.booking_time.slice(0,5)}</small></td><td>{b.service||'—'}</td><td>{b.stylist||'—'}</td><td><Status status={b.status}/></td><td><select className="status-select" value={b.status} onChange={e=>updateStatus(b.id,e.target.value)}><option value="pending">Na čekanju</option><option value="confirmed">Potvrđeno</option><option value="completed">Završeno</option><option value="cancelled">Otkazano</option></select></td></tr>)}</tbody></table>{bookings.length===0&&<Empty icon={CalendarDays} title="Nema rezervacija" desc="Prva rezervacija može se dodati u nekoliko sekundi." action={()=>setModal('booking')}/>}</div></div></>}
 {page==='inbox'&&<><div className="page-heading"><div><span className="eyebrow">KOMUNIKACIJA S KLIJENTIMA</span><h1>Virtualna recepcija</h1><p>Svi razgovori i upiti klijenata na jednom mjestu.</p></div><span className="coming-pill"><Sparkles size={14}/> Integracije se povezuju</span></div><div className="channel-grid"><Channel name="Instagram" note="Povezivanje putem Meta API-ja" symbol="◎"/><Channel name="Facebook" note="Povezivanje putem Meta API-ja" symbol="f"/><Channel name="WhatsApp" note="WhatsApp Business API" symbol="◉"/><Channel name="Web chat" note="Widget za web stranicu" symbol="↗"/></div><div className="panel"><div className="panel-head"><div><h3>Inbox</h3><p>Primljeni razgovori</p></div><span className="muted">{conversations.length} razgovora</span></div>{conversations.length===0?<Empty icon={Inbox} title="Inbox je trenutno prazan" desc="Kada povežete komunikacijske kanale, razgovori s klijentima pojavit će se ovdje."/>:<div className="conversation-list">{conversations.map(c=><div className="conversation-row" key={c.id}><div className="conversation-avatar">{(c.customer_name||'?').slice(0,1)}</div><div><strong>{c.customer_name||'Nepoznat klijent'}</strong><small>{c.title||`Razgovor putem ${c.channel}`}</small></div><Status status={c.status}/></div>)}</div>}</div><div className="panel owner-chat-panel"><div className="panel-head"><div><h3><Sparkles size={16}/> Upute za Salonovu</h3><p>Unesite podatke koje ste dobili od vlasnika. Salonova ih sprema za odgovore klijentima.</p></div><span className="coming-pill">Postavke kroz chat</span></div><div className="owner-chat-reply">{ownerReply}</div><div className="owner-chat-examples"><span>Primjer: „Šišanje 20 eura, traje 45 minuta”</span><span>Primjer: „Radimo ponedjeljak do petka od 9 do 17”</span></div><div className="owner-chat-compose"><input value={ownerInput} onChange={e=>setOwnerInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveOwnerInstruction()}} placeholder="Upišite cijene, trajanje ili radno vrijeme…"/><button className="primary" disabled={ownerBusy||!ownerInput.trim()} onClick={saveOwnerInstruction}>{ownerBusy?'Spremam…':'Pošalji'}</button></div></div></>}
 {page==='services'&&<><div className="page-heading"><div><span className="eyebrow">PONUDA SALONA</span><h1>Usluge i cjenik</h1><p>Uredite usluge, trajanje i cijene.</p></div><button className="primary" onClick={()=>{setForm({name:'',duration_minutes:60,price:0});setModal('service')}}><Plus size={17}/> Dodaj uslugu</button></div><div className="service-grid">{services.map(s=><div className="service-card" key={s.id}><div className="service-icon"><Scissors/></div><div className="service-info"><strong>{s.name}</strong><small><Clock3 size={13}/> {s.duration_minutes} min</small></div><div className="service-price">{Number(s.price).toFixed(2)} €</div></div>)}</div>{services.length===0&&<div className="panel"><Empty icon={Scissors} title="Dodajte prvu uslugu" desc="Unesite usluge i cijene koje nudite klijentima." action={()=>setModal('service')}/></div>}</>}
 {page==='staff'&&<><div className="page-heading"><div><span className="eyebrow">VAŠ TIM</span><h1>Zaposlenici</h1><p>Pregledajte i upravljajte članovima tima.</p></div><button className="primary" onClick={()=>{setForm({name:'',email:'',phone:''});setModal('staff')}}><Plus size={17}/> Dodaj zaposlenika</button></div><div className="staff-grid">{staff.map(s=><div className="staff-card" key={s.id}><div className="staff-avatar">{s.name.slice(0,1).toUpperCase()}</div><strong>{s.name}</strong><small>{s.email||s.phone||'Član tima'}</small><span className={`staff-state ${s.is_active?'':'inactive'}`}>{s.is_active?'Aktivan':'Neaktivan'}</span></div>)}</div>{staff.length===0&&<div className="panel"><Empty icon={Users} title="Tim još nije dodan" desc="Dodajte zaposlenike kako biste mogli dodjeljivati termine." action={()=>setModal('staff')}/></div>}</>}
 {page==='settings'&&<><div className="page-heading"><div><span className="eyebrow">KONFIGURACIJA</span><h1>Postavke salona</h1><p>Osnovni podaci i postavke radnog prostora.</p></div></div><div className="settings-grid"><div className="panel settings-panel"><h3>Podaci salona</h3><p className="muted">Osnovne informacije vašeg radnog prostora.</p><label>Naziv salona<input value={salon.name} readOnly/></label><label>Jedinstvena adresa<input value={salon.slug} readOnly/></label><label>Vremenska zona<input value={salon.timezone||'Europe/Zagreb'} readOnly/></label><label>Link za Instagram bio<input readOnly value={`${window.location.origin}/rezervacija/${salon.slug}`} onFocus={e=>e.currentTarget.select()}/></label><button className="secondary" type="button" onClick={()=>navigator.clipboard?.writeText(`${window.location.origin}/rezervacija/${salon.slug}`)}>Kopiraj link za klijente</button><div className="muted small-note">Dodajte ovaj link u Instagram profil kako bi klijenti mogli sami rezervirati termin.</div></div><div className="panel settings-panel"><h3>Plan i naplata</h3><p className="muted">SaaS pretplate i Stripe naplata.</p><div className="billing-placeholder"><Sparkles/><strong>Salonova SaaS</strong><p>Modul pretplata pripremit ćemo za Stripe Checkout i portal za upravljanje planom.</p><span className="coming-pill">Stripe još nije povezan</span></div></div></div></>}
 </div></main>
 {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={modal==='booking'?addBooking:modal==='service'?addService:addStaff}><div className="modal-head"><div><span className="eyebrow">SALONOVA</span><h2>{modal==='booking'?'Nova rezervacija':modal==='service'?'Nova usluga':'Novi zaposlenik'}</h2></div><button type="button" className="icon-btn" onClick={()=>setModal(null)}><X/></button></div>{modal==='booking'?<><label>Ime klijenta<input required value={form.client_name} onChange={e=>setForm({...form,client_name:e.target.value})}/></label><div className="form-row"><label>Datum<input type="date" required value={form.booking_date} onChange={e=>setForm({...form,booking_date:e.target.value})}/></label><label>Vrijeme<input type="time" required value={form.booking_time} onChange={e=>setForm({...form,booking_time:e.target.value})}/></label></div><label>Usluga<select value={form.service} onChange={e=>setForm({...form,service:e.target.value})}><option value="">Odaberite uslugu</option>{services.map(s=><option key={s.id}>{s.name}</option>)}</select></label><label>Zaposlenik<select value={form.stylist} onChange={e=>setForm({...form,stylist:e.target.value})}><option value="">Nije dodijeljen</option>{staff.map(s=><option key={s.id}>{s.name}</option>)}</select></label><label>Telefon<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label></>:modal==='service'?<><label>Naziv usluge<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="form-row"><label>Trajanje (min)<input type="number" min="5" step="5" value={form.duration_minutes} onChange={e=>setForm({...form,duration_minutes:e.target.value})}/></label><label>Cijena (€)<input type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label></div></>:<><label>Ime i prezime<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>E-mail<input type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Telefon<input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label></>}{error&&<div className="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(null)}>Odustani</button><button className="primary" disabled={busy}>{busy?'Spremanje…':'Spremi'}</button></div></form></div>}
 </div>
}
function Stat({icon:Icon,label,value,hint}:any){return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={18}/></div></div><strong>{value}</strong><small>{hint}</small></div>}
function Empty({icon:Icon,title,desc,action}:any){return <div className="empty"><div className="empty-icon"><Icon size={22}/></div><strong>{title}</strong><p>{desc}</p>{action&&<button className="secondary" onClick={action}><Plus size={15}/> Dodaj</button>}</div>}
function Status({status}:any){const map:any={pending:['Na čekanju','yellow'],confirmed:['Potvrđeno','green'],completed:['Završeno','blue'],cancelled:['Otkazano','red'],open:['Otvoren','green'],closed:['Zatvoren','gray']};const [label,cls]=map[status]||[status,'gray'];return <span className={`status ${cls}`}>{label}</span>}
function Quick({icon:Icon,title,desc,click}:any){return <button className="quick-link" onClick={click}><div className="quick-icon"><Icon size={17}/></div><div><strong>{title}</strong><small>{desc}</small></div><ChevronRight size={16}/></button>}
function Channel({name,note,symbol}:any){return <div className="channel-card"><div className="channel-symbol">{symbol}</div><div><strong>{name}</strong><small>{note}</small></div><span className="coming-pill">U pripremi</span></div>}
function Setup(){return <div className="setup"><div className="brand"><span className="brand-mark">S</span><span>salonova</span></div><div className="panel setup-panel"><Sparkles size={28}/><h1>Još jedan korak do Salonove</h1><p>Dodajte Supabase podatke u Netlify environment variables ili lokalni <code>.env</code>.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><p className="muted">Vrijednosti pronađite u Supabase projektu pod Project Settings → API. Koristite samo publishable/anon ključ.</p></div></div>}


type PublicService = {id:string;name:string;duration_minutes:number;price:number}
type PublicSalon = {id:string;name:string;slug:string;timezone:string;phone?:string|null;services:PublicService[];staff:{id:string;name:string}[];business_hours?:{default?:{days?:string;start?:string;end?:string}}}
function localDate(d:Date){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function PublicBooking({slug}:{slug:string}){
 const [salon,setSalon]=useState<PublicSalon|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [service,setService]=useState(''),[date,setDate]=useState(''),[slots,setSlots]=useState<string[]>([]),[slot,setSlot]=useState('')
 const [availability,setAvailability]=useState<Record<string,boolean>>({}),[availabilityBusy,setAvailabilityBusy]=useState(false)
 const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)})
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[staff,setStaff]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState<any>(null)
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
 async function confirmBooking(){if(!supabase||!service||!slot||!name.trim()||!phone.trim())return;setBusy(true);setError('');const {data,error}=await supabase.rpc('create_public_booking',{p_slug:slug,p_service_id:service,p_date:date,p_time:slot,p_client_name:name,p_phone:phone,p_staff_id:staff||null});if(error){setError(error.message);setMessages(m=>[...m,{role:'assistant',text:'Žao mi je, taj termin više nije dostupan. Odaberite drugi slobodan termin u kalendaru.'}])}else{setConfirmed(data);setMessages(m=>[...m,{role:'assistant',text:`Odlično, ${name}! Vaša rezervacija za ${chosen?.name} potvrđena je za ${new Date(`${date}T12:00:00`).toLocaleDateString('hr-HR')} u ${slot}. Hvala vam!`}])}setBusy(false)}
 const money=(n:number)=>new Intl.NumberFormat('hr-HR',{style:'currency',currency:'EUR'}).format(Number(n||0))
 const chosen=salon?.services.find(s=>s.id===service)
 function chooseService(s:PublicService){setService(s.id);setDate('');setSlot('');setShowServices(false);setConfirmed(null);setMessages(m=>[...m,{role:'user',text:`Želim rezervirati ${s.name}.`},{role:'assistant',text:`Odlično! ${s.name} traje ${s.duration_minutes} minuta${s.price>0?` i košta ${money(s.price)}`:''}. Sada odaberite zeleni dan u kalendaru, a zatim slobodan sat.`}])}
 function ask(text?:string){const q=(text??question).trim();if(!q||!salon)return;const n=q.toLocaleLowerCase('hr-HR');let answer='Mogu vam pomoći s rezervacijom, uslugama, cijenama i radnim vremenom. Napišite što vas zanima.';let matched:PublicService|undefined
   matched=salon.services.find(x=>n.includes(x.name.toLocaleLowerCase('hr-HR'))||x.name.toLocaleLowerCase('hr-HR').split(/\s+/).some(w=>w.length>3&&n.includes(w)))
   if(matched&&(n.includes('rezerv')||n.includes('termin')||n.includes('naruč')||n.includes('naruc')||n.includes('želim')||n.includes('zelim'))){chooseService(matched);setMessages(m=>[...m,{role:'user',text:q}]);setQuestion('');return}
   if(n.includes('rezerv')||n.includes('termin')||n.includes('naruč')||n.includes('naruc')){if(!salon.services.length){answer='Rado ćemo vam pomoći s rezervacijom. Salon još nije unio popis usluga, pa rezervacija trenutno nije dostupna. Molimo pokušajte ponovno malo kasnije.'}else{answer='Naravno! Odaberite uslugu koju želite rezervirati:';setShowServices(true)}}
   else if(matched&&(n.includes('cijen')||n.includes('košta')||n.includes('kosta')||n.includes('koliko')||n.includes('traj')||n.includes('minut'))){answer=`${matched.name} traje ${matched.duration_minutes} minuta${matched.price>0?` i košta ${money(matched.price)}`:''}. Želite li rezervirati termin?`;}
   else if(n.includes('cijen')||n.includes('uslug')){answer=salon.services.length?'U ponudi imamo: '+salon.services.map(x=>`${x.name} — ${money(x.price)}, ${x.duration_minutes} min`).join('; ')+'.':'Popis usluga i cijena još nije unesen. Čim salon unese usluge, prikazat ću vam ih ovdje.'}
   else if(n.includes('radno vrijeme')||n.includes('kad rad')||n.includes('otvoreni')){const h=salon.business_hours?.default;answer=h?.start&&h?.end?`Radimo ${h.days||'prema rasporedu'} od ${h.start} do ${h.end}.`:'Radno vrijeme još nije uneseno. Slobodno nam pošaljite upit kasnije.'}
   else if(matched){answer=`Pronašla sam uslugu ${matched.name}. Traje ${matched.duration_minutes} minuta${matched.price>0?` i košta ${money(matched.price)}`:''}. Želite li rezervirati?`;setShowServices(true)}
   else if(/bok|pozdrav|dobar dan|hello|hej/.test(n)){answer='Pozdrav! Dobro došli u '+salon.name+'. Želite li rezervirati termin ili provjeriti usluge i cijene?'}
   else if(!salon.services.length){answer='Hvala na poruci! Trenutačno još nisu unesene usluge salona. Možete nam napisati što vas zanima, a za rezervaciju ćemo trebati prvo unijeti usluge i radno vrijeme.'}
   setMessages(m=>[...m,{role:'user',text:q},{role:'assistant',text:answer}]);setQuestion('')}
 const hours=salon?.business_hours?.default;const configuredHours=!!(hours?.start&&hours?.end);const startParts=(hours?.start||'00:00').split(':').map(Number);const endParts=(hours?.end||'00:00').split(':').map(Number);const startMinutes=startParts[0]*60+(startParts[1]||0);const endMinutes=endParts[0]*60+(endParts[1]||0);const timeOptions:string[]=[];if(configuredHours&&chosen){for(let t=startMinutes;t<endMinutes-chosen.duration_minutes+1;t+=30)timeOptions.push(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`)}const monthLabel=month.toLocaleDateString('hr-HR',{month:'long',year:'numeric'});const offset=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();const days=Array.from({length:offset},()=>null).concat(Array.from({length:count},(_,i)=>i+1))
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
    {service&&slot&&<div className="calendar-booking"><p>Odabrali ste <b>{chosen?.name}</b> u <b>{slot}</b>.</p><label className="public-field">Ime i prezime<input value={name} onChange={e=>setName(e.target.value)} placeholder="Vaše ime i prezime"/></label><label className="public-field">Broj telefona<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+385…" inputMode="tel"/></label>{salon.staff.length>0&&<label className="public-field">Djelatnik (nije obavezno)<select value={staff} onChange={e=>setStaff(e.target.value)}><option value="">Bilo tko</option>{salon.staff.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}<button className="public-confirm" disabled={busy||name.trim().length<2||phone.trim().length<6} onClick={confirmBooking}>{busy?'Potvrđujemo…':'Potvrdi rezervaciju'}</button></div>}
    {confirmed&&<div className="public-success"><span>✓</span><h2>Termin je potvrđen!</h2><strong>{new Date(`${date}T12:00:00`).toLocaleDateString('hr-HR')} u {slot}</strong><small>Potvrda je spremljena.</small></div>}
   </section>
  </main><footer className="public-footer">Virtualna recepcija · <a href="https://salonova.eu">Salonova</a></footer>
 </div>
}

export default function App(){
 const path=window.location.pathname
 const match=path.match(/^\/rezervacija\/([^/]+)\/?$/)
 if(match)return <PublicBooking slug={decodeURIComponent(match[1])}/>
 return <DashboardApp/>
}
