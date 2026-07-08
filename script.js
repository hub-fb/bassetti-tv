// Estado Global da Aplicação
let totalCanais = [];
let favoritos = JSON.parse(localStorage.getItem('bassetti_tv_favoritos')) || [];
let historico = JSON.parse(localStorage.getItem('bassetti_tv_historico')) || [];
let filtroAtual = 'TODOS'; // TODOS, FAVORITOS, HISTORICO
let categoriaSelecionada = 'TODOS';
let hlsInstance = null;

// INSTÂNCIA GLOBAL DE ÁUDIO (Para tocar a rádio em segundo plano)
let radioAudioInstance = null;
let monitoramentoRadioInterval = null;

// Caminho do arquivo de texto externo que conterá a URL da câmera
const ARQUIVO_CONFIG_CAMERA = "config-camera.txt"; 

// Elementos do DOM
const DOM = {
    search: document.getElementById('search-input'),
    channelsList: document.getElementById('channels-list'),
    categorySelect: document.getElementById('category-select'),
    video: document.getElementById('video-player'),
    placeholder: document.getElementById('player-placeholder'),
    currentLogo: document.getElementById('current-logo'),
    currentTitle: document.getElementById('current-title'),
    currentGroup: document.getElementById('current-group'),
    btnFav: document.getElementById('btn-toggle-favorite'),
    statusBar: document.getElementById('status-text'),
    tabTodos: document.getElementById('btn-todos'),
    tabFavs: document.getElementById('btn-favoritos'),
    tabHist: document.getElementById('btn-historico')
};

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', () => {
    inicializarListeners();
    carregarPlaylist();
});

function inicializarListeners() {
    DOM.search.addEventListener('input', renderizarCanais);
    DOM.categorySelect.addEventListener('change', (e) => {
        categoriaSelecionada = e.target.value;
        renderizarCanais();
    });

    // Abas de Filtros Topo da Sidebar
    DOM.tabTodos.addEventListener('click', () => alternarFiltro('TODOS', DOM.tabTodos));
    DOM.tabFavs.addEventListener('click', () => alternarFiltro('FAVORITOS', DOM.tabFavs));
    DOM.tabHist.addEventListener('click', () => alternarFiltro('HISTORICO', DOM.tabHist));

    // Botão Favoritar
    DOM.btnFav.addEventListener('click', gerenciarFavoritos);
}

function alternarFiltro(tipo, elementoBotao) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    elementoBotao.classList.add('active');
    filtroAtual = tipo;
    renderizarCanais();
}

// Consome e processa o arquivo M3U gerado pelo Hub
async function carregarPlaylist() {
    atualizarStatus("Buscando playlist do repositório backend...");
    try {
        const resposta = await fetch(CONFIG.PLAYLIST_URL);
        if (!resposta.ok) throw new Error("Falha ao ler dados do servidor.");
        const textoM3u = await resposta.text();
        
        parseM3U(textoM3u);
        popularCategorias();
        renderizarCanais();
        atualizarStatus(`Canais carregados com sucesso: ${totalCanais.length} disponíveis.`);
    } catch (erro) {
        console.error(CONFIG.LOG_PREFIX, erro);
        DOM.channelsList.innerHTML = `<div class="loading-message" style="color: #ff4a4a;">Erro ao carregar canais. Verifique a URL do Hub.</div>`;
        atualizarStatus("Erro crítico na importação da playlist.");
    }
}

// Parser M3U simples e otimizado para o formato do Hub
function parseM3U(dadosBrutos) {
    const linhas = dadosBrutos.split('\n');
    let canalAtual = null;

    for (let i = 0; i < linhas.length; i++) {
        let line = linhas[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            canalAtual = {};
            
            // Regex para captura das chaves/atributos M3U
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            const groupMatch = line.match(/group-title="([^"]*)"/);
            
            // O nome do canal vem logo após a última vírgula do #EXTINF
            const virgulaIndex = line.lastIndexOf(',');
            const nomeCanal = virgulaIndex !== -1 ? line.substring(virgulaIndex + 1).stripOrNormal() : "Canal Sem Nome";

            canalAtual.nome = nomeCanal;
            canalAtual.logo = logoMatch ? logoMatch[1] : '';
            canalAtual.grupo = groupMatch ? groupMatch[1].toUpperCase() : 'OUTROS';
        } else if (line && !line.startsWith('#') && canalAtual) {
            canalAtual.url = line;
            totalCanais.push(canalAtual);
            canalAtual = null; // Reseta ponteiro
        }
    }
}

