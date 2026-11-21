/* =========================================================
   Arduino Uno Simulator — lógica de la aplicación (A1)
   - Estado compartido (preparado para A2–A5).
   - Navegación SPA basada en el hash de la URL.
   - Preparación de vistas (contenido estático de demostración).
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Estado compartido ---------- */
  // Se ampliará en entregas futuras (componente seleccionado, LEDs, programa...).
  var state = {
    currentView: null
  };

  /* ---------- Registro de vistas ---------- */
  // Cada vista puede definir onEnter / onLeave para entregas futuras.
  var DEFAULT_VIEW = 'inicio';
  var views = {
    inicio: {},
    conoce: {},
    conecta: {},
    programa: {}
  };

  /* ---------- Navegación ---------- */
  var Router = {
    viewEls: {},
    navLinks: [],

    init: function () {
      var self = this;
      Object.keys(views).forEach(function (name) {
        self.viewEls[name] = document.querySelector('[data-view="' + name + '"]');
      });
      this.navLinks = Array.prototype.slice.call(document.querySelectorAll('.main-nav__link'));

      window.addEventListener('hashchange', function () {
        self.show(self.viewFromHash(), true);
      });

      // Primera carga: sin mover el foco.
      this.show(this.viewFromHash(), false);
    },

    viewFromHash: function () {
      var name = window.location.hash.replace(/^#/, '');
      return Object.prototype.hasOwnProperty.call(views, name) ? name : DEFAULT_VIEW;
    },

    show: function (name, moveFocus) {
      if (name === state.currentView) {
        return;
      }
      var previous = state.currentView;
      if (previous && views[previous].onLeave) {
        views[previous].onLeave();
      }

      Object.keys(this.viewEls).forEach(function (key) {
        var el = this.viewEls[key];
        var active = key === name;
        el.hidden = !active;
        el.classList.toggle('is-entering', active && previous !== null);
      }, this);

      this.navLinks.forEach(function (link) {
        if (link.getAttribute('data-nav') === name) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });

      state.currentView = name;
      document.title = this.titleFor(name);
      window.scrollTo(0, 0);

      if (moveFocus) {
        var heading = this.viewEls[name].querySelector('h1');
        if (heading) {
          heading.focus({ preventScroll: true });
        }
      }

      if (views[name].onEnter) {
        views[name].onEnter();
      }
    },

    titleFor: function (name) {
      var titles = {
        inicio: 'Arduino Uno Simulator',
        conoce: 'Conoce tu Arduino · Arduino Uno Simulator',
        conecta: 'Conecta tus LEDs · Arduino Uno Simulator',
        programa: 'Programa tus LEDs · Arduino Uno Simulator'
      };
      return titles[name];
    }
  };

  /* ---------- Preparación de vistas (contenido estático) ---------- */
  var DEMO_CODE = [
    '// Ejemplo de demostración (todavía no se ejecuta)',
    'void setup() {',
    '  pinMode(13, OUTPUT);',
    '}',
    '',
    'void loop() {',
    '  digitalWrite(13, HIGH);',
    '  delay(1000);',
    '  digitalWrite(13, LOW);',
    '  delay(1000);',
    '}'
  ];

  function renderDemoCode() {
    var target = document.getElementById('demo-code');
    if (!target) { return; }
    var fragment = document.createDocumentFragment();
    DEMO_CODE.forEach(function (line) {
      var span = document.createElement('span');
      span.className = 'code-line';
      span.textContent = line;
      fragment.appendChild(span);
    });
    target.appendChild(fragment);
  }

  function renderPinOptions() {
    var select = document.getElementById('pin-select');
    if (!select) { return; }
    for (var pin = 2; pin <= 13; pin++) {
      var option = document.createElement('option');
      option.value = String(pin);
      option.textContent = 'D' + pin;
      select.appendChild(option);
    }
  }

  /* ---------- Inicio ---------- */
  function init() {
    renderDemoCode();
    renderPinOptions();
    Router.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
