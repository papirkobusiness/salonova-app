
export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <a href="/" className="landing-brand">
          <span className="landing-logo">V</span>
          <span>virtualna recepcija</span>
        </a>

        <nav>
          <a href="#kako-radi">Kako radi</a>
          <a href="#prednosti">Prednosti</a>
          <a href="#cijena">Cijena</a>
        </nav>

        <a href="/vlasnik" className="landing-login">
          Prijava za salone <span>↗</span>
        </a>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">
              <span className="landing-dot" />
              VAŠA RECEPCIJA, UVIJEK DOSTUPNA
            </span>

            <h1>
              Vi se bavite svojim poslom.
              <em> Mi brinemo o vašim terminima.</em>
            </h1>

            <p>
              Upoznajte virtualnu recepciju koja razgovara s vašim
              klijentima, odgovara na pitanja i prima rezervacije
              dok vi radite, odmarate ili ste izvan salona.
            </p>

            <div className="landing-actions">
              <a href="/vlasnik" className="landing-button">
                Započnite <span>→</span>
              </a>
              <a href="#kako-radi" className="landing-secondary">
                Saznajte kako radi
              </a>
            </div>

            <div className="landing-trust">
              <span>✓</span> Bez propuštenih upita
              <span>✓</span> Bez ručnog dogovaranja termina
            </div>
          </div>

          <div className="landing-preview">
            <div className="preview-top">
              <div className="preview-brand">
                <span className="preview-avatar">S</span>
                <div>
                  <strong>Virtualna recepcija</strong>
                  <small><i /> Upravo dostupna</small>
                </div>
              </div>
              <span className="preview-menu">•••</span>
            </div>

            <div className="preview-body">
              <span className="preview-date">DANAS · 10:42</span>
              <div className="preview-message">
                Pozdrav! Dobro došli. Kako vam mogu pomoći?
              </div>
              <div className="preview-client">
                Željela bih rezervirati termin za šišanje.
              </div>
              <div className="preview-message">
                Naravno! Rado ću vam pomoći. Koji vam dan odgovara?
              </div>
              <div className="preview-options">
                <span>Petak, 27. 11.</span>
                <span>Subota, 28. 11.</span>
              </div>
              <div className="preview-message preview-small">
                Odlično! Odaberite slobodan termin koji vam odgovara.
              </div>
              <div className="preview-times">
                <span>09:00</span>
                <span className="preview-selected">10:30</span>
                <span>12:00</span>
              </div>
            </div>

            <div className="preview-bottom">
              <span>Vaša virtualna recepcija</span>
              <span className="preview-send">↗</span>
            </div>
            <div className="preview-caption">
              <span>✦</span> Razgovor i rezervacija u nekoliko koraka
            </div>
          </div>
        </section>

        <section className="landing-benefits" id="prednosti">
          <div>
            <strong>24/7</strong>
            <span>Dostupna klijentima</span>
          </div>
          <div>
            <strong>0</strong>
            <span>Propuštenih upita zbog radnog vremena</span>
          </div>
          <div>
            <strong>49 €</strong>
            <span>Jednostavna cijena</span>
          </div>
        </section>

        <section className="landing-how" id="kako-radi">
          <span className="landing-eyebrow">JEDNOSTAVNO ZA KORIŠTENJE</span>
          <h2>Vaš novi član tima. Bez dodatnog zaposlenika.</h2>
          <p className="landing-section-intro">
            Virtualna recepcija preuzima komunikaciju s klijentima
            i pomaže vam da se usredotočite na svoj posao.
          </p>

          <div className="landing-steps">
            <article>
              <span>01</span>
              <h3>Klijent pošalje upit</h3>
              <p>Putem vaše virtualne recepcije klijent postavlja pitanje kad god želi.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Recepcija odgovara</h3>
              <p>Informira o uslugama, cijenama i dostupnim terminima.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Termin je rezerviran</h3>
              <p>Klijent odabire slobodan termin, a rezervacija stiže u vaš kalendar.</p>
            </article>
          </div>
        </section>

        <section className="landing-price" id="cijena">
          <div>
            <span className="landing-eyebrow">VIŠE VREMENA ZA VAŠ POSAO</span>
            <h2>Vaša recepcija. Bez godišnjeg, bolovanja i radnog vremena.</h2>
            <p>
              Vaši klijenti mogu poslati upit i zatražiti termin
              i kada salon ne radi.
            </p>
          </div>
          <div className="landing-price-card">
            <span>JEDNOSTAVNA CIJENA</span>
            <strong>49 €</strong>
            <small>Za vašu virtualnu recepciju</small>
            <a href="/vlasnik">Prijava za salone →</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a href="/" className="landing-brand">
          <span className="landing-logo">V</span>
          <span>virtualna recepcija</span>
        </a>
        <span>Vi radite svoj posao. Mi brinemo o rezervacijama.</span>
        <a href="/vlasnik">Prijava za vlasnike</a>
      </footer>
    </div>
  )
}
