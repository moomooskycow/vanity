/*
 * Theme system, project rendering, and lattice animation.
 *
 * Architecture:
 * - CSS owns visual tokens.
 * - themes.json owns theme copy.
 * - script.js wires state, rendering, and motion.
 */

const THEME_STORAGE_KEY = 'phaedrus-theme';
const VALID_THEMES = ['editorial', 'contractor', 'lattice'];
const themeState = {
  defaultTheme: 'lattice',
  catalog: null,
};

class Lattice {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container;
    this.nodes = [];
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.isVisible = false;
    this.animationId = null;
    this.resizeObserver = null;
    this.visibilityObserver = null;

    this.readTokens();
    this.init();
  }

  readTokens() {
    const styles = getComputedStyle(this.canvas);
    this.gridSize = parseFloat(styles.getPropertyValue('--grid-size-px')) || 96;
    this.connectionRadius = parseFloat(styles.getPropertyValue('--connection-radius')) || 240;
    this.nodeRadius = parseFloat(styles.getPropertyValue('--node-radius')) || 2;
  }

  init() {
    this.setupResize();
    this.setupMouse();
    this.setupVisibility();
    this.resize();
  }

  setupResize() {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  setupMouse() {
    document.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = event.clientX - rect.left;
      this.mouseY = event.clientY - rect.top;
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      this.mouseX = -1000;
      this.mouseY = -1000;
    });
  }

  setupVisibility() {
    this.visibilityObserver = new IntersectionObserver((entries) => {
      this.isVisible = entries[0].isIntersecting;
      if (this.isVisible && !this.animationId) {
        this.draw();
      }
    }, { threshold: 0.1 });

    this.visibilityObserver.observe(this.container);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.width = rect.width;
    this.height = rect.height;
    this.readTokens();
    this.createNodes();
  }

  refreshTheme() {
    this.readTokens();
    this.createNodes();
  }

  createNodes() {
    this.nodes = [];
    const cols = Math.ceil(this.width / this.gridSize) + 1;
    const rows = Math.ceil(this.height / this.gridSize) + 1;

    for (let column = 0; column < cols; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        this.nodes.push({
          x: column * this.gridSize,
          y: row * this.gridSize,
        });
      }
    }
  }

  getColors() {
    const styles = getComputedStyle(this.canvas);
    return {
      node: styles.getPropertyValue('--node-color').trim(),
      accentRgb: styles.getPropertyValue('--accent-rgb').trim(),
      lineAlphaMax: parseFloat(styles.getPropertyValue('--lattice-line-alpha-max')) || 0.3,
      crosshairAlpha: parseFloat(styles.getPropertyValue('--lattice-crosshair-alpha')) || 0.25,
      glow: styles.getPropertyValue('--lattice-glow').trim() === '1',
      glowAlpha: parseFloat(styles.getPropertyValue('--lattice-glow-alpha')) || 0.25,
    };
  }

  draw() {
    if (!this.isVisible) {
      this.animationId = null;
      return;
    }

    const colors = this.getColors();
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.nodes.forEach((node) => {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, this.nodeRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = colors.node;
      this.ctx.fill();
    });

    this.nodes.forEach((node) => {
      const dx = Math.abs(this.mouseX - node.x);
      const dy = Math.abs(this.mouseY - node.y);
      const manhattan = dx + dy;

      if (manhattan < this.connectionRadius) {
        const alpha = 1 - manhattan / this.connectionRadius;
        const lineAlpha = alpha * colors.lineAlphaMax;

        this.ctx.strokeStyle = `rgba(${colors.accentRgb}, ${lineAlpha})`;
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();
        this.ctx.moveTo(node.x, node.y);
        this.ctx.lineTo(this.mouseX, node.y);
        this.ctx.lineTo(this.mouseX, this.mouseY);
        this.ctx.stroke();

        if (colors.glow) {
          this.ctx.shadowColor = `rgba(${colors.accentRgb}, ${colors.glowAlpha})`;
          this.ctx.shadowBlur = 6;
          this.ctx.stroke();
          this.ctx.shadowBlur = 0;
        }
      }
    });

    this.ctx.strokeStyle = `rgba(${colors.accentRgb}, ${colors.crosshairAlpha})`;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.mouseX, 0);
    this.ctx.lineTo(this.mouseX, this.height);
    this.ctx.moveTo(0, this.mouseY);
    this.ctx.lineTo(this.width, this.mouseY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.animationId = requestAnimationFrame(() => this.draw());
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
    }
  }
}

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

