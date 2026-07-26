/* ==========================================================================
   TaxBot CA Console - Spotlight Command Bar
   Owns keyboard shortcut, client search, and quick navigation commands.
   ========================================================================== */

const commandModal = document.getElementById('global-command-modal');
const commandTrigger = document.getElementById('global-command-trigger');
const commandInput = document.getElementById('command-bar-search-input');
const commandResults = document.getElementById('command-bar-suggestions-list');

const commandSuggestions = [
  { text: 'Show clients with GST due', action: () => { window.location.hash = 'gst'; } },
  { text: 'Find duplicate invoices', action: () => { window.location.hash = 'insights'; renderAIInsights('medium'); } },
  { text: 'Generate monthly P&L statement', action: () => { window.location.hash = 'exports'; } },
  { text: 'Configure WhatsApp Settings', action: () => { window.location.hash = 'settings'; } }
];

function initCommandBar() {
  if (!commandModal || !commandTrigger || !commandInput || !commandResults) return;

  let selectedIndex = -1;

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openBar();
    }
  });

  commandTrigger.onclick = openBar;

  function openBar() {
    commandModal.classList.remove('hidden');
    commandInput.focus();
    renderList('');
  }

  function closeBar() {
    commandModal.classList.add('hidden');
    commandInput.value = '';
    selectedIndex = -1;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBar();
  });

  commandModal.onclick = (e) => {
    if (e.target === commandModal) closeBar();
  };

  commandInput.oninput = (e) => {
    renderList(e.target.value);
  };

  commandInput.onkeydown = (e) => {
    const items = commandResults.querySelectorAll('.command-result-item[data-item-id], #ai-command-search-btn');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSelection(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        items[selectedIndex].click();
      }
    }
  };

  function updateSelection(items) {
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function renderList(query) {
    const q = query.toLowerCase();
    const filteredSuggestions = commandSuggestions.filter(s => s.text.toLowerCase().includes(q));
    let filteredClients = [];

    if (q.length > 0) {
      filteredClients = globalClientsList.filter(c =>
        String(c.name || c.business_name || '').toLowerCase().includes(q) ||
        String(c.gstin || '').toLowerCase().includes(q) ||
        String(c.owner || c.owner_name || '').toLowerCase().includes(q)
      );
    }

    let html = '';
    const itemsToClick = [];

    if (filteredSuggestions.length > 0) {
      html += `<div class="command-result-group-title">Suggestions</div>`;
      filteredSuggestions.forEach(s => {
        const id = itemsToClick.length;
        itemsToClick.push(s.action);
        html += `
          <div class="command-result-item" data-item-id="${id}">
            <i data-lucide="corner-down-right"></i>
            <span>${escapeHtml(s.text)}</span>
          </div>
        `;
      });
    }

    if (filteredClients.length > 0) {
      html += `<div class="command-result-group-title">Clients</div>`;
      filteredClients.forEach(c => {
        const id = itemsToClick.length;
        itemsToClick.push(() => { window.location.hash = `client/${c.id}`; });
        html += `
          <div class="command-result-item" data-item-id="${id}">
            <i data-lucide="user"></i>
            <span>Open workspace for <strong>${escapeHtml(c.name || c.business_name || 'Unnamed Client')}</strong> (${escapeHtml(c.owner || c.owner_name || 'Owner')})</span>
          </div>
        `;
      });
    }

    if (filteredSuggestions.length === 0 && filteredClients.length === 0) {
      if (q.length > 0) {
        html += `
          <div class="command-result-group-title">AI Command Search</div>
          <div class="command-result-item" id="ai-command-search-btn">
            <i data-lucide="sparkles"></i>
            <span>Query AI: "${escapeHtml(query)}"</span>
          </div>
        `;
      } else {
        html += `
          <div class="command-result-group-title">Suggestions</div>
          <div class="command-result-item text-secondary" style="cursor: default;">
            Type to search clients or features...
          </div>
        `;
      }
    }

    commandResults.innerHTML = html;

    document.querySelectorAll('.command-result-item[data-item-id]').forEach(el => {
      el.onclick = () => {
        const id = Number(el.getAttribute('data-item-id'));
        itemsToClick[id]();
        closeBar();
      };
    });

    const aiSearchBtn = document.getElementById('ai-command-search-btn');
    if (aiSearchBtn) {
      aiSearchBtn.onclick = () => {
        showToast(`AI parsed prompt: "${query}"`);
        closeBar();
      };
    }

    const items = commandResults.querySelectorAll('.command-result-item[data-item-id], #ai-command-search-btn');
    selectedIndex = items.length > 0 ? 0 : -1;
    updateSelection(items);

    initIcons();
  }
}
