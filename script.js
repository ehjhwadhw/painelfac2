// =====================================================
// PAINEL FAC - Sistema Standalone com JSON Local
// =====================================================

// =====================================================
// CEF Bridge - compatibilidade com SAMPMobileCef
// =====================================================
let cefBridge = (typeof Cef !== 'undefined') ? Cef : (typeof cef !== 'undefined' ? cef : null);

function registerServerCallbacks() {
  const bridge = (typeof Cef !== 'undefined') ? Cef : (typeof cef !== 'undefined' ? cef : null);
  if (!bridge || !bridge.registerEventCallback) return false;

  cefBridge = bridge;
  try {
    // Recebe do servidor: qual org o player pertence, passaporte, nick e cargo
    bridge.registerEventCallback('setPlayerInfo', 'setPlayerInfo');
    // Recebe do servidor: saldo real, membros online e total
    bridge.registerEventCallback('setOrgStatus', 'setOrgStatus');
    // Recebe do servidor: lista de membros compacta
    bridge.registerEventCallback('setMembros', 'setMembros');
    return true;
  } catch {
    return false;
  }
}

registerServerCallbacks();
{
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (registerServerCallbacks() || tries >= 10) clearInterval(t);
  }, 200);
}

// =====================================================
// State
// =====================================================
let currentOrgId = 1; // ID da org atual (1-10)
let currentColor = 'yellow';
let orgData = null; // Dados estáticos da org (JSON)
let transacoes = [];
let selectedRoute = null;
let tempColor = currentColor;
let playerCargo = 0; // 0=Nenhum, 1=Membro, 2=Recrutador, 3=Gerente, 4=SubLider, 5=Lider
let playerPassaporte = 0;
let playerNick = '';

// Estado dinâmico (vem do servidor quando estiver rodando no SA-MP)
let orgSaldo = 0;
let membrosOnline = 0;
let totalMembrosServer = 0;
let membrosServer = null; // [{nome,cargo}]

// =====================================================
// LocalStorage Keys (apenas para extrato)
// =====================================================
const EXTRATO_PREFIX = 'painelFac_extrato_';

// =====================================================
// DOM Elements
// =====================================================
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const membersTable = document.getElementById('membersTable');
const extratoList = document.getElementById('extratoList');
const searchInput = document.getElementById('searchInput');
const saldoDisplay = document.getElementById('saldoDisplay');
const bankBalance = document.getElementById('bankBalance');
const bankAmount = document.getElementById('bankAmount');

// =====================================================
// Initialize
// =====================================================
async function initPanel() {
  // Tentar carregar dados do URL param ou usar org 1 por padrão
  const urlParams = new URLSearchParams(window.location.search);
  currentOrgId = parseInt(urlParams.get('org')) || 1;
  playerPassaporte = parseInt(urlParams.get('passaporte')) || 123456;
  playerNick = urlParams.get('nick') || 'Player_Test';
  // Permite forçar cargo via URL para testes: ?cargo=5 (Líder)
  playerCargo = parseInt(urlParams.get('cargo')) || 0;

  // Carregar org do JSON
  await loadOrgData(currentOrgId);

  // Defaults dinâmicos (standalone)
  orgSaldo = orgData?.saldo || 0;
  membrosOnline = playerCargo > 0 ? 1 : 0;
  totalMembrosServer = 0;
  membrosServer = null;

  // Se cargo não veio da URL, determinar baseado nos dados da org
  if (playerCargo === 0) {
    playerCargo = getPlayerCargoFromOrg();
  }

  setTheme(currentColor);
  renderMembers();
  loadExtrato();
  renderExtrato();
  updateBalanceDisplays();
  setupEventListeners();
  updateUIBasedOnCargo();

  console.log('[PainelFac] Inicializado - Org:', currentOrgId, 'Cargo:', playerCargo, 'Nick:', playerNick);

  // Sinalizar ao servidor que o painel está pronto
  triggerServer('painelFacReady', '1');
}

// Em alguns CEFs o DOMContentLoaded pode disparar antes do script carregar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void initPanel(); });
} else {
  void initPanel();
}