// Extensão utilitária para strings
String.prototype.stripOrNormal = function() {
    return this.trim();
};

// Busca assíncrona da URL da câmera contida no arquivo TXT externo
async function obterUrlCameraExterna() {
    try {
        const resposta = await fetch(ARQUIVO_CONFIG_CAMERA);
        if (!resposta.ok) throw new Error("Arquivo externo não encontrado");
        const urlTexto = await resposta.text();
        return urlTexto.trim();
    } catch (erro) {
        console.warn("Falha ao ler URL externa. Usando fallback padrão.", erro);
        return "https://cameras.santoandre.sp.gov.br/coi04/ID_597"; 
    }
}

// Reconhece nativamente se a URL de streaming de áudio está respondendo
function verificarSinalStream(url) {
    return new Promise(resolve => {
        const testeAudio = new Audio();
        const finalizar = (resultado) => {
            resolve(resultado);
            testeAudio.src = "";
        };
        testeAudio.onplaying = () => finalizar(true);
        testeAudio.oncanplaythrough = () => finalizar(true);
        testeAudio.onerror = () => finalizar(false);
        testeAudio.onstalled = () => finalizar(false);

        testeAudio.src = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
        testeAudio.load();

        setTimeout(() => finalizar(false), 4000);
    });
}

function popularCategorias() {
    const gruposUnicos = new Set(totalCanais.map(c => c.grupo));
    const gruposOrdenados = Array.from(gruposUnicos).sort();
    
    if(gruposOrdenados.includes("BRAZIL")) {
        gruposOrdenados.splice(gruposOrdenados.indexOf("BRAZIL"), 1);
        gruposOrdenados.unshift("BRAZIL");
    }

    gruposOrdenados.forEach(grupo => {
        const option = document.createElement('option');
        option.value = grupo;
        option.textContent = grupo;
        DOM.categorySelect.appendChild(option);
    });
}

