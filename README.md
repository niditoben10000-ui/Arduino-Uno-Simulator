# Arduino Uno Simulator

Aplicación web educativa para estudiantes de quinto grado de primaria (≈10 años). Permite **conocer** las partes de un Arduino Uno R3, **conectar** hasta tres LEDs virtuales y **programarlos** con un subconjunto simplificado del lenguaje de Arduino, observando el resultado en una simulación visual.

- **Aplicación publicada:** https://niditoben10000-ui.github.io/Arduino-Uno-Simulator/
- **Repositorio:** https://github.com/niditoben10000-ui/Arduino-Uno-Simulator
- **Video tutorial:** https://youtu.be/4kLnzn9rl9g

## Alcance técnico

- Es una **aplicación web estática que se ejecuta por completo en el navegador**.
- **No tiene backend**, base de datos, cuentas de usuario ni comunicación con placas Arduino físicas.
- El código y las conexiones se conservan mientras la página está abierta y se pierden al recargarla.
- Lo único que se guarda de forma permanente es una marca en `localStorage` que indica que ya se respondió la ventana de bienvenida (ver más abajo). No se guardan datos personales.
- No realiza solicitudes de red ni usa servicios externos; funciona sin conexión una vez descargados sus archivos. El video tutorial es un enlace externo a YouTube que solo se abre si el estudiante lo elige. No hay un reproductor integrado y nada se descarga.

## Tecnologías

- HTML5 semántico, CSS3 y JavaScript *vanilla* (sintaxis ES5, sin módulos; usa APIs actuales del navegador como `closest`, `classList` y `ResizeObserver`).
- Requiere un navegador actual (Firefox, Chrome, Edge o Safari recientes). El CSS usa `:has()` y `color-mix()`.
- SVG en línea para la tarjeta Arduino y los circuitos.
- Sin frameworks, paquetes npm, CDN, compiladores ni herramientas de construcción.

## Estructura de archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Punto de entrada. Cabecera con el menú y las cuatro vistas (Inicio, Conoce, Conecta, Programa) montadas en el DOM. Incluye el SVG de la tarjeta y la ventana de bienvenida (`<dialog>`). |
| `style.css` | Estilos organizados por secciones, variables de color (`:root`), diseño adaptable y `prefers-reduced-motion`. |
| `script.js` | Toda la lógica, dentro de una función autoejecutable (sin variables globales). |
| `README.md` | Esta documentación. |

`index.html` carga `style.css?v=a7` y `script.js?v=a7`. El parámetro `v` obliga al navegador a descargar los archivos nuevos en cada entrega; **debe cambiarse cada vez que se modifiquen `style.css` o `script.js`**.

## Cómo abrirla localmente

- Doble clic en `index.html` (funciona con `file://`), o
- desde la carpeta del proyecto: `python3 -m http.server 8000` y abrir `http://localhost:8000`.

## Publicación en GitHub Pages

La aplicación está **publicada y activa** en https://niditoben10000-ui.github.io/Arduino-Uno-Simulator/, desde la rama `main`, carpeta raíz (*Settings → Pages → Deploy from a branch → main / (root)*). Cada entrega nueva se publica solo después de que el usuario la aprueba.

Por qué funciona en alojamiento estático:

- `index.html` está en la raíz y es el punto de entrada.
- Todas las rutas son relativas (`style.css`, `script.js`); no hay rutas absolutas ni recursos externos.
- La navegación usa el *hash* de la URL (`#inicio`, `#conoce`, `#conecta`, `#programa`), por lo que funciona bajo la subruta de un repositorio (`https://usuario.github.io/Arduino-Uno-Simulator/`) sin configuración de servidor.
- No requiere permisos del navegador ni un contexto especial: funciona igual con HTTPS.
- El enlace al video es una URL absoluta externa (`https://youtu.be/4kLnzn9rl9g`); no depende de la ruta de publicación.

## Arquitectura

### Estado compartido (`state`)

Un único objeto es la fuente de verdad; las vistas se dibujan a partir de él:

| Propiedad | Uso |
|---|---|
| `currentView` | Vista visible. |
| `explorer` | Componente y subparte seleccionados en Conoce. |
| `leds`, `ledSeq` | LEDs conectados y contador de identificadores internos. |
| `program` | Código del editor, último análisis, código analizado y marca de desactualizado. |
| `sim` | Estado de la simulación, pines D2–D13 (`HIGH`/`LOW`), instrucción en curso y mensajes. |
| `board` | Indicadores de la tarjeta: ON, L, RX, TX. |
| `ui` | Modo de trabajo (`guided`/`free`) y paso del modo guiado. |