// =====================================================
// Carregar dados da org (sempre do JSON)
// =====================================================
async function loadOrgData(orgId) {
  try {
    // Sempre carregar do arquivo JSON (editável manualmente)
    const response = await fetch(`orgs/${orgId}.json?t=${Date.now()}`);
    if (response.ok) {
      orgData = await response.json();
    } else {
      // Fallback: criar org vazia
      orgData = createEmptyOrg(orgId);
    }

    // Atualizar UI
    document.getElementById('factionName').textContent = orgData.nome || 'Organização';

    // Default do saldo no standalone
    orgSaldo = orgData?.saldo || 0;
  } catch (e) {
    console.error('Erro ao carregar org:', e);
    orgData = createEmptyOrg(orgId);
    orgSaldo = 0;
  }
}

function createEmptyOrg(orgId) {
  const nomes = [
    '', 'TROPA DA FRANCA', 'TROPA DA TURQUIA', 'GROTA', 'TROPA DO BRASIL',
    'JAMAICA', 'TROPA DA RUSSIA', 'GANGUE DO OVO', 'TROPA DO JAMAL',
    'MOTOCLUB', 'TROPA DA ARGENTINA'
  ];
  return {
    id: orgId,
    nome: nomes[orgId] || `Organização ${orgId}`,
    saldo: 0,
    lider: '',
    subLider: '',
    gerente: '',
    recrutador: '',
    membros: []
  };
}

// Dados são lidos diretamente do JSON - para persistir edite os arquivos em orgs/*.json
// O servidor Pawn é responsável por sincronizar mudanças importantes
// Em modo standalone, as mudanças são mantidas apenas em memória durante a sessão
function saveOrgData() {
  // Log da mudança - o servidor deve processar via eventos CEF
  console.log('[PainelFac] Dados alterados:', JSON.stringify(orgData));
}

// =====================================================
// Determinar cargo do player baseado nos dados da org
// =====================================================
function getPlayerCargoFromOrg() {
  if (!orgData) return 0;

  // Preferir passaporte (mais confiável) quando o JSON tiver o formato "#123456 Nick"
  const myPass = String(playerPassaporte || '');
  const nick = String(playerNick || '').trim();

  const matchPassport = (entry) => {
    if (!entry) return false;
    const p = getPassaporteFromNome(String(entry));
    return p && myPass && String(p) === myPass;
  };

  const matchNick = (entry) => {
    if (!entry || !nick) return false;
    return String(entry).toLowerCase().includes(nick.toLowerCase());
  };

  // Verificar em cada cargo
  if (orgData.lider && (matchPassport(orgData.lider) || matchNick(orgData.lider))) return 5;
  if (orgData.subLider && (matchPassport(orgData.subLider) || matchNick(orgData.subLider))) return 4;
  if (orgData.gerente && (matchPassport(orgData.gerente) || matchNick(orgData.gerente))) return 3;
  if (orgData.recrutador && (matchPassport(orgData.recrutador) || matchNick(orgData.recrutador))) return 2;

  // Verificar na lista de membros
  if (orgData.membros && orgData.membros.some(m => matchPassport(m) || matchNick(m))) return 1;

  return 0;
}

// =====================================================
// Extrato (localStorage)
// =====================================================
function loadExtrato() {
  try {
    const stored = localStorage.getItem(EXTRATO_PREFIX + currentOrgId);
    transacoes = stored ? JSON.parse(stored) : [];
  } catch {
    transacoes = [];
  }
}

function saveExtrato() {
  localStorage.setItem(EXTRATO_PREFIX + currentOrgId, JSON.stringify(transacoes.slice(0, 50))); // Limitar a 50 transações
}

// =====================================================
// Receber info do jogador do servidor (CEF)
// =====================================================
window.setPlayerInfo = async function(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    currentOrgId = data.orgId || 1;
    playerPassaporte = data.passaporte || 0;
    playerNick = data.nick || '';
    playerCargo = data.cargo || 0;

    await loadOrgData(currentOrgId);

    // Se servidor enviou cargo, usar o do servidor
    if (data.cargo > 0) {
      playerCargo = data.cargo;
    } else {
      playerCargo = getPlayerCargoFromOrg();
    }

    // Atualizar UI
    renderMembers();
    loadExtrato();
    renderExtrato();
    updateBalanceDisplays();
    updateUIBasedOnCargo();

    console.log('[PainelFac] setPlayerInfo recebido - Org:', currentOrgId, 'Cargo:', playerCargo, 'Nick:', playerNick);
  } catch(e) {
    console.error('Erro ao parsear dados do player:', e);
  }
};