function renderizarCanais() {
    DOM.channelsList.innerHTML = '';
    const busca = DOM.search.value.toLowerCase().trim();

    let canaisFiltrados = [...totalCanais];

    if (filtroAtual === 'FAVORITOS') {
        canaisFiltrados = canaisFiltrados.filter(c => favoritos.includes(c.url));
    } else if (filtroAtual === 'HISTORICO') {
        canaisFiltrados = historico.map(url => totalCanais.find(c => c.url === url)).filter(Boolean);
    }

    if (categoriaSelecionada !== 'TODOS' && filtroAtual === 'TODOS') {
        canaisFiltrados = canaisFiltrados.filter(c => c.grupo === categoriaSelecionada);
    }

    if (busca) {
        canaisFiltrados = canaisFiltrados.filter(c => c.nome.toLowerCase().includes(busca));
    }

    if (canaisFiltrados.length === 0) {
        DOM.channelsList.innerHTML = '<div class="loading-message">Nenhum canal localizado.</div>';
        return;
    }

    const imgPlaceholder = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'><rect x='2' y='2' width='20' height='20' rx='2.18' ry='2.18'></rect><line x1='7' y1='2' x2='7' y2='22'></line><line x1='17' y1='2' x2='17' y2='22'></line><line x1='2' y1='12' x2='22' y2='12'></line></svg>";

    canaisFiltrados.forEach(canal => {
        const item = document.createElement('div');
        item.className = 'channel-item';
        if (DOM.video.dataset.currentUrl === canal.url) item.classList.add('active');

        const imgElement = document.createElement('img');
        imgElement.className = 'channel-logo';
        
        let limpaLogo = (canal.logo || '').replace(/['"]/g, '').trim();
        imgElement.src = limpaLogo || imgPlaceholder;
        
        imgElement.onerror = function() {
            this.src = imgPlaceholder;
            this.onerror = null;
        };

        const infoContainer = document.createElement('div');
        infoContainer.className = 'channel-info';
        infoContainer.innerHTML = `
            <div class="channel-name"></div>
            <div class="channel-group"></div>
        `;
        
        infoContainer.querySelector('.channel-name').textContent = canal.nome;
        infoContainer.querySelector('.channel-group').textContent = canal.grupo;

        item.appendChild(imgElement);
        item.appendChild(infoContainer);

        item.addEventListener('click', () => carregarCanalNoPlayer(canal));
        DOM.channelsList.appendChild(item);
    });
}

async function carregarCanalNoPlayer(canal) {
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    DOM.video.dataset.currentUrl = canal.url;
    renderizarCanais();

    DOM.placeholder.classList.add('hidden');
    DOM.currentTitle.textContent = canal.nome;
    DOM.currentGroup.textContent = canal.grupo;
    if (canal.logo) {
        DOM.currentLogo.src = canal.logo;
        DOM.currentLogo.classList.remove('hidden');
    } else {
        DOM.currentLogo.classList.add('hidden');
    }

    DOM.btnFav.classList.remove('hidden');
    atualizarBotaoFavoritoUI(canal.url);
    gerenciarHistorico(canal.url);

    // Limpa loops de checagem anteriores
    if (monitoramentoRadioInterval) {
        clearInterval(monitoramentoRadioInterval);
        monitoramentoRadioInterval = null;
    }

    // Desliga rádio ativa de segundo plano ao mudar de canal
    if (radioAudioInstance) {
        radioAudioInstance.pause();
        radioAudioInstance.src = "";
        radioAudioInstance = null;
    }

    // Destrói instâncias do HLS.js
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    // Remove iFrames estéticos antigos
    const iframeAntigo = document.getElementById('iframe-estetico-radio');
    if (iframeAntigo) {
        iframeAntigo.remove();
    }
    
    DOM.video.style.display = "block";
    DOM.video.removeAttribute('src');
    DOM.video.type = "";
    DOM.video.muted = false; // Áudio padrão ativado inicialmente

    // DETECTOR DE ÁUDIO/RÁDIO
    const urlNormalizada = canal.url.toLowerCase();
    const isRadio = canal.grupo === "RADIOS" || urlNormalizada.includes("zeno.fm") || urlNormalizada.includes("zenofm.com");

    if (isRadio) {
        let urlSegura = canal.url.replace("http://", "https://");
        
        if (urlSegura.endsWith("/playlist.m3u8")) {
            urlSegura = urlSegura.replace("/playlist.m3u8", "");
        } else if (urlSegura.endsWith(".m3u8") || urlSegura.endsWith(".m3u")) {
            urlSegura = urlSegura.substring(0, urlSegura.lastIndexOf('.'));
        }
        
        if (urlSegura.endsWith("/live")) {
            urlSegura = urlSegura.replace("/live", "");
        }

        // LEITURA DINÂMICA DO ARQUIVO EXTERNO (.txt)
        const urlVisualExterna = await obterUrlCameraExterna();

        // INICIALIZAÇÃO DO VISUAL DA TRANSMISSÃO (iFrame ou Player HLS)
        if (urlVisualExterna.includes(".m3u8") || urlVisualExterna.includes(".mp4")) {
            if (Hls.isSupported()) {
                hlsInstance = new Hls({ maxBufferLength: 10, enableWorker: true });
                hlsInstance.loadSource(urlVisualExterna);
                hlsInstance.attachMedia(DOM.video);
                hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { DOM.video.play(); });
            } else if (DOM.video.canPlayType('application/vnd.apple.mpegurl')) {
                DOM.video.src = urlVisualExterna;
                DOM.video.addEventListener('loadedmetadata', () => { DOM.video.play(); });
            }
        } else {
            DOM.video.style.display = "none"; 
            const iframeCamera = document.createElement('iframe');
            iframeCamera.id = "iframe-estetico-radio";
            iframeCamera.src = urlVisualExterna;
            iframeCamera.style.width = "100%";
            iframeCamera.style.height = "100%";
            iframeCamera.style.border = "none";
            iframeCamera.style.borderRadius = "4px";
            iframeCamera.setAttribute("allow", "autoplay");
            DOM.video.parentElement.appendChild(iframeCamera);
        }

        // FUNÇÃO DE GERENCIAMENTO INTELIGENTE DE SINAL (FAILOVER)
        const gerenciarSinalAudio = async () => {
            const radioOnline = await verificarSinalStream(urlSegura);

            if (radioOnline) {
                // SINAL DA RÁDIO OK: Muta a transmissão da TV/Câmera e prioriza a rádio
                DOM.video.muted = true;
                if (!radioAudioInstance) {
                    radioAudioInstance = new Audio(urlSegura);
                    radioAudioInstance.play()
                        .then(() => atualizarStatus(`Rádio Online: Transmitindo ${canal.nome} + Vídeo de Fundo`))
                        .catch(e => console.error("Erro ao dar play no áudio da rádio:", e));
                }
            } else {
                // SEM SINAL DA RÁDIO: Desliga a instância da rádio e libera o som original do streaming da TV/Câmera
                if (radioAudioInstance) {
                    radioAudioInstance.pause();
                    radioAudioInstance.src = "";
                    radioAudioInstance = null;
                }
                DOM.video.muted = false; 
                atualizarStatus(`Rádio Offline. Reproduzindo áudio original do canal de vídeo.`);
            }
        };

        // Roda a checagem imediatamente no clique
        await gerenciarSinalAudio();
        // Deixa monitorando o sinal a cada 8 segundos para evitar quedas abruptas
        monitoramentoRadioInterval = setInterval(gerenciarSinalAudio, 8000);
            
    } else {
        // FLUXO PADRÃO (Canais de TV Normais)
        if (Hls.isSupported()) {
            hlsInstance = new Hls({ maxBufferLength: 10, enableWorker: true });
            hlsInstance.loadSource(canal.url);
            hlsInstance.attachMedia(DOM.video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                DOM.video.play();
            });
            hlsInstance.on(Hls.Events.ERROR, function (evento, dados) {
                if (dados.fatal) {
                    atualizarStatus(`Erro de rede ou mídia ao abrir: ${canal.nome}`);
                }
            });
        } else if (DOM.video.canPlayType('application/vnd.apple.mpegurl')) {
            DOM.video.src = canal.url;
            DOM.video.addEventListener('loadedmetadata', () => {
                DOM.video.play();
            });
        }
        
        atualizarStatus(`Transmitindo agora: ${canal.nome}`);
    }
}

