/*
 * Lattice System + Page Interactions
 *
 * Architecture (Ousterhout):
 * - Lattice: deep module, simple interface, all rendering logic encapsulated
 * - Theme: single source of truth via CSS variables
 * - No shallow wrappers or pass-through layers
 */

// ==========================================================================
// Lattice Class - Deep module for reactive grid rendering
// ==========================================================================

class Lattice {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container;

    // Canvas constants — read from CSS (single source of truth).
    const styles = getComputedStyle(canvas);
    this.gridSize = parseFloat(styles.getPropertyValue('--grid-size-px')) || 100;
    this.connectionRadius = parseFloat(styles.getPropertyValue('--connection-radius')) || 200;
    this.nodeRadius = parseFloat(styles.getPropertyValue('--node-radius')) || 2;

    // State
    this.nodes = [];
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.isVisible = false;
    this.animationId = null;

    this.init();
  }

  init() {
    this.setupResize();
    this.setupMouse();
    this.setupVisibility();
    this.resize();
  }

  setupResize() {
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.container);
  }

  setupMouse() {
    // Track mouse relative to canvas position
    document.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      this.mouseX = -1000;
      this.mouseY = -1000;
    });
  }

  setupVisibility() {
    // Only animate when visible (performance)
    const observer = new IntersectionObserver(
      (entries) => {
        this.isVisible = entries[0].isIntersecting;
        if (this.isVisible && !this.animationId) {
          this.draw();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(this.container);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;

    this.createNodes();
  }

  createNodes() {
    this.nodes = [];
    const cols = Math.ceil(this.width / this.gridSize) + 1;
    const rows = Math.ceil(this.height / this.gridSize) + 1;

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        this.nodes.push({
          x: i * this.gridSize,
          y: j * this.gridSize
        });
      }
    }
  }

  getColors() {
    // Re-read each frame so theme changes take effect without restart.
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

    // Draw nodes
    this.nodes.forEach(node => {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, this.nodeRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = colors.node;
      this.ctx.fill();
    });

    // Draw Manhattan connections to cursor
    this.nodes.forEach(node => {
      const dx = Math.abs(this.mouseX - node.x);
      const dy = Math.abs(this.mouseY - node.y);
      const manhattan = dx + dy;

      if (manhattan < this.connectionRadius) {
        const alpha = 1 - manhattan / this.connectionRadius;
        const lineAlpha = alpha * colors.lineAlphaMax;

        this.ctx.strokeStyle = `rgba(${colors.accentRgb}, ${lineAlpha})`;
        this.ctx.lineWidth = 1;

        // L-shaped path (horizontal then vertical)
        this.ctx.beginPath();
        this.ctx.moveTo(node.x, node.y);
        this.ctx.lineTo(this.mouseX, node.y);
        this.ctx.lineTo(this.mouseX, this.mouseY);
        this.ctx.stroke();

        // Glow in dark mode
        if (colors.glow) {
          this.ctx.shadowColor = `rgba(${colors.accentRgb}, ${colors.glowAlpha})`;
          this.ctx.shadowBlur = 4;
          this.ctx.stroke();
          this.ctx.shadowBlur = 0;
        }
      }
    });

    // Crosshair
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
  }
}

// ==========================================================================
// Initialize Lattices
// ==========================================================================

const heroCanvas = document.getElementById('hero-lattice');
const heroSection = document.querySelector('.hero');
if (heroCanvas && heroSection) {
  new Lattice(heroCanvas, heroSection);
}

const contactCanvas = document.getElementById('contact-lattice');
const contactSection = document.getElementById('contact');
if (contactCanvas && contactSection) {
  new Lattice(contactCanvas, contactSection);
}

// ==========================================================================
// Theme Toggle
// ==========================================================================

const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // Get effective theme (saved preference or system)
  const getEffectiveTheme = () => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return darkQuery.matches ? 'dark' : 'light';
  };

  // Update button text to show opposite of current theme
  const updateButton = () => {
    themeToggle.textContent = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
  };

  // Apply saved preference only (let CSS handle system default)
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  updateButton();

  // Toggle saves explicit preference
  themeToggle.addEventListener('click', () => {
    const newTheme = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateButton();
  });

  // Listen for system theme changes (only matters if no saved preference)
  darkQuery.addEventListener('change', () => {
    if (!localStorage.getItem('theme')) {
      updateButton();
    }
  });
}

// ==========================================================================
// Scroll Progress
// ==========================================================================

const scrollProgress = document.getElementById('scroll-progress');
if (scrollProgress) {
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress.style.width = (scrollTop / docHeight) * 100 + '%';
  }, { passive: true });
}

// ==========================================================================
// Character Animation for Hero Title
// ==========================================================================

const heroTitle = document.getElementById('hero-title');
if (heroTitle) {
  const text = heroTitle.innerHTML;
  let html = '';
  let delay = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '<') {
      // Handle HTML tags (like <em>)
      const endTag = text.indexOf('>', i);
      const tag = text.substring(i, endTag + 1);
      html += tag;
      i = endTag;
    } else {
      const char = text[i] === ' ' ? '&nbsp;' : text[i];
      const delayMs = 0.1 + delay * 0.04;
      html += `<span class="char" style="animation-delay:${delayMs}s">${char}</span>`;
      if (text[i] !== ' ') delay++;
    }
  }

  heroTitle.innerHTML = html;
}

// ==========================================================================
// Reveal on Scroll
// ==========================================================================

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
);

function observeReveal(element) {
  revealObserver.observe(element);
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

document.querySelectorAll('.reveal').forEach(observeReveal);
loadProjects();