// =====================================================
// Receber status dinâmico da org (CEF)
// =====================================================
window.setOrgStatus = function(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    // Segurança: aceitar apenas se for da org atual
    if (data.orgId && Number(data.orgId) !== Number(currentOrgId)) return;

    if (typeof data.saldo === 'number') orgSaldo = data.saldo;
    if (typeof data.membrosOnline === 'number') membrosOnline = data.membrosOnline;
    if (typeof data.totalMembros === 'number') totalMembrosServer = data.totalMembros;

    updateBalanceDisplays();
  } catch (e) {
    console.error('Erro ao parsear status da org:', e);
  }
};

// =====================================================
// Receber lista de membros (CEF)
// =====================================================
window.setMembros = function(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    // Esperado: [{nome,cargo}]
    membrosServer = Array.isArray(data) ? data : null;
    renderMembers();
    updateBalanceDisplays();
  } catch (e) {
    console.error('Erro ao parsear membros:', e);
  }
};

// =====================================================
// Trigger event to server
// =====================================================
function triggerServer(eventName, data) {
  const payload = (data === undefined || data === null) ? '' : String(data);

  const bridge = (typeof Cef !== 'undefined')
    ? Cef
    : ((typeof cef !== 'undefined') ? cef : cefBridge);

  if (bridge) {
    if (typeof bridge.trigger === 'function') { bridge.trigger(eventName, payload); return; }
    if (typeof bridge.emit === 'function') { bridge.emit(eventName, payload); return; }
    if (typeof bridge.call === 'function') { bridge.call(eventName, payload); return; }
    if (typeof bridge.send === 'function') { bridge.send(eventName, payload); return; }
    if (typeof bridge.triggerServerEvent === 'function') { bridge.triggerServerEvent(eventName, payload); return; }
  }

  console.log('[CEF Mock] trigger:', eventName, payload);
}

