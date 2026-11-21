/* =========================================================
   Arduino Uno Simulator — lógica de la aplicación
   A1: estado compartido y navegación SPA basada en el hash.
   A2: tarjeta Arduino Uno R3 interactiva y explorador de
       los 13 grupos de componentes.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Estado compartido ---------- */
  // Se ampliará en entregas futuras (LEDs conectados, programa...).
  var state = {
    currentView: null,
    explorer: {
      index: -1,     // posición en COMPONENTS (-1 = ninguno)
      partId: null   // subparte seleccionada (ICSP, LEDs, jack/diodo)
    },
    // A3: LEDs externos conectados. Cada LED: { id, color, pin, resistorOhms, groundPin, on }.
    leds: [],
    ledSeq: 0        // contador para identificadores únicos (no se reutilizan)
  };

  /* ---------- Registro de vistas ---------- */
  // Cada vista puede definir onEnter / onLeave para entregas futuras.
  var DEFAULT_VIEW = 'inicio';
  var views = {
    inicio: {},
    conoce: { onEnter: function () { BoardZoom.update(); } },
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

  /* =========================================================
     Datos de la tarjeta (A2 / A2.1)
     Coordenadas en unidades del SVG (#uno-board), orientación
     horizontal con el USB a la izquierda. Fuente: diseño oficial
     EAGLE "UNO-TH_Rev3e.brd". Conversión desde milímetros:
     X = x × 9,52 ; Y = (53,34 − y) × 9,52.
     ========================================================= */
  var BOARD = {
    // Pines de los conectores IOH, IOL, POWER y AD. "digital: true" marca D2–D13 para A3.
    pins: [
      { id: 'SCL', label: 'SCL', x: 178.9, y: 24.2 },
      { id: 'SDA', label: 'SDA', x: 203.1, y: 24.2 },
      { id: 'AREF', label: 'AREF', x: 227.3, y: 24.2 },
      { id: 'GND_D', label: 'GND', x: 251.5, y: 24.2, ground: true },
      { id: 'D13', label: '13', x: 275.7, y: 24.2, digital: true, number: 13 },
      { id: 'D12', label: '12', x: 299.9, y: 24.2, digital: true, number: 12 },
      { id: 'D11', label: '~11', x: 324.1, y: 24.2, digital: true, number: 11 },
      { id: 'D10', label: '~10', x: 348.3, y: 24.2, digital: true, number: 10 },
      { id: 'D9', label: '~9', x: 372.5, y: 24.2, digital: true, number: 9 },
      { id: 'D8', label: '8', x: 396.6, y: 24.2, digital: true, number: 8 },
      { id: 'D7', label: '7', x: 435.3, y: 24.2, digital: true, number: 7 },
      { id: 'D6', label: '~6', x: 459.4, y: 24.2, digital: true, number: 6 },
      { id: 'D5', label: '~5', x: 483.6, y: 24.2, digital: true, number: 5 },
      { id: 'D4', label: '4', x: 507.8, y: 24.2, digital: true, number: 4 },
      { id: 'D3', label: '~3', x: 532.0, y: 24.2, digital: true, number: 3 },
      { id: 'D2', label: '2', x: 556.2, y: 24.2, digital: true, number: 2 },
      { id: 'D1', label: '1', x: 580.4, y: 24.2 },
      { id: 'D0', label: '0', x: 604.5, y: 24.2 },
      { id: 'NC', label: '', x: 266.0, y: 483.6 },
      { id: 'IOREF', label: 'IOREF', x: 290.2, y: 483.6 },
      { id: 'RESET', label: 'RESET', x: 314.4, y: 483.6 },
      { id: '3V3', label: '3.3V', x: 338.5, y: 483.6 },
      { id: '5V', label: '5V', x: 362.7, y: 483.6 },
      { id: 'GND_P1', label: 'GND', x: 386.9, y: 483.6, ground: true },
      { id: 'GND_P2', label: 'GND', x: 411.1, y: 483.6, ground: true },
      { id: 'VIN', label: 'VIN', x: 435.3, y: 483.6 },
      { id: 'A0', label: 'A0', x: 483.6, y: 483.6 },
      { id: 'A1', label: 'A1', x: 507.8, y: 483.6 },
      { id: 'A2', label: 'A2', x: 532.0, y: 483.6 },
      { id: 'A3', label: 'A3', x: 556.2, y: 483.6 },
      { id: 'A4', label: 'A4', x: 580.4, y: 483.6 },
      { id: 'A5', label: 'A5', x: 604.5, y: 483.6 }
    ],
    // Indicadores integrados. linkedPin se usará en la simulación (A5).
    indicators: {
      ON: { linkedPin: null },
      RX: { linkedPin: null },
      TX: { linkedPin: null },
      L: { linkedPin: 'D13' }
    },
    // ICSP1 (ATmega16U2) e ICSP (ATmega328P), paso de 2,54 mm.
    icspPins: [
      { x: 149.9, y: 55.6 }, { x: 174.1, y: 55.6 }, { x: 198.3, y: 55.6 },
      { x: 149.9, y: 79.8 }, { x: 174.1, y: 79.8 }, { x: 198.3, y: 79.8 },
      { x: 605.7, y: 217.6 }, { x: 629.9, y: 217.6 },
      { x: 605.7, y: 241.8 }, { x: 629.9, y: 241.8 },
      { x: 605.7, y: 266.0 }, { x: 629.9, y: 266.0 }
    ],
    // ZU4 (DIP-28): primera pata y paso, filas superior e inferior.
    dip: { firstX: 284.1, pitch: 24.18, rowsY: [315.5, 388.1] }
  };

  /* ---------- Los 13 grupos de componentes ---------- */
  // zones: cada pieza física tiene
  //   shape: rectángulo de la pieza real (se usa para el resaltado),
  //   hit:   área táctil, más grande que la pieza y sin invadir otras zonas.
  // markers: posición de los números seleccionables.
  // parts[].pill: etiqueta táctil de cada subparte (se muestra al elegir el grupo).
  // ref: referencia de la pieza en el diseño oficial (EAGLE).
  var COMPONENTS = [
    {
      id: 'polifusible',
      ref: 'F1',
      name: 'Polifusible USB',
      what: 'Es un fusible que se recupera solo. Está junto al conector USB.',
      purpose: 'Protege la computadora y la tarjeta. Si por el USB pasa demasiada corriente (más de 500 mA), corta el paso hasta que el problema se resuelve.',
      kid: 'Es como un guardián de la entrada USB: si llega demasiada corriente, cierra el paso. Cuando todo vuelve a la normalidad, deja pasar otra vez.',
      zones: [{ shape: { x: 23.5, y: 233.6, w: 30.5, h: 43 }, hit: { x: 10, y: 226, w: 50, h: 58 } }],
      markers: [{ x: 6, y: 255 }]
    },
    {
      id: 'jack',
      ref: 'X1 y D1',
      name: 'Jack DC y diodo',
      what: 'El jack es el conector redondo de alimentación externa. Cerca de él hay un diodo que protege esa entrada.',
      purpose: 'Permiten usar Arduino sin computadora, con un adaptador o una batería de 7 a 12 V. El diodo bloquea la corriente si la conexión está al revés.',
      kid: 'El jack es la entrada de energía externa. El diodo es como una calle de un solo sentido: la corriente solo puede avanzar hacia un lado.',
      zones: [
        { part: 'jack', shape: { x: -17, y: 391, w: 133, h: 98 }, hit: { x: -21, y: 387, w: 141, h: 106 } },
        { part: 'diodo', shape: { x: 176, y: 464, w: 59, h: 34 }, hit: { x: 170, y: 458, w: 71, h: 46 } }
      ],
      markers: [{ x: 100, y: 406 }],
      parts: [
        {
          id: 'jack',
          name: 'Jack DC',
          pill: { x: 50, y: 470, label: 'Jack' },
          what: 'Es un conector redondo de alimentación de 2,1 mm.',
          purpose: 'Recibe energía de un adaptador o de una batería. Se recomienda un voltaje de 7 a 12 V.',
          kid: 'Es el enchufe de Arduino para recibir energía sin usar la computadora.'
        },
        {
          id: 'diodo',
          name: 'Diodo de protección',
          pill: { x: 205, y: 481, label: 'Diodo' },
          what: 'Es un diodo rectificador ubicado entre el jack y el resto de la tarjeta.',
          purpose: 'Deja pasar la corriente solo en un sentido. Si la alimentación se conecta con la polaridad invertida, la bloquea y protege la tarjeta.',
          kid: 'Funciona como una calle de un solo sentido: la corriente solo puede avanzar hacia un lado.'
        }
      ]
    },
    {
      id: 'reg5v',
      ref: 'U1',
      name: 'Regulador de 5 V',
      what: 'Es un circuito integrado que regula el voltaje. Está al lado del jack DC.',
      purpose: 'Convierte el voltaje que llega por el jack o por el pin VIN en 5 V estables para la tarjeta.',
      kid: 'Recibe energía con más voltaje y la deja justo en 5 V, la medida que necesita Arduino.',
      zones: [{ shape: { x: 38, y: 311, w: 74, h: 62 }, hit: { x: 30, y: 300, w: 86, h: 80 } }],
      markers: [{ x: 80, y: 294 }]
    },
    {
      id: 'reg33v',
      ref: 'U2',
      name: 'Regulador de 3,3 V',
      what: 'Es un regulador pequeño, de cinco patas, que trabaja con los 5 V de la tarjeta.',
      purpose: 'Entrega 3,3 V en el pin 3.3V, para sensores y módulos que funcionan con ese voltaje. Ese pin puede dar como máximo 50 mA.',
      kid: 'Prepara una medida de energía más pequeña, 3,3 V, para los componentes que la necesitan.',
      zones: [{ shape: { x: 193, y: 349, w: 32.4, h: 27.6 }, hit: { x: 186, y: 342, w: 46, h: 42 } }],
      markers: [{ x: 148, y: 364 }]
    },
    {
      id: 'lmv358',
      ref: 'U5',
      name: 'LMV358',
      what: 'Es un circuito integrado con dos amplificadores operacionales.',
      purpose: 'Uno compara voltajes para elegir la alimentación: si hay energía suficiente en el jack o en VIN, desconecta la del USB. El otro controla el LED L.',
      kid: 'Es como un árbitro: revisa de dónde llega la energía y decide cuál usar.',
      zones: [{ shape: { x: 157, y: 300, w: 48.6, h: 28.6 }, hit: { x: 150, y: 292, w: 62, h: 48 } }],
      markers: [{ x: 136, y: 314 }]
    },
    {
      id: 'atmega16u2',
      ref: 'U3',
      name: 'ATmega16U2',
      what: 'Es un segundo microcontrolador, más pequeño, ubicado cerca del conector USB.',
      purpose: 'Traduce la comunicación USB de la computadora a comunicación serial para el ATmega328P. Así se cargan los programas y se envían mensajes.',
      kid: 'Es como un traductor: la computadora habla USB, el cerebro de Arduino habla serial y el ATmega16U2 los ayuda a entenderse.',
      zones: [{ shape: { x: 163.2, y: 151.1, w: 53.3, h: 53.3 }, hit: { x: 156, y: 144, w: 68, h: 68 } }],
      markers: [{ x: 145, y: 196 }]
    },
    {
      id: 'cristal',
      ref: 'Y1',
      name: 'Cristal de 16 MHz',
      what: 'Es un cristal de cuarzo dentro de una cápsula metálica ovalada.',
      purpose: 'Es el reloj del ATmega16U2: produce 16 millones de pulsos por segundo, muy precisos.',
      kid: 'Es como un metrónomo superrápido que marca el ritmo para que el ATmega16U2 trabaje a tiempo.',
      zones: [{ shape: { x: 125.7, y: 237, w: 108.8, h: 43.5 }, hit: { x: 120, y: 234, w: 121, h: 52 } }],
      markers: [{ x: 106, y: 259 }]
    },
    {
      id: 'atmega328p',
      ref: 'ZU4',
      name: 'ATmega328P',
      what: 'Es el microcontrolador principal de Arduino. En esta tarjeta es un chip largo de 28 patas, colocado en un zócalo.',
      purpose: 'Ejecuta las instrucciones del programa y controla los pines.',
      kid: 'Es como el cerebro de Arduino. Sigue las instrucciones que escribimos para realizar diferentes tareas.',
      zones: [{ shape: { x: 265, y: 305, w: 353, h: 93 }, hit: { x: 262, y: 302, w: 359, h: 99 } }],
      markers: [{ x: 300, y: 352 }]
    },
    {
      id: 'resonador',
      ref: 'Y2',
      name: 'Resonador cerámico de 16 MHz',
      what: 'Es un componente pequeño, de tres terminales, que genera una señal de reloj.',
      purpose: 'Es el reloj del ATmega328P: marca 16 millones de pulsos por segundo. Gracias a él, el programa sabe cuánto dura una espera como delay(1000).',
      kid: 'Es el reloj del cerebro de Arduino. Ayuda a que cada instrucción ocurra en el momento correcto.',
      zones: [{ shape: { x: 379.6, y: 263.2, w: 26.7, h: 15.2 }, hit: { x: 364, y: 250, w: 58, h: 33 } }],
      markers: [{ x: 393, y: 238 }]
    },
    {
      id: 'reset',
      ref: 'RESET',
      name: 'Botón RESET',
      what: 'Es un pulsador ubicado en la esquina, junto al conector USB.',
      purpose: 'Reinicia el ATmega328P: el programa vuelve a empezar desde el principio. No borra el programa.',
      kid: 'Es como volver a empezar un juego desde el inicio, sin borrarlo.',
      note: 'Aquí el botón solo se explica. Podrás usarlo en la simulación más adelante.',
      zones: [{ shape: { x: 13, y: 9.5, w: 95, h: 56 }, hit: { x: 8, y: 4, w: 104, h: 66 } }],
      markers: [{ x: 114, y: 26 }]
    },
    {
      id: 'autoreset',
      ref: 'C5',
      name: 'Capacitor de auto-reset',
      what: 'Es un capacitor muy pequeño, de 100 nF, que une el ATmega16U2 con la línea RESET del ATmega328P.',
      purpose: 'Cuando la computadora empieza a cargar un programa, envía una señal que pasa por este capacitor y reinicia el ATmega328P. Así queda listo para recibir el programa nuevo.',
      kid: 'Es como si alguien presionara RESET por ti, justo cuando cargas un programa.',
      note: 'Mide apenas 1,6 mm. No lo confundas con las dos almohadillas que tiene justo debajo: son el puente RESET-EN, otra pieza distinta.',
      zones: [{ shape: { x: 258.4, y: 219.9, w: 15.2, h: 7.6 }, hit: { x: 244, y: 214, w: 44, h: 22 } }],
      markers: [{ x: 304, y: 223 }]
    },
    {
      id: 'icsp',
      ref: 'ICSP1 e ICSP',
      name: 'Conectores ICSP',
      what: 'Son dos conectores de 6 pines (2 × 3). Hay uno para cada microcontrolador.',
      purpose: 'Permiten programar un microcontrolador directamente con un programador externo, sin usar el USB.',
      kid: 'Son como una puerta de servicio: permiten llegar directo a cada microcontrolador.',
      zones: [
        { part: 'icsp16u2', shape: { x: 137.8, y: 43.5, w: 72.5, h: 48.4 }, hit: { x: 134, y: 40, w: 82, h: 52 } },
        { part: 'icsp328p', shape: { x: 593.6, y: 205.5, w: 48.4, h: 72.5 }, hit: { x: 588, y: 200, w: 60, h: 84 } }
      ],
      markers: [{ x: 228, y: 66 }, { x: 610, y: 190 }],
      parts: [
        {
          id: 'icsp328p',
          name: 'ICSP del ATmega328P',
          pill: { x: 618, y: 242, label: 'ICSP' },
          what: 'Es el conector de 6 pines del borde derecho de la tarjeta.',
          purpose: 'Sirve para programar directamente el ATmega328P. También da acceso a los pines SPI (CIPO, COPI y SCK), a 5 V, a GND y a RESET.',
          kid: 'Es la puerta de servicio del cerebro principal.'
        },
        {
          id: 'icsp16u2',
          name: 'ICSP del ATmega16U2',
          pill: { x: 174, y: 68, label: 'ICSP1' },
          what: 'Es el conector de 6 pines que está cerca del botón RESET y del ATmega16U2.',
          purpose: 'Sirve para programar directamente el ATmega16U2, por ejemplo, para actualizar su programa interno.',
          kid: 'Es la puerta de servicio del traductor USB.'
        }
      ]
    },
    {
      id: 'leds',
      ref: 'ON, RX, TX y L',
      name: 'LEDs ON, RX, TX y L',
      what: 'Son cuatro LEDs pequeños que vienen montados en la tarjeta.',
      purpose: 'Muestran información: si hay energía, si hay comunicación con la computadora y el estado del pin 13.',
      kid: 'Son como las luces del tablero de un auto: te avisan qué está pasando.',
      note: 'En esta sección los LEDs aparecen apagados. Los verás funcionar en la simulación.',
      zones: [
        { part: 'L', shape: { x: 253, y: 100.4, w: 26, h: 12 }, hit: { x: 244, y: 94, w: 44, h: 26 } },
        { part: 'TX', shape: { x: 253, y: 153.6, w: 26, h: 12 }, hit: { x: 244, y: 149, w: 44, h: 21 } },
        { part: 'RX', shape: { x: 253, y: 175.4, w: 26, h: 12 }, hit: { x: 244, y: 171, w: 44, h: 21 } },
        { part: 'ON', shape: { x: 543.2, y: 153.6, w: 26, h: 12 }, hit: { x: 532, y: 144, w: 48, h: 30 } }
      ],
      markers: [{ x: 230, y: 114 }, { x: 590, y: 158 }],
      parts: [
        {
          id: 'ON',
          name: 'LED ON',
          pill: { x: 556, y: 128, label: 'ON' },
          what: 'Es el LED verde de encendido.',
          purpose: 'Se enciende cuando la tarjeta recibe alimentación.',
          kid: 'Es la luz que te dice: «¡Estoy encendido!».'
        },
        {
          id: 'RX',
          name: 'LED RX',
          pill: { x: 322, y: 186, label: 'RX' },
          what: 'Es el LED de recepción de datos.',
          purpose: 'Parpadea cuando la tarjeta recibe datos de la computadora por USB.',
          kid: 'Se enciende cuando Arduino escucha a la computadora.'
        },
        {
          id: 'TX',
          name: 'LED TX',
          pill: { x: 322, y: 160, label: 'TX' },
          what: 'Es el LED de transmisión de datos.',
          purpose: 'Parpadea cuando la tarjeta envía datos a la computadora por USB.',
          kid: 'Se enciende cuando Arduino le habla a la computadora.'
        },
        {
          id: 'L',
          name: 'LED L',
          pill: { x: 322, y: 106, label: 'L' },
          what: 'Es un LED conectado al pin digital 13 (D13).',
          purpose: 'Se enciende cuando el programa pone el pin 13 en HIGH y se apaga con LOW.',
          kid: 'Es un LED que puedes controlar con tu programa sin conectar nada más.'
        }
      ]
    }
  ];

  /* ---------- Utilidades SVG ---------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  function clearEl(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
  }

  function findPart(component, partId) {
    if (!component || !component.parts || !partId) { return null; }
    for (var i = 0; i < component.parts.length; i++) {
      if (component.parts[i].id === partId) { return component.parts[i]; }
    }
    return null;
  }

  /* =========================================================
     BoardView: dibuja pines, zonas, marcadores y resaltado.
     Reutilizable en A3–A5 mediante los atributos data-pin y
     data-indicator del SVG.
     ========================================================= */
  var BoardView = {
    svg: null,
    zoneEls: [],
    markerEls: [],
    viewBox: null,

    init: function (onPick) {
      this.svg = document.getElementById('uno-board');
      if (!this.svg) { return false; }
      var vb = this.svg.getAttribute('viewBox').split(/\s+/).map(Number);
      this.viewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
      this.onPick = onPick;
      this.trackGestures();
      this.drawPins();
      this.drawZones();
      this.drawMarkers();
      return true;
    },

    /* Distingue un toque de un desplazamiento: si el usuario arrastró o el
       contenedor ampliado se desplazó, el clic resultante se ignora. */
    trackGestures: function () {
      var self = this;
      this.scrollEl = document.getElementById('board-scroll');
      this.gesture = null;
      this.svg.addEventListener('pointerdown', function (event) {
        self.gesture = {
          x: event.clientX,
          y: event.clientY,
          left: self.scrollEl ? self.scrollEl.scrollLeft : 0,
          top: self.scrollEl ? self.scrollEl.scrollTop : 0
        };
      });
    },

    isAccidental: function (event) {
      var g = this.gesture;
      this.gesture = null;
      if (!g) { return false; }
      var scrolled = this.scrollEl &&
        (Math.abs(this.scrollEl.scrollLeft - g.left) > 4 || Math.abs(this.scrollEl.scrollTop - g.top) > 4);
      var moved = Math.abs(event.clientX - g.x) > 10 || Math.abs(event.clientY - g.y) > 10;
      return scrolled || moved;
    },

    drawPins: function () {
      var headerLayer = document.getElementById('header-pins');
      BOARD.pins.forEach(function (pin) {
        headerLayer.appendChild(svgEl('rect', {
          x: pin.x - 5, y: pin.y - 5, width: 10, height: 10, rx: 1.5, 'data-pin': pin.id
        }));
        if (pin.label) {
          var top = pin.y < 250;
          var text = svgEl('text', {
            x: pin.x,
            y: top ? pin.y + 26 : pin.y - 18,
            'class': 'board__pin-label' + (pin.label.length > 3 ? ' board__pin-label--sm' : '')
          });
          text.textContent = pin.label;
          headerLayer.appendChild(text);
        }
      });

      var icspLayer = document.getElementById('icsp-pins');
      BOARD.icspPins.forEach(function (p) {
        icspLayer.appendChild(svgEl('rect', { x: p.x - 5, y: p.y - 5, width: 10, height: 10, rx: 1.5 }));
      });

      // 28 patas del ATmega328P (14 por fila).
      var dipLayer = document.getElementById('dip-pins');
      var dip = BOARD.dip;
      for (var k = 0; k < 14; k++) {
        var x = dip.firstX + dip.pitch * k;
        dip.rowsY.forEach(function (y) {
          dipLayer.appendChild(svgEl('rect', { x: x - 4.5, y: y - 4.5, width: 9, height: 9, rx: 1 }));
        });
      }
    },

    drawZones: function () {
      var self = this;
      var layer = document.getElementById('board-zones');

      COMPONENTS.forEach(function (comp, index) {
        var group = svgEl('g', {
          'class': 'zone',
          role: 'radio',
          'aria-checked': 'false',
          tabindex: index === 0 ? '0' : '-1',
          'aria-label': (index + 1) + '. ' + comp.name,
          'data-index': index
        });
        comp.zones.forEach(function (z) {
          var hit = svgEl('rect', {
            'class': 'zone__hit',
            x: z.hit.x, y: z.hit.y, width: z.hit.w, height: z.hit.h, rx: 6
          });
          if (z.part) { hit.setAttribute('data-part', z.part); }
          group.appendChild(hit);
        });
        layer.appendChild(group);
        self.zoneEls.push(group);
      });

      layer.addEventListener('click', function (event) {
        var hit = event.target.closest ? event.target.closest('.zone__hit') : null;
        if (!hit || self.isAccidental(event)) { return; }
        self.onPick(Number(hit.parentNode.getAttribute('data-index')), hit.getAttribute('data-part'), false);
      });

      layer.addEventListener('keydown', function (event) {
        var zone = event.target.closest ? event.target.closest('.zone') : null;
        if (!zone) { return; }
        var index = Number(zone.getAttribute('data-index'));
        var total = COMPONENTS.length;
        var next = null;
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            next = (index + 1) % total; break;
          case 'ArrowLeft':
          case 'ArrowUp':
            next = (index - 1 + total) % total; break;
          case 'Home':
            next = 0; break;
          case 'End':
            next = total - 1; break;
          case 'Enter':
          case ' ':
            next = index; break;
          default:
            return;
        }
        event.preventDefault();
        self.onPick(next, null, true);
      });
    },

    /* Números seleccionables: un toque elige el grupo completo. */
    drawMarkers: function () {
      var self = this;
      var layer = document.getElementById('board-markers');
      COMPONENTS.forEach(function (comp, index) {
        var group = [];
        comp.markers.forEach(function (m) {
          var marker = svgEl('g', { 'class': 'board__marker', 'data-index': index });
          marker.appendChild(svgEl('circle', { 'class': 'board__marker-hit', cx: m.x, cy: m.y, r: 18 }));
          marker.appendChild(svgEl('circle', { 'class': 'board__marker-dot', cx: m.x, cy: m.y, r: 12 }));
          var label = svgEl('text', { x: m.x, y: m.y });
          label.textContent = String(index + 1);
          marker.appendChild(label);
          layer.appendChild(marker);
          group.push(marker);
        });
        self.markerEls.push(group);
      });
      layer.addEventListener('click', function (event) {
        var marker = event.target.closest ? event.target.closest('.board__marker') : null;
        if (!marker || self.isAccidental(event)) { return; }
        self.onPick(Number(marker.getAttribute('data-index')), null, false);
      });

      document.getElementById('board-pills').addEventListener('click', function (event) {
        var pill = event.target.closest ? event.target.closest('.board__pill') : null;
        if (!pill || self.isAccidental(event)) { return; }
        self.onPick(Number(pill.getAttribute('data-index')), pill.getAttribute('data-part'), false);
      });
    },

    /* Etiquetas táctiles de las subpartes del grupo elegido. */
    drawPills: function (index, partId) {
      var layer = document.getElementById('board-pills');
      clearEl(layer);
      var comp = COMPONENTS[index];
      if (!comp || !comp.parts) { return; }
      comp.parts.forEach(function (part) {
        if (!part.pill) { return; }
        var w = Math.max(34, part.pill.label.length * 9 + 16);
        var pill = svgEl('g', {
          'class': 'board__pill' + (part.id === partId ? ' is-selected' : ''),
          'data-index': index,
          'data-part': part.id
        });
        pill.appendChild(svgEl('rect', { x: part.pill.x - w / 2, y: part.pill.y - 11, width: w, height: 22, rx: 11 }));
        var text = svgEl('text', { x: part.pill.x, y: part.pill.y });
        text.textContent = part.pill.label;
        pill.appendChild(text);
        layer.appendChild(pill);
      });
    },

    /* Actualiza zonas, marcadores, resaltado y atenuado. */
    render: function (index, partId) {
      this.zoneEls.forEach(function (zone, i) {
        var selected = i === index;
        zone.setAttribute('aria-checked', selected ? 'true' : 'false');
        var focusable = index === -1 ? i === 0 : selected;
        zone.setAttribute('tabindex', focusable ? '0' : '-1');
      });
      this.markerEls.forEach(function (group, i) {
        group.forEach(function (m) { m.classList.toggle('is-selected', i === index); });
      });
      this.drawPills(index, partId);

      var highlightLayer = document.getElementById('board-highlight');
      clearEl(highlightLayer);
      var dim = document.getElementById('board-dim');

      if (index === -1) {
        dim.setAttribute('d', '');
        this.svg.removeAttribute('data-selected');
        return;
      }

      var comp = COMPONENTS[index];
      var zones = comp.zones.filter(function (z) { return !partId || z.part === partId; });
      var vb = this.viewBox;
      var d = 'M' + vb.x + ' ' + vb.y + 'h' + vb.w + 'v' + vb.h + 'h' + (-vb.w) + 'Z';

      // El resaltado sigue la forma física (shape), no el área táctil.
      zones.forEach(function (z) {
        var s = z.shape;
        var pad = 5;
        d += 'M' + (s.x - pad) + ' ' + (s.y - pad) + 'h' + (s.w + 2 * pad) + 'v' + (s.h + 2 * pad) + 'h' + (-(s.w + 2 * pad)) + 'Z';
        highlightLayer.appendChild(svgEl('rect', {
          'class': 'board__hl board__hl--outer',
          x: s.x - 8, y: s.y - 8, width: s.w + 16, height: s.h + 16, rx: 9
        }));
        highlightLayer.appendChild(svgEl('rect', {
          'class': 'board__hl board__hl--inner',
          x: s.x - 3, y: s.y - 3, width: s.w + 6, height: s.h + 6, rx: 5
        }));
      });
      dim.setAttribute('d', d);
      this.svg.setAttribute('data-selected', comp.id);
    },

    focusZone: function (index) {
      if (this.zoneEls[index]) { this.zoneEls[index].focus(); }
    },

    setMarkersVisible: function (visible) {
      this.svg.setAttribute('data-show-markers', visible ? 'true' : 'false');
    }
  };

  /* =========================================================
     BoardZoom (A2.2): amplía la tarjeta dentro de un contenedor
     desplazable cuando se ve demasiado pequeña. Solo cambia el
     ancho dibujado del SVG; el viewBox y las coordenadas no cambian.
     ========================================================= */
  var BoardZoom = {
    MIN_WIDTH: 600,   // por debajo de este ancho se ofrece ampliar
    TARGET: 640,      // ancho aproximado deseado al ampliar
    zoomed: false,
    els: {},

    init: function () {
      var self = this;
      ['board-zoom-tools', 'board-zoom', 'board-zoom-label', 'board-scroll', 'board-hint'].forEach(function (id) {
        self.els[id] = document.getElementById(id);
      });
      if (!this.els['board-scroll'] || !this.els['board-zoom']) { return; }
      this.defaultHint = this.els['board-hint'].textContent;

      this.els['board-zoom'].addEventListener('click', function () {
        self.set(!self.zoomed);
      });

      var scheduled = false;
      var onResize = function () {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(function () {
          scheduled = false;
          self.update();
        });
      };
      if (window.ResizeObserver) {
        new window.ResizeObserver(onResize).observe(this.els['board-scroll']);
      }
      window.addEventListener('resize', onResize);
      this.update();
    },

    factor: function () {
      var width = this.els['board-scroll'].clientWidth || this.TARGET;
      return Math.min(2, Math.max(1.5, this.TARGET / width));
    },

    /* Muestra el botón solo cuando la tarjeta es pequeña. */
    update: function () {
      var width = this.els['board-scroll'].clientWidth;
      if (!width) { return; } // vista oculta: no hay medidas
      var small = width < this.MIN_WIDTH;
      this.els['board-zoom-tools'].hidden = !small;
      if (!small && this.zoomed) {
        this.set(false);
      } else if (this.zoomed) {
        this.apply();
      }
    },

    apply: function () {
      var f = this.factor();
      this.els['board-scroll'].style.setProperty('--board-zoom', f.toFixed(2));
      return f;
    },

    set: function (on) {
      var scroll = this.els['board-scroll'];
      this.zoomed = on;
      scroll.classList.toggle('is-zoomed', on);
      this.els['board-zoom'].classList.toggle('is-active', on);
      this.els['board-zoom-label'].textContent = on ? 'Vista normal' : 'Ampliar tarjeta';
      if (on) {
        var f = this.apply();
        this.els['board-hint'].textContent = 'Tarjeta ampliada ' + f.toFixed(1).replace('.', ',') +
          ' veces. Desliza dentro del recuadro para recorrerla.';
        // Se mide en el siguiente cuadro, cuando el nuevo ancho ya está aplicado.
        var self = this;
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () { self.reveal(true); });
        });
      } else {
        scroll.style.removeProperty('--board-zoom');
        scroll.scrollLeft = 0;
        scroll.scrollTop = 0;
        this.els['board-hint'].textContent = this.defaultHint;
      }
    },

    /* Desplaza el recuadro para mostrar el componente elegido si quedó fuera. */
    reveal: function (force) {
      if (!this.zoomed) { return; }
      var scroll = this.els['board-scroll'];
      var target = document.querySelector('#board-highlight .board__hl--outer');
      if (!target) {
        if (force) { scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2; }
        return;
      }
      var r = target.getBoundingClientRect();
      var c = scroll.getBoundingClientRect();
      var visible = r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom;
      if (visible && !force) { return; }
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      scroll.scrollTo({
        left: scroll.scrollLeft + (r.left - c.left) - (c.width - r.width) / 2,
        top: scroll.scrollTop + (r.top - c.top) - (c.height - r.height) / 2,
        behavior: reduce ? 'auto' : 'smooth'
      });
    }
  };

  /* =========================================================
     Explorer: panel informativo, lista y controles (A2).
     ========================================================= */
  var Explorer = {
    els: {},
    listButtons: [],
    renderedPartsFor: null,

    init: function () {
      var ids = ['info-status', 'info-group', 'info-name', 'info-empty', 'info-body', 'info-what',
        'info-purpose', 'info-kid', 'info-note', 'info-parts', 'info-part-buttons', 'explore-prev',
        'explore-next', 'explore-counter-num', 'explore-toggle-list', 'explore-markers', 'component-list'];
      var self = this;
      ids.forEach(function (id) { self.els[id] = document.getElementById(id); });

      if (!BoardView.init(function (index, partId, focus) { self.select(index, partId, focus); })) {
        return;
      }
      this.buildList();

      this.els['explore-prev'].addEventListener('click', function () { self.step(-1); });
      this.els['explore-next'].addEventListener('click', function () { self.step(1); });

      this.els['explore-toggle-list'].addEventListener('click', function () {
        var list = self.els['component-list'];
        list.hidden = !list.hidden;
        this.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
        this.textContent = list.hidden ? 'Ver todos' : 'Ocultar lista';
      });

      this.els['explore-markers'].addEventListener('change', function () {
        BoardView.setMarkersVisible(this.checked);
      });

      this.els['info-part-buttons'].addEventListener('click', function (event) {
        var button = event.target.closest('button');
        if (!button) { return; }
        self.select(state.explorer.index, button.getAttribute('data-part') || null, false);
      });

      this.render();
    },

    buildList: function () {
      var self = this;
      var list = this.els['component-list'];
      COMPONENTS.forEach(function (comp, index) {
        var item = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.setAttribute('aria-pressed', 'false');
        var num = document.createElement('span');
        num.className = 'chip__num';
        num.setAttribute('aria-hidden', 'true');
        num.textContent = String(index + 1);
        var label = document.createElement('span');
        label.textContent = comp.name;
        button.appendChild(num);
        button.appendChild(label);
        button.addEventListener('click', function () { self.select(index, null, false); });
        item.appendChild(button);
        list.appendChild(item);
        self.listButtons.push(button);
      });
    },

    step: function (delta) {
      var total = COMPONENTS.length;
      var current = state.explorer.index;
      var next;
      if (current === -1) {
        next = delta > 0 ? 0 : total - 1;
      } else {
        next = (current + delta + total) % total;
      }
      this.select(next, null, false);
    },

    select: function (index, partId, focusZone) {
      var comp = COMPONENTS[index];
      if (!comp) { return; }
      state.explorer.index = index;
      state.explorer.partId = findPart(comp, partId) ? partId : null;
      this.render();
      if (focusZone) { BoardView.focusZone(index); }
    },

    render: function () {
      var index = state.explorer.index;
      var comp = COMPONENTS[index];
      var part = findPart(comp, state.explorer.partId);
      var info = part || comp;
      var els = this.els;

      BoardView.render(index, part ? part.id : null);

      els['explore-counter-num'].textContent = comp ? String(index + 1) : '–';
      this.listButtons.forEach(function (button, i) {
        button.setAttribute('aria-pressed', i === index ? 'true' : 'false');
      });

      if (!comp) {
        els['info-body'].hidden = true;
        els['info-empty'].hidden = false;
        els['info-parts'].hidden = true;
        return;
      }

      var groupText = 'Grupo ' + (index + 1) + ' de ' + COMPONENTS.length;
      els['info-group'].textContent = part ? groupText + ': ' + comp.name : groupText;
      els['info-name'].textContent = info.name;
      els['info-what'].textContent = info.what;
      els['info-purpose'].textContent = info.purpose;
      els['info-kid'].textContent = info.kid;
      var note = info.note || comp.note || '';
      els['info-note'].textContent = note;
      els['info-note'].hidden = !note;
      els['info-empty'].hidden = true;
      els['info-body'].hidden = false;

      this.renderParts(comp, part);
      BoardZoom.reveal(false);
      els['info-status'].textContent = info.name + '. ' + groupText + '.';
    },

    renderParts: function (comp, part) {
      var box = this.els['info-parts'];
      var container = this.els['info-part-buttons'];
      if (!comp.parts) {
        box.hidden = true;
        this.renderedPartsFor = null;
        return;
      }
      if (this.renderedPartsFor !== comp.id) {
        while (container.firstChild) { container.removeChild(container.firstChild); }
        var options = [{ id: '', name: 'Todo el grupo' }].concat(comp.parts);
        options.forEach(function (option) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'chip';
          button.setAttribute('data-part', option.id);
          var check = document.createElement('span');
          check.className = 'chip__check';
          check.setAttribute('aria-hidden', 'true');
          var label = document.createElement('span');
          label.textContent = option.name;
          button.appendChild(check);
          button.appendChild(label);
          container.appendChild(button);
        });
        this.renderedPartsFor = comp.id;
      }
      var activeId = part ? part.id : '';
      Array.prototype.forEach.call(container.children, function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-part') === activeId ? 'true' : 'false');
      });
      box.hidden = false;
    }
  };

  /* =========================================================
     A3: LEDs externos virtuales
     Fuente de verdad: state.leds. Todas las vistas se dibujan
     a partir de ese estado (Circuit.onChange).
     ========================================================= */
  var LED_COLORS = {
    rojo: { name: 'Rojo', fill: '#E5484D', dark: '#A8282C' },
    verde: { name: 'Verde', fill: '#30A46C', dark: '#1D6B45' },
    amarillo: { name: 'Amarillo', fill: '#F4B942', dark: '#946500' },
    azul: { name: 'Azul', fill: '#1769AA', dark: '#0E4472' }
  };
  var LED_LIMIT = 3;
  var LED_RESISTOR_OHMS = 220;
  var LED_GROUND_PIN = 'GND_D'; // GND del conector digital, junto a D13

  function findPin(id) {
    for (var i = 0; i < BOARD.pins.length; i++) {
      if (BOARD.pins[i].id === id) { return BOARD.pins[i]; }
    }
    return null;
  }

  function digitalPins() {
    return BOARD.pins.filter(function (pin) { return pin.digital; }).sort(function (a, b) {
      return a.number - b.number;
    });
  }

  function copyLed(led) {
    return {
      id: led.id, color: led.color, pin: led.pin,
      resistorOhms: led.resistorOhms, groundPin: led.groundPin, on: led.on
    };
  }

  /* ---------- Modelo de conexiones ---------- */
  var Circuit = {
    listeners: [],

    onChange: function (listener) {
      this.listeners.push(listener);
    },

    notify: function () {
      var leds = this.getLeds();
      this.listeners.forEach(function (listener) { listener(leds); });
    },

    /* Copia de los LEDs conectados, para consultar desde cualquier sección. */
    getLeds: function () {
      return state.leds.map(copyLed);
    },

    ledOnPin: function (pinId) {
      for (var i = 0; i < state.leds.length; i++) {
        if (state.leds[i].pin === pinId) { return copyLed(state.leds[i]); }
      }
      return null;
    },

    /* Posición actual del LED en la colección (0, 1, 2…) o -1 si ya no está. */
    indexOf: function (id) {
      for (var i = 0; i < state.leds.length; i++) {
        if (state.leds[i].id === id) { return i; }
      }
      return -1;
    },

    /* Etiqueta visible: se calcula por posición, no a partir del id interno.
       Un LED con id "led-7" puede mostrarse como «LED 2». Para un LED ya
       eliminado se usa la etiqueta que tenía antes de quitarlo (led.label). */
    label: function (led) {
      var index = this.indexOf(led.id);
      return index === -1 ? (led.label || 'LED') : 'LED ' + (index + 1);
    },

    add: function (color, pinId) {
      if (state.leds.length >= LED_LIMIT) {
        return { ok: false, field: null, message: 'Ya conectaste tres LEDs. Quita uno para agregar otro.' };
      }
      if (!LED_COLORS[color]) {
        return { ok: false, field: 'color', message: 'Primero selecciona el color de tu LED.' };
      }
      var pin = findPin(pinId);
      if (!pin || !pin.digital) {
        return { ok: false, field: 'pin', message: 'Selecciona el pin digital donde conectarás tu LED.' };
      }
      if (this.ledOnPin(pinId)) {
        return { ok: false, field: 'pin', message: 'Ese pin ya tiene un LED conectado. Elige otro.' };
      }
      state.ledSeq += 1;
      var led = {
        id: 'led-' + state.ledSeq,
        color: color,
        pin: pinId,
        resistorOhms: LED_RESISTOR_OHMS,
        groundPin: LED_GROUND_PIN,
        on: false // se usará en la simulación (A5)
      };
      state.leds.push(led);
      this.notify();
      return {
        ok: true,
        led: copyLed(led),
        message: '¡Muy bien! Conectaste un LED ' + LED_COLORS[color].name.toLowerCase() + ' al pin ' + pinId +
          '. Tu LED está conectado correctamente y está listo para programarse.'
      };
    },

    remove: function (id) {
      for (var i = 0; i < state.leds.length; i++) {
        if (state.leds[i].id === id) {
          var label = this.label(state.leds[i]); // número visible antes de quitarlo
          var removed = copyLed(state.leds.splice(i, 1)[0]);
          removed.label = label;
          this.notify();
          return removed;
        }
      }
      return null;
    }
  };

  /* ---------- Vista Conecta: formulario y lista ---------- */
  var ConnectView = {
    els: {},

    init: function () {
      var self = this;
      ['connect-form', 'color-options', 'pin-select', 'connect-feedback', 'connection-list', 'led-count', 'connect-button']
        .forEach(function (id) { self.els[id] = document.getElementById(id); });
      if (!this.els['connect-form']) { return; }

      this.buildColors();
      this.els['connect-form'].addEventListener('submit', function (event) {
        event.preventDefault();
        self.connect();
      });
      this.els['connection-list'].addEventListener('click', function (event) {
        var button = event.target.closest('[data-remove]');
        if (button) { self.removeLed(button.getAttribute('data-remove')); }
      });
      Circuit.onChange(function (leds) { self.render(leds); });
      this.render(Circuit.getLeds());
    },

    buildColors: function () {
      var box = this.els['color-options'];
      Object.keys(LED_COLORS).forEach(function (key) {
        var label = document.createElement('label');
        label.className = 'swatch';
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'led-color';
        input.value = key;
        var dot = document.createElement('span');
        dot.className = 'swatch__dot swatch__dot--' + key;
        dot.setAttribute('aria-hidden', 'true');
        var name = document.createElement('span');
        name.className = 'swatch__name';
        name.textContent = LED_COLORS[key].name;
        var check = document.createElement('span');
        check.className = 'swatch__check';
        check.setAttribute('aria-hidden', 'true');
        label.appendChild(input);
        label.appendChild(dot);
        label.appendChild(name);
        label.appendChild(check);
        box.appendChild(label);
      });
    },

    selectedColor: function () {
      var checked = this.els['connect-form'].querySelector('input[name="led-color"]:checked');
      return checked ? checked.value : '';
    },

    showFeedback: function (message, type) {
      var box = this.els['connect-feedback'];
      box.textContent = message;
      box.className = 'feedback feedback--' + type;
    },

    connect: function () {
      var result = Circuit.add(this.selectedColor(), this.els['pin-select'].value);
      this.showFeedback(result.message, result.ok ? 'ok' : 'error');
      if (result.ok) {
        this.els['pin-select'].value = '';
      } else if (result.field === 'color') {
        this.els['connect-form'].querySelector('input[name="led-color"]').focus();
      } else if (result.field === 'pin') {
        this.els['pin-select'].focus();
      }
    },

    removeLed: function (id) {
      var removed = Circuit.remove(id);
      if (!removed) { return; }
      this.showFeedback('Quitaste el ' + Circuit.label(removed) + '. El pin ' + removed.pin + ' quedó libre.', 'info');
      var next = this.els['connection-list'].querySelector('[data-remove]');
      (next || this.els['connect-button']).focus();
    },

    render: function (leds) {
      this.els['led-count'].textContent = leds.length + ' de ' + LED_LIMIT + ' LEDs';
      this.renderPinOptions(leds);
      this.renderList(leds);
    },

    /* Indica qué pines están ocupados sin quitarlos de la lista. */
    renderPinOptions: function (leds) {
      Array.prototype.forEach.call(this.els['pin-select'].options, function (option) {
        if (!option.value) { return; }
        var used = null;
        leds.forEach(function (led) { if (led.pin === option.value) { used = led; } });
        option.textContent = used ? option.value + ' (ocupado: ' + Circuit.label(used) + ')' : option.value;
      });
    },

    renderList: function (leds) {
      var list = this.els['connection-list'];
      clearEl(list);
      if (!leds.length) {
        var empty = document.createElement('li');
        empty.className = 'connection connection--empty';
        empty.textContent = 'Todavía no hay LEDs conectados. Elige un color y un pin.';
        list.appendChild(empty);
        return;
      }
      leds.forEach(function (led) {
        var color = LED_COLORS[led.color];
        var item = document.createElement('li');
        item.className = 'connection connection--led';
        item.setAttribute('data-led', led.id);
        item.style.setProperty('--led-color', color.fill);

        var head = document.createElement('p');
        head.className = 'connection__head';
        var dot = document.createElement('span');
        dot.className = 'connection__dot';
        dot.setAttribute('aria-hidden', 'true');
        var name = document.createElement('strong');
        name.textContent = Circuit.label(led);
        var colorName = document.createElement('span');
        colorName.textContent = color.name;
        var status = document.createElement('span');
        status.className = 'connection__status';
        status.textContent = led.on ? 'Encendido' : 'Apagado';
        head.appendChild(dot);
        head.appendChild(name);
        head.appendChild(colorName);
        head.appendChild(status);

        var path = document.createElement('p');
        path.className = 'connection__path';
        ['Pin ' + led.pin, 'Resistencia ' + led.resistorOhms + ' Ω', 'Ánodo (+)', 'Cátodo (−)', 'GND'].forEach(function (text, i) {
          if (i > 0) {
            var arrow = document.createElement('span');
            arrow.className = 'connection__arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = '→';
            path.appendChild(arrow);
          }
          var part = document.createElement('span');
          part.className = 'connection__part';
          part.textContent = text;
          path.appendChild(part);
        });

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn--ghost btn--remove';
        remove.setAttribute('data-remove', led.id);
        remove.setAttribute('aria-label', 'Quitar ' + Circuit.label(led) + ', ' + color.name.toLowerCase() + ', pin ' + led.pin);
        remove.textContent = 'Quitar LED';

        item.appendChild(head);
        item.appendChild(path);
        item.appendChild(remove);
        list.appendChild(item);
      });
    }
  };

  /* ---------- Esquema del circuito (SVG simplificado) ---------- */
  var CircuitView = {
    Y: { rail: 60, cathode: 166, led: 185, anode: 204, resTop: 232, resBottom: 290, header: 334 },
    pinX: {},
    pinEls: {},

    init: function () {
      this.svg = document.getElementById('circuit-svg');
      if (!this.svg) { return; }
      this.ledsLayer = document.getElementById('circuit-leds');
      this.desc = document.getElementById('circuit-svg-desc');
      this.drawBoard();
      var self = this;
      Circuit.onChange(function (leds) { self.render(leds); });
      this.render(Circuit.getLeds());
    },

    /* GND, D13 … D2 en el mismo orden que el conector real (con su separación entre D8 y D7). */
    headerPins: function () {
      var start = BOARD.pins.indexOf(findPin(LED_GROUND_PIN));
      var end = BOARD.pins.indexOf(findPin('D2'));
      return BOARD.pins.slice(start, end + 1);
    },

    drawBoard: function () {
      var self = this;
      var layer = document.getElementById('circuit-board');
      var pins = this.headerPins();
      pins.forEach(function (pin, i) {
        self.pinX[pin.id] = 50 + i * 46 + (i >= 7 ? 16 : 0);
      });
      var first = this.pinX[pins[0].id];
      var lastA = this.pinX['D8'];
      var firstB = this.pinX['D7'];
      var last = this.pinX[pins[pins.length - 1].id];

      layer.appendChild(svgEl('rect', { 'class': 'circuit__pcb', x: 14, y: 318, width: 652, height: 96, rx: 12 }));
      layer.appendChild(svgEl('rect', { 'class': 'circuit__header', x: first - 19, y: 322, width: lastA - first + 38, height: 24, rx: 3 }));
      layer.appendChild(svgEl('rect', { 'class': 'circuit__header', x: firstB - 19, y: 322, width: last - firstB + 38, height: 24, rx: 3 }));
      pins.forEach(function (pin) {
        var x = self.pinX[pin.id];
        var rect = svgEl('rect', { 'class': 'circuit__pin', x: x - 6, y: self.Y.header - 6, width: 12, height: 12, rx: 2, 'data-circuit-pin': pin.id });
        layer.appendChild(rect);
        self.pinEls[pin.id] = rect;
        var label = svgEl('text', { 'class': 'circuit__pin-label', x: x, y: 366 });
        label.textContent = pin.ground ? 'GND' : pin.id;
        layer.appendChild(label);
      });
      var title = svgEl('text', { 'class': 'circuit__board-label', x: 340, y: 402 });
      title.textContent = 'Arduino Uno: conector digital';
      layer.appendChild(title);
    },

    render: function (leds) {
      var self = this;
      var Y = this.Y;
      clearEl(this.ledsLayer);
      Object.keys(this.pinEls).forEach(function (id) {
        self.pinEls[id].removeAttribute('style');
        self.pinEls[id].classList.remove('is-used');
      });
      this.svg.classList.toggle('has-leds', leds.length > 0);

      if (!leds.length) {
        this.desc.textContent = 'Todavía no hay LEDs conectados.';
        return;
      }

      // Línea común de GND: une todos los cátodos con el pin GND.
      var gx = this.pinX[LED_GROUND_PIN];
      var maxX = gx;
      leds.forEach(function (led) { maxX = Math.max(maxX, self.pinX[led.pin]); });
      var ground = svgEl('g', { 'class': 'circuit__ground' });
      ground.appendChild(svgEl('path', { 'class': 'circuit__wire circuit__wire--gnd', d: 'M' + maxX + ' ' + Y.rail + 'H' + gx + 'V' + (Y.header - 6) }));
      var gLabel = svgEl('text', { 'class': 'circuit__label circuit__label--gnd', x: gx + 10, y: Y.rail - 10 });
      gLabel.textContent = 'GND';
      ground.appendChild(gLabel);
      this.ledsLayer.appendChild(ground);
      this.pinEls[LED_GROUND_PIN].classList.add('is-used');

      var parts = [];
      leds.forEach(function (led) {
        var x = self.pinX[led.pin];
        var color = LED_COLORS[led.color];
        var g = svgEl('g', { 'class': 'circuit__led' + (led.on ? ' is-on' : ' is-off'), 'data-led': led.id });
        g.style.setProperty('--led-fill', color.fill);
        g.style.setProperty('--led-dark', color.dark);

        // Pin → resistencia
        g.appendChild(svgEl('line', { 'class': 'circuit__wire circuit__wire--signal', x1: x, y1: Y.header - 6, x2: x, y2: Y.resBottom }));
        // Resistencia de 220 Ω (bandas rojo, rojo, café y dorado)
        g.appendChild(svgEl('rect', { 'class': 'circuit__resistor', x: x - 8, y: Y.resTop, width: 16, height: Y.resBottom - Y.resTop, rx: 5 }));
        [['#C62828', 242], ['#C62828', 252], ['#6D4C2F', 262], ['#C9A227', 276]].forEach(function (band) {
          g.appendChild(svgEl('rect', { x: x - 8, y: band[1], width: 16, height: 5, fill: band[0] }));
        });
        var rLabel = svgEl('text', {
          'class': 'circuit__label circuit__label--res',
          x: x - 15, y: (Y.resTop + Y.resBottom) / 2,
          transform: 'rotate(-90 ' + (x - 15) + ' ' + ((Y.resTop + Y.resBottom) / 2) + ')'
        });
        rLabel.textContent = led.resistorOhms + ' Ω';
        g.appendChild(rLabel);
        // Resistencia → ánodo
        g.appendChild(svgEl('line', { 'class': 'circuit__wire circuit__wire--signal', x1: x, y1: Y.resTop, x2: x, y2: Y.anode }));
        // LED (ánodo + abajo, cátodo − arriba)
        g.appendChild(svgEl('circle', { 'class': 'circuit__bulb', cx: x, cy: Y.led, r: 19 }));
        g.appendChild(svgEl('line', { 'class': 'circuit__flat', x1: x - 11, y1: Y.cathode + 4, x2: x + 11, y2: Y.cathode + 4 }));
        var minus = svgEl('text', { 'class': 'circuit__sign', x: x, y: Y.led - 6 });
        minus.textContent = '−';
        var plus = svgEl('text', { 'class': 'circuit__sign', x: x, y: Y.led + 9 });
        plus.textContent = '+';
        g.appendChild(minus);
        g.appendChild(plus);
        // Cátodo → GND
        g.appendChild(svgEl('line', { 'class': 'circuit__wire circuit__wire--gnd', x1: x, y1: Y.cathode, x2: x, y2: Y.rail }));
        g.appendChild(svgEl('circle', { 'class': 'circuit__junction', cx: x, cy: Y.rail, r: 5 }));
        // Etiqueta del LED bajo su pin
        var tag = svgEl('text', { 'class': 'circuit__tag', x: x, y: 384 });
        tag.textContent = Circuit.label(led).replace('LED ', 'LED ');
        g.appendChild(tag);

        self.ledsLayer.appendChild(g);
        var pinEl = self.pinEls[led.pin];
        pinEl.classList.add('is-used');
        pinEl.style.fill = color.fill;
        parts.push(Circuit.label(led) + ' ' + color.name.toLowerCase() + ': pin ' + led.pin +
          ', resistencia de ' + led.resistorOhms + ' ohmios, ánodo, cátodo y GND. Apagado.');
      });
      this.desc.textContent = parts.join(' ');
    }
  };

  /* ---------- Programa: panel de LEDs conectados (solo consulta) ---------- */
  var ProgramLedsView = {
    init: function () {
      this.list = document.getElementById('program-leds');
      this.empty = document.getElementById('program-leds-empty');
      if (!this.list) { return; }
      var self = this;
      Circuit.onChange(function (leds) { self.render(leds); });
      this.render(Circuit.getLeds());
    },

    render: function (leds) {
      var list = this.list;
      clearEl(list);
      this.empty.hidden = leds.length > 0;
      leds.forEach(function (led) {
        var color = LED_COLORS[led.color];
        var item = document.createElement('li');
        item.className = 'led-slot';
        item.style.setProperty('--led-color', color.fill);
        var bulb = document.createElement('span');
        bulb.className = 'led-slot__bulb' + (led.on ? ' is-on' : '');
        bulb.setAttribute('aria-hidden', 'true');
        var name = document.createElement('strong');
        name.textContent = Circuit.label(led);
        var detail = document.createElement('span');
        detail.textContent = color.name + ', pin ' + led.pin;
        var status = document.createElement('span');
        status.className = 'led-slot__state';
        status.textContent = led.on ? 'Encendido' : 'Apagado';
        item.appendChild(bulb);
        item.appendChild(name);
        item.appendChild(detail);
        item.appendChild(status);
        list.appendChild(item);
      });
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
    digitalPins().forEach(function (pin) {
      var option = document.createElement('option');
      option.value = pin.id;
      option.textContent = pin.id;
      select.appendChild(option);
    });
  }

  /* ---------- Inicio ---------- */
  function init() {
    renderDemoCode();
    renderPinOptions();
    Explorer.init();
    BoardZoom.init();
    ConnectView.init();
    CircuitView.init();
    ProgramLedsView.init();
    Router.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
