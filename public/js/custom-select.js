export function initCustomSelects() {
  const domObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'SELECT') {
            setupCustomSelect(node);
          }
          const selects = node.querySelectorAll('select');
          selects.forEach(setupCustomSelect);
        }
      });
    });
  });

  domObserver.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll('select').forEach(setupCustomSelect);
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-wrapper')) {
      document.querySelectorAll('.custom-select-menu.open').forEach(menu => {
        menu.classList.remove('open');
        menu.previousElementSibling.classList.remove('open');
      });
    }
  });
}

function setupCustomSelect(selectEl) {
  if (selectEl.dataset.customized) return;
  selectEl.dataset.customized = "true";
  selectEl.classList.add('customized');

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  
  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.tabIndex = 0;
  
  const textSpan = document.createElement('span');
  textSpan.className = 'custom-select-text';
  
  const icon = document.createElement('div');
  icon.className = 'custom-select-icon';
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
  
  trigger.append(textSpan, icon);
  
  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  
  // Place native select inside wrapper so that clicks on label (which trigger select clicks)
  // are detected as clicks inside the wrapper, preventing the menu from closing.
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.append(selectEl, trigger, menu);

  const updateDisabledState = () => {
    if (selectEl.disabled) {
      wrapper.classList.add('disabled');
      trigger.setAttribute('tabindex', '-1');
      menu.classList.remove('open');
      trigger.classList.remove('open');
    } else {
      wrapper.classList.remove('disabled');
      trigger.setAttribute('tabindex', '0');
    }
  };

  const renderOptions = () => {
    menu.innerHTML = '';
    const options = Array.from(selectEl.options);
    if (options.length === 0) {
      textSpan.textContent = "Select...";
      return;
    }
    
    const selectedOption = options.find(opt => opt.selected) || options[0];
    textSpan.textContent = selectedOption.text;
    
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-select-option';
      if (opt.selected) item.classList.add('selected');
      item.textContent = opt.text;
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectEl.disabled) return;
        selectEl.value = opt.value;
        textSpan.textContent = opt.text;
        menu.querySelectorAll('.custom-select-option').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        
        menu.classList.remove('open');
        trigger.classList.remove('open');
        
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.append(item);
    });
  };

  updateDisabledState();
  renderOptions();

  const observer = new MutationObserver((mutations) => {
    let hasAttributeChange = false;
    let hasChildChange = false;
    mutations.forEach(m => {
      if (m.type === 'attributes') hasAttributeChange = true;
      if (m.type === 'childList') hasChildChange = true;
    });
    if (hasAttributeChange) {
      updateDisabledState();
    }
    if (hasChildChange) {
      renderOptions();
    }
  });
  observer.observe(selectEl, { childList: true, attributes: true, attributeFilter: ['disabled'] });

  const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(selectEl, 'value', {
    get: function() {
      return nativeDescriptor.get.call(this);
    },
    set: function(val) {
      nativeDescriptor.set.call(this, val);
      renderOptions();
    }
  });

  const nativeDisabledDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
  if (nativeDisabledDescriptor) {
    Object.defineProperty(selectEl, 'disabled', {
      get: function() {
        return nativeDisabledDescriptor.get.call(this);
      },
      set: function(val) {
        nativeDisabledDescriptor.set.call(this, val);
        updateDisabledState();
      }
    });
  }

  const toggleMenu = (e) => {
    if (selectEl.disabled) return;
    if (e) e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.custom-select-menu.open').forEach(m => {
      m.classList.remove('open');
      m.previousElementSibling.classList.remove('open');
    });
    
    if (!isOpen) {
      renderOptions(); // Ensure we're up to date
      menu.classList.add('open');
      trigger.classList.add('open');
    }
  };

  trigger.addEventListener('click', toggleMenu);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMenu(e);
    }
  });
  
  selectEl.addEventListener('change', () => {
    renderOptions();
  });
}