// =====================================================
// Update UI based on player cargo
// =====================================================
function updateUIBasedOnCargo() {
  const hireBtn = document.getElementById('hireBtn');
  const fireBtn = document.getElementById('fireBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  const settingsTab = document.querySelector('[data-tab="settings"]');

  if (!hireBtn || !fireBtn || !withdrawBtn || !settingsTab) return;

  // Contratar: Recrutador (2), Gerente (3), SubLider (4), Lider (5)
  hireBtn.classList.toggle('disabled', playerCargo < 2);
  hireBtn.disabled = playerCargo < 2;

  // Demitir: Gerente (3), SubLider (4), Lider (5)
  fireBtn.classList.toggle('disabled', playerCargo < 3);
  fireBtn.disabled = playerCargo < 3;

  // Sacar: Gerente (3), SubLider (4), Lider (5)
  withdrawBtn.classList.toggle('disabled', playerCargo < 3);
  withdrawBtn.disabled = playerCargo < 3;

  // Configurações: Gerente (3), SubLider (4), Lider (5)
  settingsTab.classList.toggle('disabled', playerCargo < 3);

  // Verificar se está lotado (30 membros)
  const totalMembros = getTotalMembros();
  if (totalMembros >= 30) {
    hireBtn.classList.add('disabled');
    hireBtn.disabled = true;
  }
}

// =====================================================
// Get total membros
// =====================================================
function getTotalMembros() {
  // Preferir total vindo do servidor (mais confiável)
  if (totalMembrosServer > 0) return totalMembrosServer;

  // Se o servidor enviou lista, contar por ela
  if (Array.isArray(membrosServer)) return membrosServer.length;

  // Fallback: contar pelo JSON
  if (!orgData) return 0;
  let count = 0;
  if (orgData.lider) count++;
  if (orgData.subLider) count++;
  if (orgData.gerente) count++;
  if (orgData.recrutador) count++;
  count += (orgData.membros || []).filter(m => m && m.length > 0).length;
  return count;
}

// =====================================================
// Theme Management
// =====================================================
function setTheme(color) {
  document.body.className = `theme-${color}`;
  currentColor = color;
  
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

// =====================================================
// Tab Navigation
// =====================================================
function switchTab(tabId) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tabId}-content`);
  });
}

// =====================================================
// Get passaporte from member name (format: #123456 Nick_Name)
// =====================================================
function getPassaporteFromNome(nome) {
  const match = nome.match(/#(\d+)/);
  return match ? match[1] : '';
}

// =====================================================
// Build members list from orgData
// =====================================================
function getMembersList() {
  // Se o servidor enviou a lista real de membros, usar ela.
  if (Array.isArray(membrosServer)) {
    return membrosServer.map(m => ({ nome: m?.nome || '', cargo: m?.cargo || '-' }));
  }

  // Fallback (standalone): montar a partir do JSON
  if (!orgData) return [];

  const list = [];

  if (orgData.lider) {
    list.push({ nome: orgData.lider, cargo: 'Líder' });
  }
  if (orgData.subLider) {
    list.push({ nome: orgData.subLider, cargo: 'Sub-Líder' });
  }
  if (orgData.gerente) {
    list.push({ nome: orgData.gerente, cargo: 'Gerente' });
  }
  if (orgData.recrutador) {
    list.push({ nome: orgData.recrutador, cargo: 'Recrutador' });
  }
  (orgData.membros || []).forEach(m => {
    if (m && m.length > 0) {
      list.push({ nome: m, cargo: 'Membro' });
    }
  });

  return list;
}

// =====================================================
// Render Members Table
// =====================================================
function renderMembers(filter = '') {
  const membros = getMembersList();
  const f = (filter || '').toLowerCase();

  const filtered = membros.filter(m =>
    (m?.nome || '').toLowerCase().includes(f)
  );

  membersTable.innerHTML = filtered.map(membro => {
    const nome = membro?.nome || '';
    const cargo = membro?.cargo || '-';

    const passaporte = getPassaporteFromNome(nome);
    const canManage = playerCargo >= 3;

    return `
      <tr>
        <td style="color: white;">${nome}</td>
        <td>${cargo}</td>
        <td>0 minutos</td>
        <td>-</td>
        <td>-</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-green ${!canManage ? 'disabled' : ''}" 
                    onclick="promoverMembro('${passaporte}')" 
                    ${!canManage ? 'disabled' : ''}>PROMOVER</button>
            <button class="btn btn-red ${!canManage ? 'disabled' : ''}" 
                    onclick="rebaixarMembro('${passaporte}')" 
                    ${!canManage ? 'disabled' : ''}>REBAIXAR</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =====================================================
// Promote member
// =====================================================
function promoverMembro(passaporte) {
  if (playerCargo < 3) return;

  // Encontrar membro pelo passaporte
  const membros = getMembersList();
  const membro = membros.find(m => getPassaporteFromNome(m.nome) === passaporte);
  if (!membro) return;

  const nome = membro.nome;
  const cargoAtual = membro.cargo;

  // Lógica de promoção
  if (cargoAtual === 'Membro' && !orgData.recrutador) {
    // Remover de membros e setar como recrutador
    orgData.membros = orgData.membros.filter(m => m !== nome);
    orgData.recrutador = nome;
  } else if (cargoAtual === 'Recrutador' && !orgData.gerente) {
    orgData.recrutador = '';
    orgData.gerente = nome;
  } else if (cargoAtual === 'Gerente' && !orgData.subLider) {
    orgData.gerente = '';
    orgData.subLider = nome;
  } else if (cargoAtual === 'Sub-Líder' && !orgData.lider) {
    orgData.subLider = '';
    orgData.lider = nome;
  } else {
    console.log('Não é possível promover - cargo superior ocupado');
    return;
  }

  saveOrgData();
  renderMembers();
  updateBalanceDisplays();
  triggerServer('painelFacPromover', passaporte);
}

// =====================================================
// Demote member
// =====================================================
function rebaixarMembro(passaporte) {
  if (playerCargo < 3) return;

  const membros = getMembersList();
  const membro = membros.find(m => getPassaporteFromNome(m.nome) === passaporte);
  if (!membro) return;

  const nome = membro.nome;
  const cargoAtual = membro.cargo;

  // Lógica de rebaixamento
  if (cargoAtual === 'Sub-Líder') {
    orgData.subLider = '';
    orgData.gerente = nome;
  } else if (cargoAtual === 'Gerente') {
    orgData.gerente = '';
    orgData.recrutador = nome;
  } else if (cargoAtual === 'Recrutador') {
    orgData.recrutador = '';
    orgData.membros.push(nome);
  } else if (cargoAtual === 'Membro') {
    // Já é membro, não pode rebaixar mais (ou demitir?)
    console.log('Já está no cargo mais baixo');
    return;
  }

  saveOrgData();
  renderMembers();
  updateBalanceDisplays();
  triggerServer('painelFacRebaixar', passaporte);
}

// =====================================================
// Render Extrato
// =====================================================
function renderExtrato() {
  extratoList.innerHTML = transacoes.map(t => `
    <div class="extrato-item">
      <div class="extrato-left">
        <div class="extrato-icon ${t.tipo === 'deposito' ? 'deposit' : 'withdraw'}">
          ${t.tipo === 'deposito' ? 
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="m8 12 4 4 4-4"/></svg>' :
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16V8"/><path d="m8 12 4-4 4 4"/></svg>'
          }
        </div>
        <div class="extrato-info">
          <p>${t.tipo === 'deposito' ? 'Depósito' : 'Saque'}</p>
          <span>${t.responsavel} • ${t.data}</span>
        </div>
      </div>
      <div class="extrato-value ${t.tipo === 'deposito' ? 'positive' : 'negative'}">
        ${t.tipo === 'deposito' ? '+' : '-'}R$ ${t.valor.toLocaleString('pt-BR')}
      </div>
    </div>
  `).join('');
}

// =====================================================
// Update Balance Displays
// =====================================================
function updateBalanceDisplays() {
  const saldo = Number.isFinite(orgSaldo) ? orgSaldo : (orgData?.saldo || 0);
  const formattedBalance = `R$ ${saldo.toLocaleString('pt-BR')}`;
  saldoDisplay.textContent = formattedBalance;
  bankBalance.textContent = formattedBalance;

  document.getElementById('totalMembers').textContent = getTotalMembros();

  // Se servidor não enviou, fallback: pelo menos 1 (o próprio)
  const online = Number.isFinite(membrosOnline) ? membrosOnline : (playerCargo > 0 ? 1 : 0);
  document.getElementById('onlineCount').textContent = online;
}

// =====================================================
// Modal Management
// =====================================================
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('active');
  });
}