Los cambios se comunican con suscripciones simples: `Circuit.onChange` (conexiones), `Circuit.onLedState` (encendido/apagado) y `Simulator.onChange` (simulación).

### Navegación SPA (`Router`)

- Las cuatro vistas permanecen en el DOM; la inactiva lleva `hidden`, así no recibe foco de teclado.
- `hashchange` cambia la vista sin recargar el documento; el botón «Atrás» del navegador funciona.
- Al cambiar de vista se marca el enlace activo (`aria-current="page"`) y el foco pasa al título.

### Representación del Arduino Uno R3 (Conoce)

- Modelo representado: **Arduino Uno R3 con ATmega328P en encapsulado DIP**.
- Las posiciones y tamaños provienen del diseño oficial EAGLE `UNO-TH_Rev3e.brd` (Arduino): `X = x_mm × 9,52`, `Y = (53,34 − y_mm) × 9,52`. Las piezas se identificaron con el esquema `UNO-TH_Rev3e.sch`.
- Los 13 grupos (`COMPONENTS`) tienen, por cada pieza, una forma física (`shape`, usada para resaltar) y un área táctil más grande (`hit`). Los grupos ICSP, LEDs y jack/diodo tienen subpartes.
- Se puede seleccionar con clic o toque (zonas, números y etiquetas), con el teclado (Tab y flechas; patrón *radiogroup*) y desde la lista textual de componentes.
- En pantallas de menos de 600 px se ofrece «Ampliar tarjeta» (×1,5–2) dentro de un recuadro desplazable.

### Modelo de conexiones de LEDs (Conecta)

- Cada LED: `{ id, color, pin, resistorOhms: 220, groundPin: 'GND_D', on }`.
- Hasta 3 LEDs, pines D2–D13, un LED por pin. Colores: rojo, verde, amarillo y azul.
- `id` (`led-N`) es interno, único y nunca se reutiliza. El número visible («LED 1», «LED 2»…) se calcula por la posición actual en la lista.
- El circuito es un **esquema simplificado**: pin → resistencia de 220 Ω → ánodo (+) → cátodo (−) → línea común de GND → pin GND del conector digital.

### Analizador de código (`ArduinoParser`)

- Es una función pura: recibe el texto y devuelve un resultado. No usa `eval()` ni `new Function()` y nunca ejecuta el texto del estudiante.
- Funciona en tres etapas: un tokenizador con número de línea, un analizador recursivo (`void setup()` y `void loop()`) y una revisión semántica.
- Lenguaje admitido: `pinMode(pin, OUTPUT);`, `digitalWrite(pin, HIGH|LOW);`, `delay(ms);` y comentarios `//`.
- Pines enteros 2–13 y `delay` entero de 0 a 60000 ms.
- No admite variables, `for`, `if`, otras funciones ni bibliotecas: se rechazan con un mensaje educativo.
- Límites: 3000 caracteres y 150 líneas.
- Resultado: `{ success, setupActions, loopActions, errors, warnings, pins, instructionCount }`. Cada acción conserva su número de línea.
- `Program.getAnalysis()` entrega solo el último análisis correcto y vigente. Si se edita el código o se cambian las conexiones, el análisis queda desactualizado.

### Motor de simulación (`Simulator`)

- Recorre las acciones ya analizadas: una animación educativa de RX/TX, luego `setup()` una vez y después `loop()` repetidamente.
- Usa un solo temporizador (`setTimeout`) y solo espera en `delay()`.
- Cada ejecución tiene un `runId`. Detener, Reiniciar o un nuevo inicio lo incrementan y cancelan la espera pendiente, así que una tarea antigua no puede modificar los LEDs.
- Si una vuelta de `loop()` espera menos de 20 ms (sin `delay`, con `delay(0)` o con `loop()` vacía), se completa una pausa de 20 ms. Además, nunca se ejecutan más de 500 acciones seguidas sin ceder el control. Así el navegador no se bloquea.
- `digitalWrite` cambia el pin, y los LEDs se buscan por pin, nunca por su número visible. D13 controla también el LED L; ON está siempre encendido; RX y TX no responden al código.
- Editar el código o cambiar las conexiones durante la ejecución la detiene. Cambiar de sección no la detiene.

