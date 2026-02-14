# System Patterns

## Arquitectura
La aplicación es una Single Page Application (SPA) basada en vanilla HTML, CSS y JavaScript.

## Patrones de Código
- **Estado Global**: Se maneja a través de las variables `exercises` y `records`, sincronizadas con `localStorage`.
- **Renderizado Dinámico**: La función `renderExercises()` genera el DOM basado en el estado actual y la categoría seleccionada.
- **Persistencia**: Se utiliza `localStorage` para almacenamiento inmediato. La exportación/importación JSON sirve como backup manual.
- **Gráficas**: Implementación de Chart.js para visualización de datos de forma reactiva al desplegar contenedores.

## Estándares de Estilo
- **CSS**: Uso de Tailwind CSS (CDN) para el diseño base.
- **Temas**: Esquema de colores oscuro (`bg-slate-950`) con acentos en azul (Carga) y púrpura (Volumen).

## Idioma y Comunicación
- **Documentación**: Todos los archivos del Memory Bank, planes de implementación y tareas deben mantenerse en **Español**.
- **Interfaz**: La interfaz de usuario principal debe estar en **Español**.