// =====================================================
// Bank Operations
// =====================================================
function deposit() {
  const amount = parseInt(bankAmount.value.replace(/\D/g, ''));
  if (amount > 0 && orgData) {
    orgData.saldo = (orgData.saldo || 0) + amount;
    
    transacoes.unshift({
      id: Date.now(),
      tipo: 'deposito',
      valor: amount,
      data: new Date().toLocaleString('pt-BR'),
      responsavel: `#${playerPassaporte} ${playerNick}`
    });

    saveOrgData();
    saveExtrato();
    bankAmount.value = '';
    updateBalanceDisplays();
    renderExtrato();
    
    triggerServer('painelFacDepositar', amount.toString());
  }
}

function withdraw() {
  if (playerCargo < 3) return;
  
  const amount = parseInt(bankAmount.value.replace(/\D/g, ''));
  const saldo = orgData?.saldo || 0;
  
  if (amount > 0 && amount <= saldo && orgData) {
    orgData.saldo = saldo - amount;
    
    transacoes.unshift({
      id: Date.now(),
      tipo: 'saque',
      valor: amount,
      data: new Date().toLocaleString('pt-BR'),
      responsavel: `#${playerPassaporte} ${playerNick}`
    });

    saveOrgData();
    saveExtrato();
    bankAmount.value = '';
    updateBalanceDisplays();
    renderExtrato();
    
    triggerServer('painelFacSacar', amount.toString());
  }
}

// =====================================================
// Contratar membro
// =====================================================
function contratarMembro(passaporte, nick) {
  if (playerCargo < 2 || !orgData) return;
  if (getTotalMembros() >= 30) return;

  const nomeCompleto = `#${passaporte} ${nick}`;
  
  // Adicionar como membro
  if (!orgData.membros) orgData.membros = [];
  orgData.membros.push(nomeCompleto);

  saveOrgData();
  renderMembers();
  updateBalanceDisplays();
}

// =====================================================
// Demitir membro
// =====================================================
function demitirMembro(passaporte) {
  if (playerCargo < 3 || !orgData) return;

  const membros = getMembersList();
  const membro = membros.find(m => getPassaporteFromNome(m.nome) === passaporte);
  if (!membro) return;

  const nome = membro.nome;

  // Remover de qualquer cargo
  if (orgData.lider === nome) orgData.lider = '';
  else if (orgData.subLider === nome) orgData.subLider = '';
  else if (orgData.gerente === nome) orgData.gerente = '';
  else if (orgData.recrutador === nome) orgData.recrutador = '';
  else {
    orgData.membros = (orgData.membros || []).filter(m => m !== nome);
  }

  saveOrgData();
  renderMembers();
  updateBalanceDisplays();
}