### Ventana de bienvenida y video tutorial (`Welcome`)

- **Cuándo aparece:** en la primera visita se abre una ventana centrada, «¡Bienvenido a Arduino Uno Simulator!». Usa el elemento nativo `<dialog>` con `showModal()`: un fondo semitransparente cubre la página y el resto de la aplicación queda inactivo (`inert`) hasta responder.
- **Cómo se cierra:** solo con sus dos opciones. Escape no la cierra (se bloquean `cancel` y `keydown`), un clic fuera tampoco (`closedby="none"`) y no hay botón X. Si el navegador la cerrara sin respuesta, se vuelve a abrir. El foco empieza en «Ver video tutorial» y, al cerrar, pasa al título de la vista actual.
- **«Ver video tutorial»:** es un enlace real a `https://youtu.be/4kLnzn9rl9g` con `target="_blank"` y `rel="noopener noreferrer"`. YouTube se abre en otra pestaña y el simulador queda abierto en la original. La ventana se cierra y se guarda la respuesta. No se usa `window.location`, no hay reproductor integrado y no hay reproducción automática.
- **«Omitir»:** cierra la ventana y guarda la respuesta. No cambia el código, los LEDs ni la simulación.
- **Cómo se recuerda la decisión:**
  - Se guarda la clave `arduino-simulator-tutorial-seen` con el valor `"true"` en `localStorage`. No se guarda nada más.
  - La ventana no vuelve a aparecer al recargar ni al cerrar y abrir el navegador, siempre que sea el mismo navegador y el mismo perfil.
  - En otro navegador, en otro perfil, en una ventana privada o si se borran los datos del sitio, vuelve a aparecer.
  - Si el navegador bloquea `localStorage`, el error se ignora (`try/catch`): la ventana se puede cerrar igual, pero aparecerá otra vez en la siguiente carga.
  - Para verla de nuevo en una prueba, borra los datos del sitio o ejecuta `localStorage.removeItem('arduino-simulator-tutorial-seen')` en la consola.
- **Acceso permanente:** en Inicio, junto a «Empezar a explorar», el enlace «Ver tutorial» abre el mismo video en otra pestaña en cualquier visita. No reactiva la ventana y no agrega una sección al menú.

### Modo guiado y modo libre

- El panel «Cómo quieres trabajar» está encima del editor.
- El modo guiado tiene tres pasos: Conecta tu LED, Prepara tu código, y Ejecuta y observa. Cada paso se marca como completado según el estado real de la aplicación.
- Las explicaciones usan el pin del primer LED conectado, el mismo que usa el ejemplo.
- Ambos modos usan el mismo motor.

## Qué se simula y qué ocurre en un Arduino físico

| En el simulador | En un Arduino Uno físico |
|---|---|
| El programa se analiza en el navegador; no se compila. | El código C++ se compila y se carga en la memoria del ATmega328P. |
| Solo se admiten `pinMode(…, OUTPUT)`, `digitalWrite` y `delay`. | Está disponible todo el lenguaje Arduino/C++ y sus bibliotecas. |
| RX y TX hacen una breve animación educativa al iniciar. | RX y TX parpadean con la comunicación USB real, por ejemplo al cargar un programa. |
| ON está siempre encendido mientras la página está abierta. | ON se enciende cuando la placa recibe alimentación. |
| Los LEDs se encienden o apagan según el estado HIGH o LOW, sin corriente ni brillo variable. | El brillo depende de la corriente, el LED y la resistencia. |
| Sin `delay`, el simulador intercala una pausa mínima de 20 ms. | Sin `delay`, el pin cambia miles de veces por segundo y el LED se ve atenuado. |
| `delay` usa temporizadores del navegador, que pueden retrasarse si la pestaña está en segundo plano. | `delay` lo mide el reloj de 16 MHz de la placa. |
| El circuito es un esquema simplificado y no hay errores eléctricos posibles. | Una conexión incorrecta puede dañar un LED o un pin. |
| El botón RESET de la tarjeta solo se explica; para reiniciar se usa el botón «Reiniciar». | RESET reinicia el microcontrolador. |

## Accesibilidad