function observeReveal(element) {
  if (!element) {
    return;
  }
  revealObserver.observe(element);
}

const lattices = [];

function initLattice(canvasId, containerSelector) {
  const canvas = document.getElementById(canvasId);
  const container = document.querySelector(containerSelector);

  if (canvas && container) {
    lattices.push(new Lattice(canvas, container));
  }
}

function isValidTheme(theme) {
  return VALID_THEMES.includes(theme);
}

function getForcedTheme() {
  const forcedTheme = new URLSearchParams(window.location.search).get('theme');
  return isValidTheme(forcedTheme) ? forcedTheme : null;
}

function getStoredTheme() {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isValidTheme(savedTheme) ? savedTheme : null;
}

function getCurrentTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  return isValidTheme(currentTheme) ? currentTheme : themeState.defaultTheme;
}

function resolveInitialTheme() {
  return getForcedTheme() || getStoredTheme() || themeState.defaultTheme;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element && typeof value === 'string') {
    element.textContent = value;
  }
}

function setHTML(id, value) {
  const element = document.getElementById(id);
  if (element && typeof value === 'string') {
    element.innerHTML = value;
  }
}

function animateHeroTitle(rawHtml) {
  const heroTitle = document.getElementById('hero-title');
  if (!heroTitle) {
    return;
  }

  let animatedHtml = '';
  let wordBuffer = '';
  let delay = 0;

  const flushWord = () => {
    if (!wordBuffer) {
      return;
    }

    let renderedWord = '';
    for (const character of wordBuffer) {
      const delaySeconds = 0.08 + delay * 0.025;
      renderedWord += `<span class="char" style="animation-delay:${delaySeconds}s">${character}</span>`;
      delay += 1;
    }

    animatedHtml += `<span class="word">${renderedWord}</span>`;
    wordBuffer = '';
  };

  for (let index = 0; index < rawHtml.length; index += 1) {
    if (rawHtml[index] === '<') {
      flushWord();
      const endTag = rawHtml.indexOf('>', index);
      if (endTag === -1) {
        break;
      }
      animatedHtml += rawHtml.substring(index, endTag + 1);
      index = endTag;
      continue;
    }

    if (/\s/.test(rawHtml[index])) {
      flushWord();
      animatedHtml += rawHtml[index];
      continue;
    }

    wordBuffer += rawHtml[index];
  }

  flushWord();
  heroTitle.innerHTML = animatedHtml;
}

function renderHeroPoints(points) {
  const container = document.getElementById('hero-points');
  if (!container || !Array.isArray(points)) {
    return;
  }

  const items = points.map((point) => {
    const item = document.createElement('li');
    item.textContent = point;
    return item;
  });

  container.replaceChildren(...items);
}

function renderServices(items) {
  const container = document.getElementById('services-list');
  if (!container || !Array.isArray(items)) {
    return;
  }

  const renderedItems = items.map((item) => {
    const listItem = document.createElement('li');
    const heading = document.createElement('h3');
    const body = document.createElement('p');

    heading.textContent = item.title;
    body.textContent = item.body;

    listItem.append(heading, body);
    return listItem;
  });

  container.replaceChildren(...renderedItems);
}

function renderTheme(themeKey) {
  if (!themeState.catalog) {
    return;
  }

  const theme = themeState.catalog[themeKey];
  if (!theme) {
    return;
  }

  setText('services-nav-label', theme.navLabel);
  setText('hero-kicker', theme.hero.kicker);
  animateHeroTitle(theme.hero.title);
  setText('hero-sub', theme.hero.sub);
  setText('hero-note-label', theme.hero.noteLabel);
  setText('hero-note', theme.hero.note);
  renderHeroPoints(theme.hero.points);
  setText('hero-cta', theme.hero.cta);

  setText('services-kicker', theme.positioning.kicker);
  setText('services-title', theme.positioning.title);
  setText('services-intro', theme.positioning.intro);
  renderServices(theme.positioning.items);
  setText('services-quote', theme.positioning.quote);
  setText('services-quote-source', theme.positioning.quoteSource);

  setText('contact-title', theme.contact.title);
  setText('contact-intro', theme.contact.intro);
  setText('contact-cta', theme.contact.cta);
}

