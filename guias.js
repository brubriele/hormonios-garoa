const guides = window.GUIDES || []
const params = new URLSearchParams(location.search)
const selectedId = params.get('instrument')

function esc(value){return String(value ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function renderIndex(){
  const list = document.querySelector('#guide-list')
  list.innerHTML = guides.map((g, i) => `
    <a class="guide-row" href="guias.html?instrument=${encodeURIComponent(g.id)}#detalhe">
      <span class="guide-code">${esc(g.code)}</span>
      <span><strong>${esc(g.name)}</strong><small>${esc(g.note)}</small></span>
      <span class="guide-link">${g.videoUrl ? 'VER VÍDEO ↗' : 'ABRIR GUIA →'}</span>
    </a>
  `).join('')
}

function renderDetail(){
  const detail = document.querySelector('#guide-detail')
  const guide = guides.find(g => g.id === selectedId)
  if(!guide){ detail.hidden = true; return }
  detail.hidden = false
  detail.innerHTML = `
    <div class="guide-detail-head">
      <div><p class="eyebrow">${esc(guide.code)} / GUIA</p><h2>${esc(guide.name)}<br><em>primeiros passos.</em></h2></div>
      <a class="back-btn" href="guias.html">← todos os instrumentos</a>
    </div>
    <div class="guide-detail-grid">
      <div class="guide-art" aria-hidden="true">
        <span class="guide-art-number">${esc(guide.code.replace('I / ','#'))}</span>
        <span class="guide-art-name">${esc(guide.name)}</span>
        <span class="guide-art-note">RITMO / ESCUTA / BLOCO</span>
      </div>
      <div class="guide-detail-copy">
        <p>${esc(guide.note)}</p>
        <div class="guide-checklist">
          <div><span>01</span>Assista ao vídeo antes do primeiro ensaio.</div>
          <div><span>02</span>Experimente a célula lentamente e sem pressão.</div>
          <div><span>03</span>Leve suas dúvidas para o ensaio e toque com o bloco.</div>
        </div>
        ${guide.videoUrl ? `<a class="primary-btn guide-video-btn" target="_blank" rel="noopener" href="${esc(guide.videoUrl)}">Abrir vídeo no Google Drive <span>↗</span></a>` : `<div class="guide-missing"><strong>Vídeo ainda não cadastrado.</strong><small>Edite <code>guides-data.js</code> e cole aqui o link do Google Drive deste instrumento.</small></div>`}
        <a class="text-btn" href="index.html#instruments">Reservar ${esc(guide.name)} →</a>
      </div>
    </div>
  `
}

renderIndex(); renderDetail();
if(selectedId) document.querySelector('#guide-detail')?.scrollIntoView({behavior:'smooth', block:'start'})