// Funções Helpers e Armazenamentos Locais
function gerenciarFavoritos() {
    const url = DOM.video.dataset.currentUrl;
    if (!url) return;

    if (favoritos.includes(url)) {
        favoritos = favoritos.filter(f => f !== url);
        atualizarStatus("Removido dos favoritos.");
    } else {
        favoritos.push(url);
        atualizarStatus("Adicionado aos favoritos.");
    }
    localStorage.setItem('bassetti_tv_favoritos', JSON.stringify(favoritos));
    atualizarBotaoFavoritoUI(url);
    if(filtroAtual === 'FAVORITOS') renderizarCanais();
}

function atualizarBotaoFavoritoUI(url) {
    if (favoritos.includes(url)) {
        DOM.btnFav.textContent = '⭐ Favorito';
        DOM.btnFav.style.backgroundColor = 'rgba(0, 118, 255, 0.3)';
    } else {
        DOM.btnFav.textContent = '☆ Favoritar';
        DOM.btnFav.style.backgroundColor = 'var(--bg-card)';
    }
}

function gerenciarHistorico(url) {
    historico = historico.filter(h => h !== url);
    historico.unshift(url);
    if (historico.length > 20) historico.pop();
    localStorage.setItem('bassetti_tv_historico', JSON.stringify(historico));
}

function atualizarStatus(texto) {
    DOM.statusBar.textContent = `${CONFIG.LOG_PREFIX} ${texto}`;
}