function updateThemeButtons(activeTheme) {
  document.querySelectorAll('[data-set-theme]').forEach((button) => {
    const isActive = button.dataset.setTheme === activeTheme;
    button.setAttribute('aria-pressed', String(isActive));
    button.classList.toggle('is-active', isActive);
  });
}

function applyTheme(theme, { persist = true } = {}) {
  if (!isValidTheme(theme)) {
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButtons(theme);
  renderTheme(theme);
  lattices.forEach((lattice) => lattice.refreshTheme());

  if (persist) {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

function createProjectCard(project) {
  const card = document.createElement('a');
  card.href = project.url;
  card.target = '_blank';
  card.rel = 'noopener';
  card.className = 'project reveal';

  const title = document.createElement('h4');
  title.textContent = project.name;

  const blurb = document.createElement('p');
  blurb.textContent = project.blurb;

  card.append(title, blurb);
  return card;
}

function renderProjectStatus(container, message, isError = false) {
  const status = document.createElement('p');
  status.className = isError ? 'projects-status projects-status-error' : 'projects-status';
  status.textContent = message;
  container.replaceChildren(status);
}

async function loadProjects() {
  const container = document.getElementById('projects-grid');
  if (!container) {
    return;
  }

  try {
    const response = await fetch('./projects.json');
    if (!response.ok) {
      throw new Error(`Unable to load projects (${response.status})`);
    }

    const projects = await response.json();
    if (!Array.isArray(projects)) {
      throw new Error('projects.json did not contain an array');
    }

    container.replaceChildren();
    projects.forEach((project) => {
      const card = createProjectCard(project);
      container.append(card);
      observeReveal(card);
    });
  } catch (error) {
    console.error(error);
    const message = window.location.protocol === 'file:'
      ? 'Project archive loads over HTTP. Run a local server for full local development.'
      : 'Project archive is unavailable right now.';
    renderProjectStatus(container, message, true);
  }
}

async function loadThemes() {
  try {
    const response = await fetch('./themes.json');
    if (!response.ok) {
      throw new Error(`Unable to load themes (${response.status})`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || !payload.themes) {
      throw new Error('themes.json did not contain a themes object');
    }

    return payload;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function initScrollProgress() {
  const scrollProgress = document.getElementById('scroll-progress');
  if (!scrollProgress) {
    return;
  }

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    scrollProgress.style.width = `${progress}%`;
  }, { passive: true });
}

function initThemePicker() {
  document.querySelectorAll('[data-set-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.setTheme);
    });
  });
}

async function boot() {
  initLattice('hero-lattice', '.hero');
  initLattice('contact-lattice', '#contact');
  initScrollProgress();
  initThemePicker();
  document.querySelectorAll('.reveal').forEach(observeReveal);

  const initialTheme = resolveInitialTheme();
  updateThemeButtons(initialTheme);
  animateHeroTitle(document.getElementById('hero-title')?.innerHTML || '');
  applyTheme(initialTheme, { persist: false });

  const [themePayload] = await Promise.all([
    loadThemes(),
    loadProjects(),
  ]);

  if (themePayload?.defaultTheme && isValidTheme(themePayload.defaultTheme)) {
    themeState.defaultTheme = themePayload.defaultTheme;
  }

  if (themePayload?.themes) {
    themeState.catalog = themePayload.themes;
    renderTheme(getCurrentTheme());
  }

  if (!getForcedTheme() && !getStoredTheme()) {
    document.documentElement.setAttribute('data-theme', themeState.defaultTheme);
    updateThemeButtons(themeState.defaultTheme);
    renderTheme(themeState.defaultTheme);
    lattices.forEach((lattice) => lattice.refreshTheme());
  }
}

boot();