- Todos los controles se pueden usar con el teclado y tienen nombre accesible. Hay un enlace «Saltar al contenido».
- El foco es visible (`:focus-visible`).
- Los estados se comunican con texto e iconos, no solo con color: ✓, ▶, ■, !, «Encendido» o «Apagado», y «Pendiente» o «Listo».
- Hay regiones `aria-live` para los mensajes, se respeta `prefers-reduced-motion` y los controles miden al menos 44 px.
- La ventana de bienvenida tiene título y descripción accesibles (`aria-labelledby`, `aria-describedby`). Los enlaces al video avisan «se abre en otra pestaña» a los lectores de pantalla. La ventana no depende de animaciones: con movimiento reducido no se anima y, sin animación, igual se ve.

## Nombres visibles de la interfaz (referencia para el manual de usuario)

- **Menú:** Inicio, Conoce, Conecta, Programa.
- **Ventana de bienvenida (primera visita):** «¡Bienvenido a Arduino Uno Simulator!», «Ver video tutorial» y «Omitir».
- **Inicio:** «Empezar a explorar», «Ver tutorial» y las tarjetas «Conoce tu Arduino», «Conecta tus LEDs» y «Programa tus LEDs».
- **Conoce tu Arduino Uno:** «Anterior», «Siguiente», el contador «N de 13», «Ocultar lista» / «Ver todos», «Mostrar números en la tarjeta», «Ampliar tarjeta» / «Vista normal» (solo en pantallas pequeñas) y «Todo el grupo» más las subpartes en el panel «Información».
- **Conecta tus LEDs:** «Color del LED», «Pin digital», «Conectar LED», «Quitar LED», el contador «N de 3 LEDs» y la sección «Ayuda» con el glosario.
- **Programa tus LEDs:**
  - Modos y guía: «Modo guiado» / «Modo libre», «Paso anterior» / «Siguiente paso», «Ir a Conecta», «Cargar ejemplo para mi LED», «Más información».
  - Editor: «Ejemplo», «Cargar ejemplo», «Verificar código», «Limpiar código».
  - Simulación: «Ejecutar», «Detener», «Reiniciar» y el estado (Listo, Ejecutando, Detenido, Requiere verificación).
  - Paneles: «Arduino virtual» y «Mensajes», con el botón «Ir a la línea N» en cada error.
- **En pantallas de 420 px o menos** algunos botones muestran textos cortos («Guiado», «Libre», «‹ Anterior», «Siguiente ›», «Cargar ejemplo», «Verificar»). Su nombre accesible sigue siendo el completo.

## Capturas sugeridas para el manual de usuario

1. **Inicio:**
   - Ventana de bienvenida en la primera visita, en computador y en celular.
   - Pantalla completa con «Ver tutorial» y las tres tarjetas.
2. **Componentes del Arduino:** «Conoce tu Arduino Uno» sin selección, con los números visibles.
3. **Selección de componentes:**
   - ATmega328P seleccionado (grupo 8), con el panel «Información».
   - Grupo 13 con la subparte «LED L».
   - En celular, la «Vista normal» después de «Ampliar tarjeta».
4. **Conexión de LEDs:**
   - Formulario con un color elegido y el pin D8.
   - Mensaje «¡Muy bien! Conectaste un LED rojo al pin D8…».
   - Esquema con dos o tres LEDs y la lista de conexiones.
5. **Ejemplos de código:** selector «Ejemplo» con el «Ejemplo 1: parpadeo del LED L» cargado.
6. **Verificación:** panel «Mensajes» con «¡Muy bien! Tu programa está correctamente escrito…», los pines utilizados y «¿Qué hará tu programa?».
7. **Mensajes de error:** un punto y coma eliminado, mostrando «Línea N: parece que olvidaste el punto y coma (;).», la línea marcada en rojo y «Ir a la línea N».
8. **Simulación activa:**
   - Estado «Ejecutando», un LED externo encendido y el LED L encendido en «LEDs de la tarjeta».
   - El mismo momento en «Conecta tus LEDs».
9. **Modos guiado y libre:**
   - Panel en el paso 1 pendiente.
   - Paso 2 con «Más información» abierto.
   - Paso 3 completado.
   - «Modo libre».

## Créditos de las referencias técnicas

Las posiciones de los componentes se basan en el diseño de referencia del Arduino Uno Rev3 publicado por Arduino (`UNO-TH_Rev3e-reference.zip`, licencia CC BY-SA), en el diagrama de pines A000066 y en la hoja de datos A000066.
