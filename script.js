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
    ledSeq: 0,       // contador para identificadores únicos (no se reutilizan)
    // A4: programa del estudiante y su último análisis.
    program: {
      code: '',           // texto del editor
      analysis: null,     // resultado de ArduinoParser.parse (+ pinInfo)
      analyzedCode: null, // código que produjo ese análisis
      stale: false        // false | 'code' | 'connections': el análisis ya no es vigente
    },
    // A5: simulación. pins: estado lógico de D2–D13 ('HIGH' | 'LOW').
    sim: {
      status: 'idle',     // 'idle' | 'running' | 'stopped'
      pins: {},
      program: null,      // copia de las acciones analizadas que se están ejecutando
      cursor: null,
      current: null,      // instrucción en curso (línea y acción)
      loops: 0,
      message: null,
      notes: [],
      notedPins: {}
    },
    // A5: indicadores de la tarjeta. ON: la tarjeta virtual está alimentada.
    board: { ON: true, L: false, RX: false, TX: false },
    // A5: modo de trabajo en Programa.
    ui: { mode: 'guided', guideStep: 0 }
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
      note: 'El LED ON está encendido porque la tarjeta virtual tiene energía. L, RX y TX se activan cuando ejecutas un programa en «Programa tus LEDs».',
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

    stateListeners: [],

    /* A5: avisos de encendido/apagado (no cambian las conexiones). */
    onLedState: function (listener) {
      this.stateListeners.push(listener);
    },

    /* A5: el estado lógico del pin decide si su LED se enciende. Se busca por pin,
       nunca por la posición ni por el número visible del LED. */
    applyPin: function (pinId, high) {
      var changed = false;
      state.leds.forEach(function (led) {
        if (led.pin === pinId && led.on !== high) {
          led.on = high;
          changed = true;
        }
      });
      if (changed) {
        var leds = this.getLeds();
        this.stateListeners.forEach(function (listener) { listener(leds); });
      }
    },

    /* Devuelve el error que impediría agregar el LED, o null si se puede agregar. */
    check: function (color, pinId) {
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
      return null;
    },

    add: function (color, pinId) {
      var problem = this.check(color, pinId);
      if (problem) { return problem; }
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
      Circuit.onLedState(function (leds) { self.renderStates(leds); });
      this.render(Circuit.getLeds());
    },

    /* A5: solo actualiza «Encendido/Apagado», sin reconstruir la lista. */
    renderStates: function (leds) {
      var list = this.els['connection-list'];
      leds.forEach(function (led) {
        var item = list.querySelector('[data-led="' + led.id + '"]');
        if (!item) { return; }
        item.classList.toggle('is-on', led.on);
        item.querySelector('.connection__status').textContent = led.on ? 'Encendido' : 'Apagado';
      });
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
      var color = this.selectedColor();
      var pin = this.els['pin-select'].value;
      var stopped = false;
      if (!Circuit.check(color, pin) && Simulator.isRunning()) {
        Simulator.stop('connections'); // primero se detiene, después cambia el circuito
        stopped = true;
      }
      var result = Circuit.add(color, pin);
      this.showFeedback((stopped ? 'Detuvimos la simulación para cambiar el circuito. ' : '') + result.message, result.ok ? 'ok' : 'error');
      if (result.ok) {
        this.els['pin-select'].value = '';
      } else if (result.field === 'color') {
        this.els['connect-form'].querySelector('input[name="led-color"]').focus();
      } else if (result.field === 'pin') {
        this.els['pin-select'].focus();
      }
    },

    removeLed: function (id) {
      var stopped = false;
      if (Circuit.indexOf(id) !== -1 && Simulator.isRunning()) {
        Simulator.stop('connections'); // primero se detiene, después cambia el circuito
        stopped = true;
      }
      var removed = Circuit.remove(id);
      if (!removed) { return; }
      this.showFeedback((stopped ? 'Detuvimos la simulación para cambiar el circuito. ' : '') +
        'Quitaste el ' + Circuit.label(removed) + '. El pin ' + removed.pin + ' quedó libre.', 'info');
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
      Circuit.onLedState(function (leds) { self.renderStates(leds); });
      this.render(Circuit.getLeds());
    },

    /* A5: enciende o apaga los LEDs del esquema sin redibujar los cables. */
    renderStates: function (leds) {
      var layer = this.ledsLayer;
      leds.forEach(function (led) {
        var g = layer.querySelector('[data-led="' + led.id + '"]');
        if (!g) { return; }
        g.classList.toggle('is-on', led.on);
        g.classList.toggle('is-off', !led.on);
      });
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
      Circuit.onLedState(function (leds) { self.renderStates(leds); });
      this.render(Circuit.getLeds());
    },

    renderStates: function (leds) {
      var list = this.list;
      leds.forEach(function (led) {
        var item = list.querySelector('[data-led="' + led.id + '"]');
        if (!item) { return; }
        item.classList.toggle('is-on', led.on);
        item.querySelector('.led-slot__bulb').classList.toggle('is-on', led.on);
        item.querySelector('.led-slot__state').textContent = led.on ? 'Encendido' : 'Apagado';
      });
    },

    render: function (leds) {
      var list = this.list;
      clearEl(list);
      this.empty.hidden = leds.length > 0;
      leds.forEach(function (led) {
        var color = LED_COLORS[led.color];
        var item = document.createElement('li');
        item.className = 'led-slot' + (led.on ? ' is-on' : '');
        item.setAttribute('data-led', led.id);
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

  /* =========================================================
     A4: analizador del lenguaje Arduino simplificado.
     Función pura: recibe texto y devuelve un resultado. No evalúa
     código dinámicamente ni usa el DOM: nunca ejecuta el texto del estudiante.
     Lenguaje admitido:
       void setup() { ... }   void loop() { ... }
       pinMode(pin, OUTPUT);  digitalWrite(pin, HIGH | LOW);  delay(ms);
       Comentarios con //. Pines enteros 2–13. delay entero 0–60000.
     ========================================================= */
  var ArduinoParser = (function () {
    var LIMITS = { chars: 3000, lines: 150, maxDelay: 60000, minPin: 2, maxPin: 13 };

    var INSTRUCTIONS = {
      pinMode: { args: 2, usage: 'pinMode(8, OUTPUT);' },
      digitalWrite: { args: 2, usage: 'digitalWrite(8, HIGH);' },
      delay: { args: 1, usage: 'delay(1000);' }
    };

    // Estructuras de C++ que este simulador todavía no admite.
    var UNSUPPORTED_BLOCKS = ['for', 'if', 'else', 'while', 'do', 'switch', 'int', 'long', 'float', 'bool',
      'boolean', 'byte', 'char', 'const', 'return', 'unsigned', 'String', 'define', 'include'];

    // Para detectar errores de mayúsculas: "digitalwrite" → "digitalWrite".
    var BY_LOWERCASE = {};
    ['pinMode', 'digitalWrite', 'delay', 'setup', 'loop', 'void'].forEach(function (word) {
      BY_LOWERCASE[word.toLowerCase()] = word;
    });

    function distance(a, b) {
      var row = [];
      for (var j = 0; j <= b.length; j++) { row.push(j); }
      for (var i = 1; i <= a.length; i++) {
        var prev = row[0];
        row[0] = i;
        for (var k = 1; k <= b.length; k++) {
          var temp = row[k];
          row[k] = Math.min(row[k] + 1, row[k - 1] + 1, prev + (a[i - 1] === b[k - 1] ? 0 : 1));
          prev = temp;
        }
      }
      return row[b.length];
    }

    function looksLike(word, target, maxDistance) {
      var upper = word.toUpperCase();
      return upper === target || distance(upper, target) <= maxDistance;
    }

    /* ---------- Tokenizador ---------- */
    function tokenize(code, report) {
      var tokens = [];
      var line = 1;
      var i = 0;
      var n = code.length;
      var badLines = {};
      while (i < n) {
        var ch = code.charAt(i);
        if (ch === '\n') { line += 1; i += 1; continue; }
        if (ch === ' ' || ch === '\t' || ch === '\r') { i += 1; continue; }
        if (ch === '/' && code.charAt(i + 1) === '/') {
          while (i < n && code.charAt(i) !== '\n') { i += 1; }
          continue;
        }
        if (ch === '/' && code.charAt(i + 1) === '*') {
          report.error(line, 'en este simulador los comentarios se escriben con // al inicio.');
          var end = code.indexOf('*/', i + 2);
          var stop = end === -1 ? n : end + 2;
          for (; i < stop; i++) { if (code.charAt(i) === '\n') { line += 1; } }
          continue;
        }
        var start = i;
        if (/[A-Za-z_]/.test(ch)) {
          while (i < n && /[A-Za-z0-9_]/.test(code.charAt(i))) { i += 1; }
          tokens.push({ type: 'ident', value: code.slice(start, i), line: line });
          continue;
        }
        if (/[0-9]/.test(ch)) {
          while (i < n && /[0-9.]/.test(code.charAt(i))) { i += 1; }
          tokens.push({ type: 'number', value: code.slice(start, i), line: line });
          continue;
        }
        if ('(){};,-'.indexOf(ch) !== -1) {
          tokens.push({ type: ch, value: ch, line: line });
          i += 1;
          continue;
        }
        if (!badLines[line]) {
          badLines[line] = true;
          report.error(line, 'el símbolo «' + ch + '» no forma parte del lenguaje del simulador.');
        }
        i += 1;
      }
      tokens.push({ type: 'eof', value: 'fin del programa', line: line });
      return tokens;
    }

    /* ---------- Analizador sintáctico (descenso recursivo) ---------- */
    function Parser(tokens, report) {
      this.tokens = tokens;
      this.pos = 0;
      this.report = report;
      this.functions = {};
    }

    Parser.prototype.peek = function (offset) {
      var index = Math.min(this.pos + (offset || 0), this.tokens.length - 1);
      return this.tokens[index];
    };

    Parser.prototype.next = function () {
      var token = this.peek();
      if (this.pos < this.tokens.length - 1) { this.pos += 1; }
      return token;
    };

    /* Salta hasta terminar la instrucción actual (; consumido) sin salir del bloque. */
    Parser.prototype.skipStatement = function (line) {
      while (true) {
        var t = this.peek();
        if (t.type === 'eof' || t.type === '}' || t.type === '{') { return; }
        if (t.type === ';') { this.next(); return; }
        if (t.line !== line && t.type === 'ident') { return; }
        this.next();
      }
    };

    /* Salta una estructura no admitida (for, if, int x = …) con sus paréntesis
       y su bloque { } balanceados, para no generar errores en cadena. */
    Parser.prototype.skipBlock = function (line) {
      var depthParen = 0;
      while (true) {
        var t = this.peek();
        if (t.type === 'eof') { return; }
        if (t.type === '(') { depthParen += 1; }
        if (t.type === ')') { depthParen -= 1; }
        if (t.type === '}' && depthParen <= 0) { return; }
        if (t.type === ';' && depthParen <= 0) { this.next(); return; }
        if (t.type === '{' && depthParen <= 0) {
          var depth = 0;
          while (this.peek().type !== 'eof') {
            var b = this.next();
            if (b.type === '{') { depth += 1; }
            if (b.type === '}') { depth -= 1; if (depth === 0) { return; } }
          }
          return;
        }
        this.next();
      }
    };

    Parser.prototype.parseProgram = function () {
      while (this.peek().type !== 'eof') {
        var t = this.peek();
        if (t.type === 'ident' && t.value === 'void') {
          this.next();
          this.parseFunction(t);
        } else if (t.type === 'ident' && t.value.toLowerCase() === 'void') {
          this.report.error(t.line, 'escribe void con minúsculas.');
          this.next();
          this.parseFunction(t);
        } else if (t.type === 'ident' && this.peek(1).type === 'ident' && this.peek(2).type === '(') {
          this.report.error(t.line, 'en este simulador las funciones empiezan con la palabra void.');
          this.next();
          this.parseFunction(t);
        } else if (t.type === 'ident' && UNSUPPORTED_BLOCKS.indexOf(t.value) !== -1) {
          this.report.error(t.line, 'esa instrucción (' + t.value + ') todavía no está disponible en nuestro simulador. Escribe los números directamente, por ejemplo pinMode(8, OUTPUT);');
          this.next();
          this.skipBlock(t.line);
        } else if (t.type === '}') {
          this.report.error(t.line, 'sobra una llave }. Revisa que cada { tenga una sola }.');
          this.next();
        } else if (t.type === 'ident' && this.peek(1).type === '(') {
          this.report.error(t.line, 'las instrucciones deben ir dentro de setup() o loop().');
          this.next();
          this.skipStatement(t.line);
        } else {
          this.report.error(t.line, 'no entiendo «' + t.value + '». Revisa cómo está escrito.');
          this.next();
        }
      }
    };

    Parser.prototype.parseFunction = function (voidToken) {
      var nameToken = this.peek();
      if (nameToken.type !== 'ident') {
        this.report.error(voidToken.line, 'después de void escribe el nombre de la función: setup o loop.');
        return;
      }
      this.next();
      var name = nameToken.value;
      var valid = true;
      if (name !== 'setup' && name !== 'loop') {
        var fixed = BY_LOWERCASE[name.toLowerCase()];
        if (fixed === 'setup' || fixed === 'loop') {
          this.report.error(nameToken.line, 'revisa mayúsculas y minúsculas: se escribe ' + fixed + '.');
          name = fixed;
        } else {
          this.report.error(nameToken.line, 'en este simulador solo puedes usar las funciones setup() y loop().');
          valid = false;
        }
      }

      // Paréntesis vacíos
      if (this.peek().type === '(') {
        this.next();
        if (this.peek().type !== ')') {
          if (this.peek().type !== '{') {
            this.report.error(nameToken.line, 'la función ' + name + '() no lleva nada entre los paréntesis.');
          }
          while (this.peek().type !== ')' && this.peek().type !== '{' && this.peek().type !== 'eof') { this.next(); }
        }
        if (this.peek().type === ')') {
          this.next();
        } else {
          this.report.error(nameToken.line, 'falta cerrar el paréntesis ) de ' + name + '().');
        }
      } else {
        this.report.error(nameToken.line, 'después de ' + name + ' escribe paréntesis: ' + name + '().');
      }

      var openLine = nameToken.line;
      if (this.peek().type === '{') {
        openLine = this.next().line;
      } else {
        this.report.error(nameToken.line, 'después de ' + name + '() debe ir una llave {.');
      }

      var actions = [];
      while (true) {
        var t = this.peek();
        if (t.type === '}') { this.next(); break; }
        if (t.type === 'eof') {
          this.report.error(openLine, 'la función ' + name + '() abre una llave { que nunca se cierra. Agrega } al final de la función.');
          break;
        }
        if (t.type === 'ident' && t.value.toLowerCase() === 'void') {
          this.report.error(openLine, 'la función ' + name + '() no se cerró. Agrega } antes de la siguiente función.');
          break;
        }
        if (t.type === '{') {
          this.report.error(t.line, 'sobra una llave {.');
          this.next();
          continue;
        }
        this.parseStatement(actions, name);
      }

      if (!valid) { return; }
      if (this.functions[name]) {
        this.report.error(nameToken.line, 'el programa ya tiene una función ' + name + '(). Solo puede haber una.');
        return;
      }
      this.functions[name] = { line: nameToken.line, actions: actions };
    };

    Parser.prototype.readArg = function () {
      var t = this.peek();
      if (t.type === '-' && this.peek(1).type === 'number') {
        this.next();
        var num = this.next();
        return { kind: 'number', raw: '-' + num.value, value: -Number(num.value), integer: false, line: t.line };
      }
      if (t.type === 'number') {
        this.next();
        return { kind: 'number', raw: t.value, value: Number(t.value), integer: /^\d+$/.test(t.value), line: t.line };
      }
      if (t.type === 'ident') {
        this.next();
        return { kind: 'ident', raw: t.value, line: t.line };
      }
      return null;
    };

    Parser.prototype.parseStatement = function (actions, fnName) {
      var report = this.report;
      var t = this.next();
      if (t.type === ';') { return; } // instrucción vacía: válida en C++
      if (t.type !== 'ident') {
        report.error(t.line, 'no entiendo «' + t.value + '» en este lugar.');
        return;
      }
      var name = t.value;
      var line = t.line;
      var known = INSTRUCTIONS[name] || INSTRUCTIONS[BY_LOWERCASE[name.toLowerCase()]];

      if (UNSUPPORTED_BLOCKS.indexOf(name) !== -1) {
        report.error(line, 'esa instrucción (' + name + ') todavía no está disponible en nuestro simulador.');
        this.skipBlock(line);
        return;
      }

      if (this.peek().type !== '(') {
        if (known) {
          report.error(line, 'después de ' + name + ' van paréntesis. Ejemplo: ' + known.usage);
        } else {
          report.error(line, 'no entiendo «' + name + '». Revisa cómo está escrito.');
        }
        this.skipStatement(line);
        return;
      }
      this.next(); // (

      var args = [];
      var argsOk = true;
      var closed = false;
      var closeLine = line;
      var guard = 0;
      while (guard++ < 200) {
        var a = this.peek();
        if (a.type === ')') { closeLine = this.next().line; closed = true; break; }
        if (a.type === ';' || a.type === '{' || a.type === '}' || a.type === 'eof' ||
            (a.line !== line && a.type === 'ident' && this.peek(1).type === '(')) {
          report.error(line, 'falta cerrar el paréntesis ) en ' + name + '(...).');
          argsOk = false;
          break;
        }
        if (args.length > 0 || a.type === ',') {
          if (a.type === ',') {
            this.next();
            if (args.length === 0 || this.peek().type === ')' || this.peek().type === ',') {
              report.error(a.line, 'falta un dato junto a la coma (,).');
              argsOk = false;
              continue;
            }
          } else {
            report.error(a.line, 'separa los datos con una coma (,).');
            argsOk = false;
          }
        }
        var value = this.readArg();
        if (value) {
          args.push(value);
        } else {
          var bad = this.peek();
          if (bad.type === ')' || bad.type === ';' || bad.type === '}' || bad.type === '{' || bad.type === 'eof') { continue; }
          report.error(bad.line, 'no entiendo «' + bad.value + '» dentro de los paréntesis.');
          argsOk = false;
          this.next();
        }
      }

      if (closed) {
        if (this.peek().type === ';') {
          this.next();
        } else {
          report.error(closeLine, 'parece que olvidaste el punto y coma (;).');
        }
      } else {
        this.skipStatement(line);
      }
      if (!argsOk) { return; }

      var action = validateInstruction(name, args, line, report);
      if (action) {
        action.fn = fnName;
        actions.push(action);
      }
    };

    /* ---------- Validación de cada instrucción ---------- */
    function validatePin(arg, line, report) {
      if (arg.kind === 'number' && arg.integer && arg.value >= LIMITS.minPin && arg.value <= LIMITS.maxPin) {
        return arg.value;
      }
      var dMatch = arg.kind === 'ident' ? /^[Dd](\d+)$/.exec(arg.raw) : null;
      if (dMatch) {
        report.error(line, 'escribe solo el número del pin: ' + Number(dMatch[1]) + ' en lugar de ' + arg.raw + '.');
      } else {
        report.error(line, 'utiliza un pin digital entre 2 y 13.');
      }
      return null;
    }

    function validateInstruction(name, args, line, report) {
      var def = INSTRUCTIONS[name];
      if (!def) {
        var fixed = BY_LOWERCASE[name.toLowerCase()];
        if (fixed && INSTRUCTIONS[fixed]) {
          report.error(line, 'revisa mayúsculas y minúsculas: se escribe ' + fixed + '.');
        } else {
          report.error(line, 'esa instrucción (' + name + ') todavía no está disponible en nuestro simulador.');
        }
        return null;
      }
      if (args.length !== def.args) {
        report.error(line, name + ' necesita ' + (def.args === 1 ? '1 dato' : def.args + ' datos') + '. Ejemplo: ' + def.usage);
        return null;
      }

      if (name === 'delay') {
        var ms = args[0];
        if (ms.kind !== 'number' || !ms.integer || ms.value < 0 || ms.value > LIMITS.maxDelay) {
          report.error(line, 'en delay() escribe un número entero de milisegundos entre 0 y 60000.');
          return null;
        }
        return { type: 'delay', ms: ms.value, line: line };
      }

      var pin = validatePin(args[0], line, report);
      var second = args[1];

      if (name === 'pinMode') {
        var modeOk = second.kind === 'ident' && second.raw === 'OUTPUT';
        if (!modeOk) {
          if (second.kind === 'ident' && second.raw.toUpperCase() === 'OUTPUT') {
            report.error(line, 'escribe OUTPUT con mayúsculas.');
          } else if (second.kind === 'ident' && /^INPUT/i.test(second.raw)) {
            report.error(line, 'en este simulador los pines se usan como salida: escribe OUTPUT.');
          } else {
            report.error(line, 'para configurar el pin como salida escribe OUTPUT.');
          }
        }
        return pin !== null && modeOk ? { type: 'pinMode', pin: pin, mode: 'OUTPUT', line: line } : null;
      }

      // digitalWrite
      var value = second.kind === 'ident' && (second.raw === 'HIGH' || second.raw === 'LOW') ? second.raw : null;
      if (!value) {
        if (second.kind === 'number' && (second.raw === '1' || second.raw === '0')) {
          report.error(line, 'usa HIGH para encender o LOW para apagar, en lugar de 1 o 0.');
        } else if (second.kind === 'ident' && looksLike(second.raw, 'HIGH', 2)) {
          report.error(line, 'para encender el LED debes utilizar HIGH.');
        } else if (second.kind === 'ident' && looksLike(second.raw, 'LOW', 1)) {
          report.error(line, 'para apagar el LED debes utilizar LOW.');
        } else {
          report.error(line, 'digitalWrite usa HIGH para encender o LOW para apagar.');
        }
      }
      return pin !== null && value ? { type: 'digitalWrite', pin: pin, value: value, line: line } : null;
    }

    /* ---------- Revisión del programa completo ---------- */
    function checkProgram(functions, report) {
      if (!functions.setup) { report.error(null, 'Falta la función setup(). Escríbela así: void setup() { }'); }
      if (!functions.loop) { report.error(null, 'Falta la función loop(). Escríbela así: void loop() { }'); }
      var setupActions = functions.setup ? functions.setup.actions : [];
      var loopActions = functions.loop ? functions.loop.actions : [];

      var configured = {};
      var written = {};
      var reported = {};
      setupActions.concat(loopActions).forEach(function (action) {
        if (action.type === 'pinMode') {
          if (configured[action.pin]) {
            report.warning(action.line, 'el pin ' + action.pin + ' ya estaba configurado como salida.');
          }
          if (action.fn === 'loop') {
            report.warning(action.line, 'pinMode() suele escribirse dentro de setup().');
          }
          configured[action.pin] = action.line;
        } else if (action.type === 'digitalWrite') {
          written[action.pin] = true;
          if (!configured[action.pin] && !reported[action.pin]) {
            reported[action.pin] = true;
            report.error(action.line, 'antes de controlar el pin ' + action.pin + ', configúralo como salida con pinMode(' + action.pin + ', OUTPUT).');
          }
        }
      });
      Object.keys(configured).forEach(function (pin) {
        if (!written[pin]) {
          report.warning(configured[pin], 'configuraste el pin ' + pin + ', pero ninguna instrucción digitalWrite lo usa.');
        }
      });
      if (functions.loop) {
        if (!loopActions.length) {
          report.warning(functions.loop.line, 'loop() está vacía: no hay instrucciones para repetir.');
        } else {
          var writes = loopActions.some(function (a) { return a.type === 'digitalWrite'; });
          var waits = loopActions.some(function (a) { return a.type === 'delay' && a.ms > 0; });
          if (writes && !waits) {
            report.warning(functions.loop.line, 'loop() no tiene delay(): los cambios serían tan rápidos que no podrías verlos.');
          }
        }
      }
      return { setupActions: setupActions, loopActions: loopActions };
    }

    function strip(action) {
      var copy = { type: action.type, line: action.line };
      if (action.type === 'pinMode') { copy.pin = action.pin; copy.mode = action.mode; }
      if (action.type === 'digitalWrite') { copy.pin = action.pin; copy.value = action.value; }
      if (action.type === 'delay') { copy.ms = action.ms; }
      return copy;
    }

    function byLine(a, b) {
      var la = a.line === null ? Infinity : a.line;
      var lb = b.line === null ? Infinity : b.line;
      return la - lb;
    }

    function parse(code) {
      var errors = [];
      var warnings = [];
      var seen = {};
      function add(list, kind, line, text) {
        var message = line === null ? text : 'Línea ' + line + ': ' + text;
        if (seen[kind + message]) { return; }
        seen[kind + message] = true;
        list.push({ line: line, message: message });
      }
      var report = {
        error: function (line, text) { add(errors, 'e', line, text); },
        warning: function (line, text) { add(warnings, 'w', line, text); }
      };

      code = typeof code === 'string' ? code : '';
      var lineCount = code.split('\n').length;
      var empty = { success: false, setupActions: [], loopActions: [], errors: errors, warnings: warnings, pins: [], instructionCount: 0 };
      if (code.length > LIMITS.chars || lineCount > LIMITS.lines) {
        report.error(null, 'Tu programa es muy largo. El máximo es ' + LIMITS.chars + ' caracteres y ' + LIMITS.lines + ' líneas.');
        return empty;
      }
      if (!code.trim()) {
        report.error(null, 'El editor está vacío. Escribe un programa o carga un ejemplo.');
        return empty;
      }

      var tokens = tokenize(code, report);
      var parser = new Parser(tokens, report);
      parser.parseProgram();
      var program = checkProgram(parser.functions, report);

      // Si una línea ya avisa de una estructura no admitida (int x = 8;), no repetimos el aviso del símbolo.
      var unsupportedLines = {};
      errors.forEach(function (e) { if (e.line && /todavía no está disponible/.test(e.message)) { unsupportedLines[e.line] = true; } });
      errors = errors.filter(function (e) { return !(unsupportedLines[e.line] && /el símbolo «/.test(e.message)); });

      errors.sort(byLine);
      warnings.sort(byLine);
      var setupActions = program.setupActions.map(strip);
      var loopActions = program.loopActions.map(strip);
      var pins = [];
      setupActions.concat(loopActions).forEach(function (a) {
        if (a.pin && pins.indexOf(a.pin) === -1) { pins.push(a.pin); }
      });
      pins.sort(function (a, b) { return a - b; });

      return {
        success: errors.length === 0,
        setupActions: setupActions,
        loopActions: loopActions,
        errors: errors,
        warnings: warnings,
        pins: pins,
        instructionCount: setupActions.length + loopActions.length
      };
    }

    return { parse: parse, LIMITS: LIMITS };
  })();

  /* ---------- Ejemplos (se adaptan a los LEDs conectados, sin cambiarlos) ---------- */
  var EXAMPLES = [
    { id: 'blink-l', name: 'Ejemplo 1: parpadeo del LED L' },
    { id: 'blink-external', name: 'Ejemplo 2: parpadeo de un LED externo' },
    { id: 'alternate', name: 'Ejemplo 3: alternar dos LEDs' }
  ];

  function pinNumber(pinId) {
    return Number(String(pinId).replace('D', ''));
  }

  /* Pin que usa el ejemplo 2: el del primer LED conectado o, si no hay, el 8.
     La guía usa esta misma función para que su explicación coincida con el código. */
  function examplePin(leds) {
    return leds[0] ? pinNumber(leds[0].pin) : 8;
  }

  function buildExample(id, leds) {
    if (id === 'blink-l') {
      return {
        note: 'Este ejemplo usa el pin 13, que controla el LED L de la tarjeta. No necesitas conectar nada.',
        code: [
          '// Ejemplo 1: parpadeo del LED L (pin 13)',
          'void setup() {',
          '  pinMode(13, OUTPUT);     // el pin 13 será una salida',
          '}',
          '',
          'void loop() {',
          '  digitalWrite(13, HIGH);  // enciende el LED L',
          '  delay(1000);             // espera 1 segundo',
          '  digitalWrite(13, LOW);   // apaga el LED L',
          '  delay(1000);             // espera 1 segundo',
          '}'
        ].join('\n')
      };
    }
    if (id === 'blink-external') {
      var led = leds[0];
      var pin = examplePin(leds);
      return {
        note: led
          ? 'Este ejemplo usa el pin ' + pin + ', donde conectaste el ' + Circuit.label(led) + ' ' + LED_COLORS[led.color].name.toLowerCase() + '.'
          : 'Este ejemplo usa el pin 8. Para verlo funcionar en la simulación, conecta un LED al pin D8 en «Conecta tus LEDs».',
        code: [
          '// Ejemplo 2: parpadeo de un LED externo (pin ' + pin + ')',
          'void setup() {',
          '  pinMode(' + pin + ', OUTPUT);',
          '}',
          '',
          'void loop() {',
          '  digitalWrite(' + pin + ', HIGH);  // enciende el LED',
          '  delay(500);              // espera medio segundo',
          '  digitalWrite(' + pin + ', LOW);   // apaga el LED',
          '  delay(500);',
          '}'
        ].join('\n')
      };
    }
    // alternate: usa los dos primeros LEDs conectados; completa con 8 y 9 sin repetir.
    var pins = leds.slice(0, 2).map(function (l) { return pinNumber(l.pin); });
    [8, 9, 10].forEach(function (p) { if (pins.length < 2 && pins.indexOf(p) === -1) { pins.push(p); } });
    var missing = pins.filter(function (p) { return !Circuit.ledOnPin('D' + p); });
    var note;
    if (!missing.length) {
      note = 'Este ejemplo usa los pines ' + pins[0] + ' y ' + pins[1] + ', donde ya tienes LEDs conectados.';
    } else if (missing.length === 2) {
      note = 'Para verlo funcionar en la simulación, conecta LEDs en los pines D' + missing[0] + ' y D' + missing[1] + '.';
    } else {
      note = 'Para verlo funcionar en la simulación, conecta otro LED en el pin D' + missing[0] + '.';
    }
    return {
      note: note,
      code: [
        '// Ejemplo 3: alternar dos LEDs (pines ' + pins[0] + ' y ' + pins[1] + ')',
        'void setup() {',
        '  pinMode(' + pins[0] + ', OUTPUT);',
        '  pinMode(' + pins[1] + ', OUTPUT);',
        '}',
        '',
        'void loop() {',
        '  digitalWrite(' + pins[0] + ', HIGH);  // enciende el primero',
        '  digitalWrite(' + pins[1] + ', LOW);   // apaga el segundo',
        '  delay(500);',
        '  digitalWrite(' + pins[0] + ', LOW);   // apaga el primero',
        '  digitalWrite(' + pins[1] + ', HIGH);  // enciende el segundo',
        '  delay(500);',
        '}'
      ].join('\n')
    };
  }

  /* =========================================================
     Program: estado del programa, verificación y panel de análisis.
     A5 debe usar Program.getAnalysis(): devuelve el último análisis
     correcto y vigente, o null si hay errores o está desactualizado.
     ========================================================= */
  var Program = {
    els: {},

    init: function () {
      var self = this;
      ['code-input', 'editor-gutter', 'editor-meta', 'example-select', 'load-example', 'verify-code', 'clear-code',
        'editor-confirm', 'editor-confirm-text', 'editor-confirm-yes', 'editor-confirm-no', 'analysis-status', 'analysis-body']
        .forEach(function (id) { self.els[id] = document.getElementById(id); });
      var input = this.els['code-input'];
      if (!input) { return; }

      EXAMPLES.forEach(function (example) {
        var option = document.createElement('option');
        option.value = example.id;
        option.textContent = example.name;
        self.els['example-select'].appendChild(option);
      });

      if (!state.program.code) { state.program.code = buildExample('blink-l', []).code; }
      input.value = state.program.code;

      input.addEventListener('input', function () { self.onEdit(); });
      input.addEventListener('scroll', function () { self.els['editor-gutter'].scrollTop = input.scrollTop; });
      this.els['verify-code'].addEventListener('click', function () { self.verify(); });
      this.els['load-example'].addEventListener('click', function () { self.requestExample(); });
      this.els['clear-code'].addEventListener('click', function () { self.requestClear(); });
      this.els['editor-confirm-no'].addEventListener('click', function () { self.closeConfirm(true); });
      this.els['editor-confirm-yes'].addEventListener('click', function () {
        var action = self.pendingAction;
        self.closeConfirm(false);
        if (action) { action(); }
      });
      this.els['analysis-body'].addEventListener('click', function (event) {
        var button = event.target.closest('[data-goto-line]');
        if (button) { self.goToLine(Number(button.getAttribute('data-goto-line'))); }
      });

      // Cambiar las conexiones no toca el código, pero el análisis anterior deja de ser vigente.
      Circuit.onChange(function () {
        if (state.program.analysis && !state.program.stale) {
          state.program.stale = 'connections';
          self.renderAnalysis();
        }
      });

      this.renderGutter();
      this.renderAnalysis();
    },

    getAnalysis: function () {
      var p = state.program;
      return p.analysis && p.analysis.success && !p.stale ? p.analysis : null;
    },

    setCode: function (code) {
      this.els['code-input'].value = code;
      this.onEdit();
    },

    onEdit: function () {
      var p = state.program;
      p.code = this.els['code-input'].value;
      if (Simulator.isRunning() && p.code !== p.analyzedCode) {
        Simulator.stop('code'); // el programa en ejecución ya no coincide con el código escrito
      }
      if (p.analysis) {
        if (p.code === p.analyzedCode) {
          if (p.stale === 'code') { p.stale = false; }
        } else {
          p.stale = 'code';
        }
      }
      this.renderGutter();
      this.renderAnalysis();
    },

    verify: function () {
      var p = state.program;
      var result = ArduinoParser.parse(p.code);
      this.addLedWarnings(result);
      p.analysis = result;
      p.analyzedCode = p.code;
      p.stale = false;
      this.renderGutter();
      this.renderAnalysis();
    },

    /* Advertencias que dependen de los LEDs conectados en A3 (no invalidan el programa). */
    addLedWarnings: function (result) {
      result.pinInfo = result.pins.map(function (pin) {
        var led = Circuit.ledOnPin('D' + pin);
        var info = { pin: pin, led: led, builtin: pin === 13 };
        if (!led && pin !== 13) {
          result.warnings.push({
            line: null,
            message: 'El pin ' + pin + ' no tiene un LED conectado. Conéctalo en «Conecta tus LEDs» para verlo funcionar en la simulación.'
          });
        }
        return info;
      });
    },

    /* Usado por el modo guiado: carga un ejemplo con las mismas reglas que el botón. */
    loadExample: function (id) {
      this.els['example-select'].value = id;
      this.requestExample();
    },

    /* A5: resalta en los números de línea la instrucción que se está ejecutando. */
    markLine: function (line) {
      if (this.currentLine === line) { return; }
      var gutter = this.els['editor-gutter'];
      if (!gutter) { return; }
      var old = gutter.querySelector('.is-current');
      if (old) { old.classList.remove('is-current'); }
      this.currentLine = line;
      if (line && gutter.children[line - 1]) { gutter.children[line - 1].classList.add('is-current'); }
    },

    requestExample: function () {
      var self = this;
      var id = this.els['example-select'].value;
      var example = buildExample(id, Circuit.getLeds());
      var apply = function () {
        self.setCode(example.code);
        self.exampleNote = example.note;
        self.exampleCode = example.code;
        self.renderAnalysis();
        self.els['code-input'].focus();
      };
      var current = state.program.code.trim();
      var isExample = EXAMPLES.some(function (e) { return buildExample(e.id, Circuit.getLeds()).code.trim() === current; });
      if (!current || isExample) {
        apply();
      } else {
        this.openConfirm('El ejemplo reemplazará tu código actual. ¿Quieres continuar?', 'Sí, cargar ejemplo', 'No, conservar mi código', apply);
      }
    },

    requestClear: function () {
      var self = this;
      if (!state.program.code) { return; }
      this.openConfirm('¿Seguro que quieres borrar todo tu programa?', 'Sí, borrar', 'No, conservarlo', function () {
        self.setCode('');
        self.exampleNote = '';
        self.renderAnalysis();
        self.els['code-input'].focus();
      });
    },

    openConfirm: function (text, yes, no, action) {
      this.pendingAction = action;
      this.els['editor-confirm-text'].textContent = text;
      this.els['editor-confirm-yes'].textContent = yes;
      this.els['editor-confirm-no'].textContent = no;
      this.els['editor-confirm'].hidden = false;
      this.els['editor-confirm-no'].focus();
    },

    closeConfirm: function (returnFocus) {
      this.pendingAction = null;
      this.els['editor-confirm'].hidden = true;
      if (returnFocus) { this.els['code-input'].focus(); }
    },

    goToLine: function (line) {
      var input = this.els['code-input'];
      var lines = input.value.split('\n');
      var start = 0;
      for (var i = 0; i < line - 1 && i < lines.length; i++) { start += lines[i].length + 1; }
      input.focus();
      input.setSelectionRange(start, start + (lines[line - 1] || '').length);
      var lineHeight = parseFloat(window.getComputedStyle(input).lineHeight) || 24;
      input.scrollTop = Math.max(0, (line - 3) * lineHeight);
    },

    renderGutter: function () {
      var gutter = this.els['editor-gutter'];
      var p = state.program;
      var count = Math.min(p.code.split('\n').length, ArduinoParser.LIMITS.lines + 50);
      var errorLines = {};
      if (p.analysis && !p.stale) {
        p.analysis.errors.forEach(function (e) { if (e.line) { errorLines[e.line] = true; } });
      }
      clearEl(gutter);
      for (var i = 1; i <= count; i++) {
        var span = document.createElement('span');
        span.className = 'editor__line' + (errorLines[i] ? ' has-error' : '') + (i === this.currentLine ? ' is-current' : '');
        span.textContent = String(i);
        gutter.appendChild(span);
      }
      gutter.scrollTop = this.els['code-input'].scrollTop;

      var lines = p.code.split('\n').length;
      var limits = ArduinoParser.LIMITS;
      var meta = this.els['editor-meta'];
      meta.textContent = 'Líneas: ' + lines + ' de ' + limits.lines + '. Caracteres: ' + p.code.length + ' de ' + limits.chars + '.';
      meta.classList.toggle('is-over', lines > limits.lines || p.code.length > limits.chars);
    },

    /* Resumen en palabras derivado de las acciones reconocidas. */
    describe: function (result) {
      function ledName(pin) {
        var led = Circuit.ledOnPin('D' + pin);
        if (led) { return 'el ' + Circuit.label(led) + ' ' + LED_COLORS[led.color].name.toLowerCase() + ' (pin ' + pin + ')'; }
        if (pin === 13) { return 'el LED L (pin 13)'; }
        return null;
      }
      function pinsText(pins) {
        if (pins.length === 1) { return 'el pin ' + pins[0]; }
        return 'los pines ' + pins.slice(0, -1).join(', ') + ' y ' + pins[pins.length - 1];
      }
      function waitText(ms) {
        if (ms === 0) { return 'no espera (delay de 0)'; }
        if (ms % 1000 === 0) { return 'espera ' + (ms / 1000) + (ms === 1000 ? ' segundo' : ' segundos'); }
        if (ms === 500) { return 'espera medio segundo'; }
        return 'espera ' + ms + ' milisegundos';
      }
      function actionText(a) {
        if (a.type === 'delay') { return waitText(a.ms); }
        if (a.type === 'pinMode') { return 'configura el pin ' + a.pin + ' como salida'; }
        var name = ledName(a.pin);
        if (a.value === 'HIGH') { return name ? 'enciende ' + name : 'pone el pin ' + a.pin + ' en HIGH'; }
        return name ? 'apaga ' + name : 'pone el pin ' + a.pin + ' en LOW';
      }
      function join(list) {
        if (list.length === 1) { return list[0]; }
        return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1];
      }

      var parts = [];
      var setupPins = result.setupActions.filter(function (a) { return a.type === 'pinMode'; }).map(function (a) { return a.pin; });
      var otherSetup = result.setupActions.filter(function (a) { return a.type !== 'pinMode'; });
      if (setupPins.length) {
        parts.push('Al comenzar, tu programa configura ' + pinsText(setupPins) + ' como ' + (setupPins.length === 1 ? 'salida' : 'salidas') +
          (otherSetup.length ? ' y luego ' + join(otherSetup.map(actionText)) : '') + '.');
      } else if (otherSetup.length) {
        parts.push('Al comenzar, tu programa ' + join(otherSetup.map(actionText)) + '.');
      } else {
        parts.push('setup() no tiene instrucciones.');
      }
      if (result.loopActions.length) {
        var shown = result.loopActions.slice(0, 8).map(actionText);
        var rest = result.loopActions.length - shown.length;
        parts.push('Después ' + join(shown) + (rest > 0 ? ', y ' + rest + ' instrucciones más' : '') + ', y repite esas instrucciones una y otra vez.');
      }
      return parts.join(' ');
    },

    renderAnalysis: function () {
      var p = state.program;
      var status = this.els['analysis-status'];
      var body = this.els['analysis-body'];
      clearEl(body);
      var self = this;

      function section(title, items, kind) {
        var h = document.createElement('h3');
        h.className = 'analysis__title';
        h.textContent = title;
        body.appendChild(h);
        var list = document.createElement('ul');
        list.className = 'analysis__list analysis__list--' + kind;
        items.forEach(function (item) {
          var li = document.createElement('li');
          var text = document.createElement('span');
          text.textContent = item.message;
          li.appendChild(text);
          if (item.line && kind === 'error') {
            var go = document.createElement('button');
            go.type = 'button';
            go.className = 'analysis__goto';
            go.setAttribute('data-goto-line', item.line);
            go.textContent = 'Ir a la línea ' + item.line;
            li.appendChild(go);
          }
          list.appendChild(li);
        });
        body.appendChild(list);
      }
      function paragraph(text, className) {
        var el = document.createElement('p');
        el.className = className;
        el.textContent = text;
        body.appendChild(el);
      }

      if (typeof SimView !== 'undefined') { SimView.render(); }
      if (this.exampleNote && p.code === this.exampleCode) { paragraph(this.exampleNote, 'analysis__note'); }

      if (!p.analysis) {
        status.className = 'analysis__status';
        status.textContent = 'Escribe tu programa y presiona «Verificar código».';
        return;
      }
      if (p.stale) {
        status.className = 'analysis__status analysis__status--stale';
        status.textContent = p.stale === 'connections'
          ? 'Cambiaste las conexiones de los LEDs. Presiona «Verificar código» otra vez.'
          : 'Cambiaste el código después de verificarlo. Presiona «Verificar código» otra vez.';
        return;
      }

      var a = p.analysis;
      if (a.success) {
        status.className = 'analysis__status analysis__status--ok';
        status.textContent = '¡Muy bien! Tu programa está correctamente escrito y listo para simularse.';
      } else {
        status.className = 'analysis__status analysis__status--error';
        status.textContent = a.errors.length === 1
          ? 'Encontramos 1 error en tu programa. Revísalo y verifica otra vez.'
          : 'Encontramos ' + a.errors.length + ' errores en tu programa. Revísalos y verifica otra vez.';
      }

      if (a.errors.length) {
        var shown = a.errors.slice(0, 6);
        if (a.errors.length > shown.length) {
          shown = shown.concat([{ line: null, message: 'Y ' + (a.errors.length - shown.length) + ' errores más. Corrige los primeros y verifica otra vez.' }]);
        }
        section('Errores', shown, 'error');
      }
      if (a.warnings.length) { section('Advertencias', a.warnings, 'warning'); }

      if (a.success) {
        var facts = document.createElement('dl');
        facts.className = 'analysis__facts';
        var setupCount = a.setupActions.length;
        var loopCount = a.loopActions.length;
        [
          ['Instrucciones reconocidas', a.instructionCount + ' (' + setupCount + ' en setup y ' + loopCount + ' en loop)'],
          ['Pines utilizados', a.pinInfo.length ? a.pinInfo.map(function (info) {
            if (info.led) { return 'D' + info.pin + ': ' + Circuit.label(info.led) + ' ' + LED_COLORS[info.led.color].name.toLowerCase(); }
            if (info.builtin) { return 'D13: LED L de la tarjeta'; }
            return 'D' + info.pin + ': sin LED conectado';
          }).join('; ') : 'ninguno']
        ].forEach(function (row) {
          var dt = document.createElement('dt');
          dt.textContent = row[0];
          var dd = document.createElement('dd');
          dd.textContent = row[1];
          facts.appendChild(dt);
          facts.appendChild(dd);
        });
        body.appendChild(facts);

        var h = document.createElement('h3');
        h.className = 'analysis__title';
        h.textContent = '¿Qué hará tu programa?';
        body.appendChild(h);
        paragraph(self.describe(a), 'analysis__summary');
        paragraph('Esto es una revisión de tu código. Para verlo funcionar, presiona «Ejecutar».', 'analysis__hint');
      }
    }
  };

  /* =========================================================
     A5: indicadores de la tarjeta (ON, L, RX, TX).
     ON: siempre encendido (la tarjeta virtual está alimentada).
     L:  sigue al pin enlazado en BOARD.indicators (D13).
     RX/TX: solo la animación educativa al iniciar un programa.
     ========================================================= */
  var INDICATOR_INFO = {
    ON: 'Energía',
    L: 'Pin 13',
    TX: 'Envío (animación)',
    RX: 'Recepción (animación)'
  };

  var Indicators = {
    items: {},

    init: function () {
      var self = this;
      var list = document.getElementById('board-leds');
      ['ON', 'L', 'TX', 'RX'].forEach(function (name) {
        var item = null;
        if (list) {
          item = document.createElement('li');
          item.className = 'board-led board-led--' + name.toLowerCase();
          item.setAttribute('data-board-led', name);
          var dot = document.createElement('span');
          dot.className = 'board-led__dot';
          dot.setAttribute('aria-hidden', 'true');
          var label = document.createElement('strong');
          label.textContent = name;
          var info = document.createElement('span');
          info.className = 'board-led__info';
          info.textContent = INDICATOR_INFO[name];
          var stateText = document.createElement('span');
          stateText.className = 'board-led__state';
          item.appendChild(dot);
          item.appendChild(label);
          item.appendChild(info);
          item.appendChild(stateText);
          list.appendChild(item);
        }
        self.items[name] = item;
        self.render(name);
      });
    },

    set: function (name, on) {
      if (state.board[name] === on) { return; }
      state.board[name] = on;
      this.render(name);
    },

    render: function (name) {
      var on = !!state.board[name];
      var svgLed = document.querySelector('#uno-board [data-indicator="' + name + '"]');
      if (svgLed) { svgLed.classList.toggle('is-on', on); }
      var item = this.items[name];
      if (item) {
        item.classList.toggle('is-on', on);
        item.querySelector('.board-led__state').textContent = on ? 'Encendido' : 'Apagado';
      }
    }
  };

  /* =========================================================
     A5: motor de simulación.
     Recorre las acciones ya analizadas por ArduinoParser (A4):
     setup() una vez y loop() una y otra vez. Nunca vuelve a leer el texto.
     - Un solo temporizador activo (this.timer).
     - Cada ejecución tiene un runId: detener o reiniciar lo incrementa y
       cualquier tarea antigua que despierte se descarta sin tocar los LEDs.
     - Solo espera en delay(); si loop() casi no espera, se intercala una
       pausa mínima para no bloquear el navegador.
     ========================================================= */
  var SIM_MIN_LOOP_MS = 20;    // pausa mínima entre vueltas de loop() con poca o ninguna espera
  var SIM_UPLOAD_STEP_MS = 120; // ritmo de la animación educativa de RX/TX
  var SIM_MAX_SYNC_STEPS = 500; // seguridad: nunca más de 500 acciones seguidas sin ceder el control

  var Simulator = {
    runId: 0,
    timer: null,
    listeners: [],

    onChange: function (listener) { this.listeners.push(listener); },

    emit: function () {
      this.listeners.forEach(function (listener) { listener(); });
    },

    isRunning: function () {
      return state.sim.status === 'running';
    },

    /* Estado que se muestra: listo, ejecutando, detenido o requiere verificación. */
    displayStatus: function () {
      if (this.isRunning()) { return 'running'; }
      if (!Program.getAnalysis()) { return 'verify'; }
      return state.sim.status === 'stopped' ? 'stopped' : 'ready';
    },

    clearTimer: function () {
      if (this.timer !== null) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
    },

    schedule: function (runId, ms, task) {
      var self = this;
      this.clearTimer();
      this.timer = window.setTimeout(function () {
        self.timer = null;
        if (runId !== self.runId) { return; } // ejecución cancelada
        task.call(self, runId);
      }, ms);
    },

    /* Invalida cualquier tarea pendiente de ejecuciones anteriores. */
    cancel: function () {
      this.runId += 1;
      this.clearTimer();
      Indicators.set('RX', false);
      Indicators.set('TX', false);
    },

    setPin: function (pin, high) {
      var pinId = 'D' + pin;
      state.sim.pins[pin] = high ? 'HIGH' : 'LOW';
      Circuit.applyPin(pinId, high); // LEDs externos de ese pin (por pin, no por número visible)
      Object.keys(BOARD.indicators).forEach(function (name) {
        if (BOARD.indicators[name].linkedPin === pinId) { Indicators.set(name, high); }
      });
      if (pin !== 13 && !Circuit.ledOnPin(pinId) && !state.sim.notedPins[pin]) {
        state.sim.notedPins[pin] = true;
        this.note('El pin ' + pin + ' está cambiando de estado, pero no tiene un LED externo conectado.');
      }
    },

    /* Todos los pines a LOW: apaga LEDs externos y el LED L (ON sigue encendido). */
    resetPins: function () {
      for (var pin = 2; pin <= 13; pin++) { state.sim.pins[pin] = 'LOW'; }
      state.leds.forEach(function (led) { Circuit.applyPin(led.pin, false); });
      Indicators.set('L', false);
    },

    message: function (text, type) {
      state.sim.message = { text: text, type: type };
      state.sim.notes = [];
    },

    note: function (text) {
      if (state.sim.notes.indexOf(text) === -1 && state.sim.notes.length < 3) { state.sim.notes.push(text); }
      this.emit();
    },

    run: function () { return this.start(false); },
    restart: function () { return this.start(true); },

    start: function (isRestart) {
      var analysis = Program.getAnalysis();
      if (!analysis) {
        if (this.isRunning()) { this.stop('code'); }
        this.message('Primero verifica tu código para asegurarte de que está correctamente escrito.', 'error');
        this.emit();
        return false;
      }
      if (this.isRunning() && !isRestart) { return false; } // nunca dos simulaciones a la vez

      this.cancel();
      this.resetPins();
      var sim = state.sim;
      sim.program = { setup: analysis.setupActions.slice(), loop: analysis.loopActions.slice() };
      sim.cursor = { phase: 'upload', index: 0, loopWait: 0 };
      sim.loops = 0;
      sim.notedPins = {};
      sim.status = 'running';
      sim.current = null;
      this.message(isRestart ? 'Arduino volvió a comenzar desde setup().' : '¡Tu programa está funcionando! Observa cómo responden los LEDs.', 'ok');
      this.emit();
      this.upload(this.runId, 0);
      return true;
    },

    /* Animación educativa: RX y TX parpadean como si el programa viajara por USB. */
    upload: function (runId, stepIndex) {
      var pattern = ['RX', 'TX', 'RX', 'TX'];
      if (stepIndex >= pattern.length * 2) {
        state.sim.cursor.phase = 'setup';
        state.sim.cursor.index = 0;
        this.step(runId);
        return;
      }
      var name = pattern[Math.floor(stepIndex / 2)];
      Indicators.set(name, stepIndex % 2 === 0);
      state.sim.current = { upload: true };
      if (stepIndex === 0) { this.emit(); }
      this.schedule(runId, SIM_UPLOAD_STEP_MS, function (id) { this.upload(id, stepIndex + 1); });
    },

    step: function (runId) {
      var sim = state.sim;
      var program = sim.program;
      var steps = 0;
      while (runId === this.runId) {
        if (steps++ > SIM_MAX_SYNC_STEPS) {
          this.schedule(runId, SIM_MIN_LOOP_MS, this.step);
          return;
        }
        var cursor = sim.cursor;
        var list = cursor.phase === 'setup' ? program.setup : program.loop;
        if (cursor.index >= list.length) {
          if (cursor.phase === 'setup') {
            cursor.phase = 'loop';
            cursor.index = 0;
            cursor.loopWait = 0;
            continue;
          }
          // Terminó una vuelta de loop(): vuelve a empezar.
          sim.loops += 1;
          var waited = cursor.loopWait;
          cursor.index = 0;
          cursor.loopWait = 0;
          if (waited < SIM_MIN_LOOP_MS) {
            this.schedule(runId, SIM_MIN_LOOP_MS - waited, this.step);
            return;
          }
          continue;
        }
        var action = list[cursor.index];
        cursor.index += 1;
        sim.current = { line: action.line, phase: cursor.phase, action: action };
        if (action.type === 'digitalWrite') {
          this.setPin(action.pin, action.value === 'HIGH');
        } else if (action.type === 'delay') {
          if (cursor.phase === 'loop') { cursor.loopWait += action.ms; }
          this.emit();
          this.schedule(runId, action.ms, this.step);
          return;
        }
        // pinMode: el pin ya está validado como salida; no cambia nada visible.
      }
    },

    stop: function (reason) {
      var wasRunning = this.isRunning();
      this.cancel();
      this.resetPins();
      state.sim.status = 'stopped';
      state.sim.current = null;
      if (reason === 'code') {
        this.message('Detuvimos la simulación porque cambiaste el código. Verifícalo otra vez para ejecutarlo.', 'info');
      } else if (reason === 'connections') {
        this.message('Detuvimos la simulación para cambiar el circuito. Verifica tu código otra vez antes de ejecutarlo.', 'info');
      } else if (wasRunning) {
        this.message('Simulación detenida. Detuviste el programa. Puedes modificarlo y volver a ejecutarlo.', 'info');
      }
      this.emit();
    }
  };

  /* ---------- Vista de la simulación: estado, botones y mensajes ---------- */
  var SIM_STATUS = {
    ready: { text: 'Listo', icon: '✓' },
    running: { text: 'Ejecutando', icon: '▶' },
    stopped: { text: 'Detenido', icon: '■' },
    verify: { text: 'Requiere verificación', icon: '!' }
  };

  var SimView = {
    els: {},

    init: function () {
      var self = this;
      ['sim-status', 'sim-status-text', 'sim-current', 'sim-run', 'sim-stop', 'sim-restart', 'sim-message']
        .forEach(function (id) { self.els[id] = document.getElementById(id); });
      if (!this.els['sim-run']) { return; }
      this.els['sim-run'].addEventListener('click', function () { Simulator.run(); });
      this.els['sim-stop'].addEventListener('click', function () { Simulator.stop('user'); });
      this.els['sim-restart'].addEventListener('click', function () { Simulator.restart(); });
      Simulator.onChange(function () { self.render(); });
      this.ready = true;
      this.render();
    },

    describe: function (action) {
      if (action.type === 'delay') { return 'delay(' + action.ms + ')'; }
      if (action.type === 'pinMode') { return 'pinMode(' + action.pin + ', OUTPUT)'; }
      return 'digitalWrite(' + action.pin + ', ' + action.value + ')';
    },

    render: function () {
      if (!this.ready) { return; }
      var els = this.els;
      var status = Simulator.displayStatus();
      var info = SIM_STATUS[status];
      els['sim-status'].setAttribute('data-status', status);
      els['sim-status'].querySelector('.sim-status__icon').textContent = info.icon;
      els['sim-status-text'].textContent = info.text;

      var running = status === 'running';
      els['sim-run'].disabled = running;
      els['sim-stop'].disabled = !running;
      els['sim-restart'].disabled = !Program.getAnalysis();

      var current = state.sim.current;
      var currentText = '';
      if (running && current && current.upload) {
        currentText = 'Enviando tu programa a Arduino. Animación educativa: RX y TX parpadean como en una carga por USB.';
      } else if (running && current && current.action) {
        currentText = 'Ahora: línea ' + current.line + ', ' + this.describe(current.action) + ' en ' + current.phase + '()';
      }
      els['sim-current'].textContent = currentText;
      els['sim-current'].hidden = !currentText;
      Program.markLine(running && current && current.line ? current.line : null);

      var msg = state.sim.message;
      var box = els['sim-message'];
      clearEl(box);
      if (msg) {
        var main = document.createElement('span');
        main.className = 'sim-message__main';
        main.textContent = msg.text;
        box.appendChild(main);
        state.sim.notes.forEach(function (text) {
          var note = document.createElement('span');
          note.className = 'sim-message__note';
          note.textContent = text;
          box.appendChild(note);
        });
        box.className = 'sim-message sim-message--' + msg.type;
      }
      box.hidden = !msg;
      Guide.render();
    }
  };

  /* =========================================================
     A5: modo guiado y modo libre. Ambos usan el mismo Simulator.
     ========================================================= */
  var Guide = {
    els: {},
    signature: '',

    init: function () {
      var self = this;
      ['mode-guided', 'mode-free', 'guide-steps', 'free-help', 'guide-progress', 'guide-step', 'guide-prev', 'guide-next']
        .forEach(function (id) { self.els[id] = document.getElementById(id); });
      if (!this.els['guide-step']) { return; }
      [this.els['mode-guided'], this.els['mode-free']].forEach(function (button) {
        button.addEventListener('click', function () { self.setMode(button.getAttribute('data-mode')); });
      });
      this.els['guide-prev'].addEventListener('click', function () { self.go(state.ui.guideStep - 1); });
      this.els['guide-next'].addEventListener('click', function () { self.go(state.ui.guideStep + 1); });
      this.els['guide-step'].addEventListener('click', function (event) {
        var button = event.target.closest('[data-guide-action]');
        if (!button) { return; }
        var action = button.getAttribute('data-guide-action');
        if (action === 'example') { Program.loadExample('blink-external'); }
        if (action === 'verify') { Program.verify(); }
        if (action === 'run') { Simulator.run(); }
      });
      Circuit.onChange(function () { self.render(); });
      this.ready = true;
      this.render();
    },

    setMode: function (mode) {
      state.ui.mode = mode === 'free' ? 'free' : 'guided';
      this.signature = '';
      this.render();
    },

    go: function (index) {
      state.ui.guideStep = Math.max(0, Math.min(2, index));
      this.signature = '';
      this.render();
    },

    steps: function () {
      var leds = Circuit.getLeds();
      var onD8 = Circuit.ledOnPin('D8');
      var verified = !!Program.getAnalysis();
      var running = Simulator.isRunning();
      var pin = examplePin(leds); // mismo pin que usará «Cargar ejemplo para mi LED»
      return [
        {
          title: 'Paso 1. Conecta tu LED',
          short: 'Conecta',
          main: 'Ve a «Conecta tus LEDs» y conecta un LED. Te recomendamos el pin D8.',
          more: ['Elige un color y un pin, y presiona «Conectar LED».',
            'Tu código y tus conexiones se conservan cuando cambias de sección.'],
          actions: [{ link: '#conecta', label: 'Ir a Conecta', short: 'Ir a Conecta' }],
          done: leds.length > 0,
          doneText: onD8 ? 'Listo: tienes un LED en el pin D8.' : 'Listo: ya tienes ' + (leds.length === 1 ? '1 LED conectado' : leds.length + ' LEDs conectados') + '.',
          pendingText: 'Pendiente: todavía no hay LEDs conectados.'
        },
        {
          title: 'Paso 2. Prepara tu código',
          short: 'Prepara',
          main: leds.length
            ? 'Carga el ejemplo para tu LED del pin D' + pin + ' y presiona «Verificar código».'
            : 'Carga el ejemplo y presiona «Verificar código». Usará el pin D8.',
          more: (leds.length ? [] : ['Conecta un LED en el pin D8 para verlo funcionar.']).concat([
            'pinMode(' + pin + ', OUTPUT) prepara el pin ' + pin + ' como salida.',
            'digitalWrite(' + pin + ', HIGH) enciende el LED y digitalWrite(' + pin + ', LOW) lo apaga.',
            'delay(500) espera medio segundo antes de seguir.']),
          actions: [{ action: 'example', label: 'Cargar ejemplo para mi LED', short: 'Cargar ejemplo' }, { action: 'verify', label: 'Verificar código', short: 'Verificar' }],
          done: verified,
          doneText: 'Listo: tu código está verificado.',
          pendingText: 'Pendiente: verifica tu código.'
        },
        {
          title: 'Paso 3. Ejecuta y observa',
          short: 'Ejecuta',
          main: 'Presiona «Ejecutar» y observa tu LED en «Arduino virtual».',
          more: ['«Detener» apaga todo y «Reiniciar» empieza otra vez desde setup().',
            'Para cambiar la velocidad, cambia el número de delay(): con delay(200) parpadea más rápido y con delay(1000) más lento. Luego verifica y ejecuta de nuevo.'],
          actions: [{ action: 'run', label: 'Ejecutar', short: 'Ejecutar' }],
          done: running,
          doneText: 'Listo: tu programa está funcionando.',
          pendingText: verified ? 'Pendiente: presiona «Ejecutar».' : 'Pendiente: primero verifica tu código (paso 2).'
        }
      ];
    },

    render: function () {
      if (!this.ready) { return; }
      var els = this.els;
      var guided = state.ui.mode === 'guided';
      els['mode-guided'].setAttribute('aria-pressed', guided ? 'true' : 'false');
      els['mode-free'].setAttribute('aria-pressed', guided ? 'false' : 'true');
      els['guide-steps'].hidden = !guided;
      els['guide-progress'].hidden = !guided;
      els['free-help'].hidden = guided;
      if (!guided) { return; }

      var steps = this.steps();
      var index = state.ui.guideStep;
      var step = steps[index];
      // Solo se reconstruye (y se anuncia) si cambió algo visible.
      var signature = index + '|' + steps.map(function (s) { return s.done ? 1 : 0; }).join('') + '|' +
        step.main + step.more.join('') + (step.done ? step.doneText : step.pendingText);
      if (signature === this.signature) { return; }
      this.signature = signature;

      // Mantener abierto «Más información» si el estudiante lo abrió en este paso.
      var oldMore = els['guide-step'].querySelector('.guide__more');
      var keepOpen = oldMore && oldMore.open && this.lastIndex === index;
      this.lastIndex = index;

      var progress = els['guide-progress'];
      clearEl(progress);
      steps.forEach(function (s, i) {
        var li = document.createElement('li');
        li.className = 'guide__dot' + (s.done ? ' is-done' : '') + (i === index ? ' is-current' : '');
        if (i === index) { li.setAttribute('aria-current', 'step'); }
        var mark = document.createElement('span');
        mark.className = 'guide__mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = s.done ? '✓' : String(i + 1);
        var name = document.createElement('span');
        name.className = 'guide__name';
        name.textContent = s.short;
        var sr = document.createElement('span');
        sr.className = 'visually-hidden';
        sr.textContent = 'Paso ' + (i + 1) + ': ' + (s.done ? 'completado. ' : 'pendiente. ');
        li.appendChild(sr);
        li.appendChild(mark);
        li.appendChild(name);
        progress.appendChild(li);
      });

      var box = els['guide-step'];
      clearEl(box);
      var h = document.createElement('h3');
      h.className = 'guide__title';
      h.textContent = step.title;
      box.appendChild(h);
      var main = document.createElement('p');
      main.className = 'guide__main';
      main.textContent = step.main;
      box.appendChild(main);

      var row = document.createElement('div');
      row.className = 'guide__row';
      var status = document.createElement('p');
      status.className = 'guide__status' + (step.done ? ' is-done' : '');
      status.textContent = (step.done ? '✓ ' : '• ') + (step.done ? step.doneText : step.pendingText);
      row.appendChild(status);
      var actions = document.createElement('div');
      actions.className = 'guide__actions';
      step.actions.forEach(function (a) {
        var el;
        if (a.link) {
          el = document.createElement('a');
          el.href = a.link;
        } else {
          el = document.createElement('button');
          el.type = 'button';
          el.setAttribute('data-guide-action', a.action);
        }
        el.className = 'btn btn--ghost';
        if (a.short && a.short !== a.label) {
          // Texto corto visible en pantallas pequeñas; el nombre accesible es siempre el completo.
          el.setAttribute('aria-label', a.label);
          var long = document.createElement('span');
          long.className = 'lbl-long';
          long.textContent = a.label;
          var shortLabel = document.createElement('span');
          shortLabel.className = 'lbl-short';
          shortLabel.setAttribute('aria-hidden', 'true');
          shortLabel.textContent = a.short;
          el.appendChild(long);
          el.appendChild(shortLabel);
        } else {
          el.textContent = a.label;
        }
        actions.appendChild(el);
      });
      row.appendChild(actions);
      box.appendChild(row);

      // «Más información» comparte la fila del estado y las acciones para ahorrar espacio.
      var more = document.createElement('details');
      more.className = 'guide__more';
      if (keepOpen) { more.open = true; }
      var summary = document.createElement('summary');
      summary.textContent = 'Más información';
      more.appendChild(summary);
      var list = document.createElement('ul');
      list.className = 'tips';
      step.more.forEach(function (text) {
        var li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
      more.appendChild(list);
      row.appendChild(more);

      els['guide-prev'].disabled = index === 0;
      els['guide-next'].disabled = index === steps.length - 1;
    }
  };

  /* ---------- Preparación de vistas (contenido estático) ---------- */
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
    renderPinOptions();
    Explorer.init();
    BoardZoom.init();
    ConnectView.init();
    CircuitView.init();
    ProgramLedsView.init();
    Program.init();
    Indicators.init();
    SimView.init();
    Guide.init();
    Router.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