// =====================================================
// Event Listeners
// =====================================================
function setupEventListeners() {
  // Tab navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      
      if (tabId === 'settings') {
        if (playerCargo < 3) return;
        
        tempColor = currentColor;
        document.getElementById('logoUrlInput').value = document.getElementById('factionLogo').src;
        document.querySelectorAll('.color-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.color === currentColor);
        });
        openModal('settingsModal');
      } else {
        switchTab(tabId);
      }
    });
  });

  // Search
  searchInput.addEventListener('input', (e) => {
    renderMembers(e.target.value);
  });

  // Bank amount input - only numbers
  bankAmount.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  // Deposit & Withdraw
  document.getElementById('depositBtn').addEventListener('click', deposit);
  document.getElementById('withdrawBtn').addEventListener('click', withdraw);

  // Hire button
  document.getElementById('hireBtn').addEventListener('click', () => {
    if (playerCargo < 2 || getTotalMembros() >= 30) return;
    document.getElementById('hirePassportInput').value = '';
    openModal('hireModal');
  });

  // Fire button
  document.getElementById('fireBtn').addEventListener('click', () => {
    if (playerCargo < 3) return;
    document.getElementById('firePassportInput').value = '';
    openModal('fireModal');
  });

  // Exit button
  document.getElementById('exitBtn').addEventListener('click', () => {
    openModal('exitModal');
  });

  // Close button (X)
  document.getElementById('closeBtn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerServer('painelFacClose', '1');
    // No modo standalone (sem CEF), esconder o painel
    document.querySelector('.panel-container').style.display = 'none';
  });

  // Route buttons
  document.querySelectorAll('.route-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRoute = {
        nome: btn.dataset.route,
        localizacao: btn.dataset.location,
        tipo: btn.dataset.type
      };
      document.getElementById('routeName').textContent = selectedRoute.nome;
      document.getElementById('routeLocation').textContent = selectedRoute.localizacao;
      openModal('routeModal');
    });
  });

  // Color selection
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tempColor = btn.dataset.color;
      document.querySelectorAll('.color-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.color === tempColor);
      });
    });
  });

  // Save settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    if (playerCargo < 3) return;
    
    const logoUrl = document.getElementById('logoUrlInput').value.trim();
    if (logoUrl) {
      document.getElementById('factionLogo').src = logoUrl;
    }
    setTheme(tempColor);
    closeModal('settingsModal');
    
    triggerServer('painelFacConfig', JSON.stringify({ logo: logoUrl, cor: tempColor }));
  });

  // Confirm hire
  document.getElementById('confirmHireBtn').addEventListener('click', () => {
    if (playerCargo < 2) return;
    
    const passport = document.getElementById('hirePassportInput').value.trim();
    if (passport) {
      // No standalone, apenas registrar - em produção o servidor valida
      contratarMembro(passport, 'Novo_Membro');
      triggerServer('painelFacContratar', passport);
      closeModal('hireModal');
    }
  });

  // Confirm fire
  document.getElementById('confirmFireBtn').addEventListener('click', () => {
    if (playerCargo < 3) return;
    
    const passport = document.getElementById('firePassportInput').value.trim();
    if (passport) {
      demitirMembro(passport);
      triggerServer('painelFacDemitir', passport);
      closeModal('fireModal');
    }
  });

  // Confirm exit
  document.getElementById('confirmExitBtn').addEventListener('click', () => {
    // Remover player da org
    if (orgData) {
      const nome = `#${playerPassaporte} ${playerNick}`;
      if (orgData.lider === nome) orgData.lider = '';
      else if (orgData.subLider === nome) orgData.subLider = '';
      else if (orgData.gerente === nome) orgData.gerente = '';
      else if (orgData.recrutador === nome) orgData.recrutador = '';
      else {
        orgData.membros = (orgData.membros || []).filter(m => m !== nome);
      }
      saveOrgData();
    }
    
    triggerServer('painelFacSair', '');
    closeModal('exitModal');
  });

  // Confirm route
  document.getElementById('confirmRouteBtn').addEventListener('click', () => {
    if (selectedRoute) {
      triggerServer('painelFacRota', String(selectedRoute.tipo));
      closeModal('routeModal');
      selectedRoute = null;
    }
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Close modal on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeAllModals();
      }
    });
  });
}
