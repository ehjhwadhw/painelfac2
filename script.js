// State
let currentColor = 'yellow';
let saldo = 0;
let transacoes = [];
let membros = [];
let selectedRoute = null;
let tempColor = currentColor;
let playerCargo = 0; // 0=Nenhum, 1=Membro, 2=Recrutador, 3=Gerente, 4=SubLider, 5=Lider
let playerPassaporte = 0;
let playerNick = '';
let orgNome = '';
let totalMembros = 0;
let membrosOnline = 0;

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const membersTable = document.getElementById('membersTable');
const extratoList = document.getElementById('extratoList');
const searchInput = document.getElementById('searchInput');
const saldoDisplay = document.getElementById('saldoDisplay');
const bankBalance = document.getElementById('bankBalance');
const bankAmount = document.getElementById('bankAmount');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setTheme(currentColor);
  renderMembers();
  renderExtrato();
  updateBalanceDisplays();
  setupEventListeners();
  updateUIBasedOnCargo();
});

// CEF Event Handlers
window.setOrgData = function(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    orgNome = data.nome || '';
    saldo = data.saldo || 0;
    membrosOnline = data.membrosOnline || 0;
    totalMembros = data.totalMembros || 0;
    playerCargo = data.cargo || 0;
    playerPassaporte = data.passaporte || 0;
    playerNick = data.nick || '';
    
    document.getElementById('factionName').textContent = orgNome;
    updateBalanceDisplays();
    updateUIBasedOnCargo();
  } catch(e) {
    console.error('Erro ao parsear dados da org:', e);
  }
};

window.setMembros = function(jsonData) {
  try {
    membros = JSON.parse(jsonData);
    renderMembers();
    updateBalanceDisplays();
  } catch(e) {
    console.error('Erro ao parsear membros:', e);
  }
};

// Update UI based on player cargo
function updateUIBasedOnCargo() {
  const hireBtn = document.getElementById('hireBtn');
  const fireBtn = document.getElementById('fireBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  const settingsTab = document.querySelector('[data-tab="settings"]');
  
  // Contratar: Recrutador (2), Gerente (3), SubLider (4), Lider (5)
  if (playerCargo >= 2) {
    hireBtn.classList.remove('disabled');
    hireBtn.disabled = false;
  } else {
    hireBtn.classList.add('disabled');
    hireBtn.disabled = true;
  }
  
  // Demitir: Gerente (3), SubLider (4), Lider (5)
  if (playerCargo >= 3) {
    fireBtn.classList.remove('disabled');
    fireBtn.disabled = false;
  } else {
    fireBtn.classList.add('disabled');
    fireBtn.disabled = true;
  }
  
  // Sacar: Gerente (3), SubLider (4), Lider (5)
  if (playerCargo >= 3) {
    withdrawBtn.classList.remove('disabled');
    withdrawBtn.disabled = false;
  } else {
    withdrawBtn.classList.add('disabled');
    withdrawBtn.disabled = true;
  }
  
  // Configurações: Gerente (3), SubLider (4), Lider (5)
  if (playerCargo >= 3) {
    settingsTab.classList.remove('disabled');
  } else {
    settingsTab.classList.add('disabled');
  }
  
  // Verificar se está lotado (30 membros)
  if (totalMembros >= 30) {
    hireBtn.classList.add('disabled');
    hireBtn.disabled = true;
  }
}

// Theme Management
function setTheme(color) {
  document.body.className = `theme-${color}`;
  currentColor = color;
  
  // Update active color button
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

// Tab Navigation
function switchTab(tabId) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tabId}-content`);
  });
}

// Get passaporte from member name (format: #123456 Nick_Name)
function getPassaporteFromNome(nome) {
  const match = nome.match(/#(\d+)/);
  return match ? match[1] : '';
}

// Render Members Table
function renderMembers(filter = '') {
  const filtered = membros.filter(m => 
    m.nome.toLowerCase().includes(filter.toLowerCase())
  );
  
  membersTable.innerHTML = filtered.map(membro => {
    const passaporte = getPassaporteFromNome(membro.nome);
    const canManage = playerCargo >= 3; // Gerente, SubLider, Lider
    
    return `
      <tr>
        <td style="color: white;">${membro.nome}</td>
        <td>${membro.cargo}</td>
        <td>${membro.tempoJogado}</td>
        <td>${membro.dataEntrada}</td>
        <td>${membro.ultimoLogin}</td>
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

// Promote member
function promoverMembro(passaporte) {
  if (playerCargo < 3) return;
  if (typeof cef !== 'undefined' && cef.trigger) {
    cef.trigger('painelFacPromover', passaporte);
  }
  console.log('Promover:', passaporte);
}

// Demote member
function rebaixarMembro(passaporte) {
  if (playerCargo < 3) return;
  if (typeof cef !== 'undefined' && cef.trigger) {
    cef.trigger('painelFacRebaixar', passaporte);
  }
  console.log('Rebaixar:', passaporte);
}

// Render Extrato
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

// Update Balance Displays
function updateBalanceDisplays() {
  const formattedBalance = `R$ ${saldo.toLocaleString('pt-BR')}`;
  saldoDisplay.textContent = formattedBalance;
  bankBalance.textContent = formattedBalance;
  document.getElementById('totalMembers').textContent = totalMembros;
  document.getElementById('onlineCount').textContent = membrosOnline;
}

// Modal Management
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

// Bank Operations
function deposit() {
  const amount = parseInt(bankAmount.value.replace(/\D/g, ''));
  if (amount > 0) {
    // Enviar para o servidor via CEF
    if (typeof cef !== 'undefined' && cef.trigger) {
      cef.trigger('painelFacDepositar', amount.toString());
    }
    
    saldo += amount;
    transacoes.unshift({
      id: Date.now(),
      tipo: 'deposito',
      valor: amount,
      data: new Date().toLocaleString('pt-BR'),
      responsavel: `#${playerPassaporte} ${playerNick}`
    });
    bankAmount.value = '';
    updateBalanceDisplays();
    renderExtrato();
  }
}

function withdraw() {
  if (playerCargo < 3) return; // Só gerente+
  
  const amount = parseInt(bankAmount.value.replace(/\D/g, ''));
  if (amount > 0 && amount <= saldo) {
    // Enviar para o servidor via CEF
    if (typeof cef !== 'undefined' && cef.trigger) {
      cef.trigger('painelFacSacar', amount.toString());
    }
    
    saldo -= amount;
    transacoes.unshift({
      id: Date.now(),
      tipo: 'saque',
      valor: amount,
      data: new Date().toLocaleString('pt-BR'),
      responsavel: `#${playerPassaporte} ${playerNick}`
    });
    bankAmount.value = '';
    updateBalanceDisplays();
    renderExtrato();
  }
}

// Event Listeners
function setupEventListeners() {
  // Tab navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      
      // Verificar permissão para configurações
      if (tabId === 'settings') {
        if (playerCargo < 3) return; // Só gerente+
        
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
    if (playerCargo < 2 || totalMembros >= 30) return;
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
  document.getElementById('closeBtn').addEventListener('click', () => {
    if (typeof cef !== 'undefined' && cef.trigger) {
      cef.trigger('painelFacClose', '');
    }
    console.log('Fechar painel');
  });

  // Route buttons
  document.querySelectorAll('.route-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRoute = {
        nome: btn.dataset.route,
        localizacao: btn.dataset.location,
        tipo: btn.dataset.type // 1 = Sul, 2 = Norte
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
    
    // Enviar para servidor
    if (typeof cef !== 'undefined' && cef.trigger) {
      cef.trigger('painelFacConfig', JSON.stringify({ logo: logoUrl, cor: tempColor }));
    }
  });

  // Confirm hire
  document.getElementById('confirmHireBtn').addEventListener('click', () => {
    if (playerCargo < 2) return;
    
    const passport = document.getElementById('hirePassportInput').value.trim();
    if (passport) {
      if (typeof cef !== 'undefined' && cef.trigger) {
        cef.trigger('painelFacContratar', passport);
      }
      console.log('Contratar jogador com passaporte:', passport);
      closeModal('hireModal');
    }
  });

  // Confirm fire
  document.getElementById('confirmFireBtn').addEventListener('click', () => {
    if (playerCargo < 3) return;
    
    const passport = document.getElementById('firePassportInput').value.trim();
    if (passport) {
      if (typeof cef !== 'undefined' && cef.trigger) {
        cef.trigger('painelFacDemitir', passport);
      }
      console.log('Demitir jogador com passaporte:', passport);
      closeModal('fireModal');
    }
  });

  // Confirm exit
  document.getElementById('confirmExitBtn').addEventListener('click', () => {
    if (typeof cef !== 'undefined' && cef.trigger) {
      cef.trigger('painelFacSair', '');
    }
    console.log('Saiu da facção');
    closeModal('exitModal');
  });

  // Confirm route
  document.getElementById('confirmRouteBtn').addEventListener('click', () => {
    if (selectedRoute) {
      if (typeof cef !== 'undefined' && cef.trigger) {
        cef.trigger('painelFacRota', selectedRoute.tipo);
      }
      console.log('Iniciando rota:', selectedRoute.nome, selectedRoute.localizacao, 'Tipo:', selectedRoute.tipo);
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
