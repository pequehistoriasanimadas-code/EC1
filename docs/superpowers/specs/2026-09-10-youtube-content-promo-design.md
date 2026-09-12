# Lab.27 — Promo de YouTube para Contenidos

## Objetivo

Agregar a **Contenidos / Anuncios** una promo visual opcional para cada contenido de video. La promo toma los metadatos públicos de un video de YouTube vinculado al contenido y aparece únicamente durante los últimos segundos de ese contenido en Output.

La función no debe modificar el comportamiento de Noticias, Anuncios, Standby, NDI, Output LAN ni la programación manual existente de contenidos.

## UX de Contenidos

Toda la función vive únicamente en la pestaña **Contenidos / Anuncios**. No se agregan controles en Ajustes ni en Diseño de emisión.

La cabecera de Contenidos se compacta para contener, sin crear una tarjeta vertical adicional:

- Activar contenidos.
- Carpeta de contenidos + Cambiar/Actualizar.
- Intervalo de inserción.
- Promo YouTube ON/OFF.
- Tiempo global de aparición: 5 s, 7 s o 10 s.
- Botón `Actualizar YouTube` para refrescar todos los videos únicos del perfil.
- Estado discreto de última actualización.

La lista **Contenidos disponibles** conserva filas compactas y scroll interno de altura limitada para evitar que la página crezca indefinidamente.

Cada fila conserva obligatoriamente la acción existente para programar ese archivo como próximo contenido. La integración YouTube se añade sin reemplazar esa función.

Columnas/acciones conceptuales por fila:

- Nombre del archivo.
- Duración.
- Estado YouTube: `Vincular` o `Vinculado`.
- `Programar próximo` / estado `PRÓXIMO` con opción de cancelar.

Pulsar `Vincular` o `Vinculado` abre un modal. La fila no se expande.

## Modal de vínculo YouTube

El modal contiene:

- Campo URL de YouTube.
- Acción `Obtener datos` al vincular por primera vez.
- Miniatura.
- Título del video.
- Nombre del canal.
- Estado y antigüedad de los metadatos.
- Acción `Actualizar` para forzar la consulta inmediata de ese video.
- Guardar / Cancelar.

No se muestran visualizaciones ni fecha de publicación.

Si el mismo video de YouTube está vinculado a varios contenidos, el modal puede indicar de forma discreta que la ficha es compartida.

## Fuente de datos de YouTube

Usar **YouTube Data API v3** para obtener el `snippet` del video: título, canal y miniaturas. La consulta se realiza por `videoId`, no por URL completa.

Formatos de URL aceptados:

- `youtube.com/watch?v=...`
- `youtu.be/...`
- `youtube.com/shorts/...`
- `youtube.com/live/...`

La API Key de YouTube es una credencial global de la instalación, no parte del perfil exportable. Se configura desde la propia sección Contenidos mediante modal y se guarda cifrada usando el mecanismo existente de secretos de GEC. Nunca se exporta con perfiles.

## Caché y deduplicación

La unidad de caché es el `videoId` de YouTube.

Si varios contenidos usan el mismo `videoId`, GEC mantiene una sola ficha de metadatos y una sola miniatura local. Todos los contenidos apuntan a esa ficha.

La ficha contiene como mínimo:

- `videoId`
- URL canónica
- título
- nombre del canal
- ruta local de miniatura
- fecha/hora de última actualización correcta
- estado de disponibilidad

La miniatura se descarga y guarda localmente al obtener o actualizar datos. Durante una emisión no se consulta YouTube ni se depende de Internet.

## Política de actualización

1. Al vincular una URL nueva, GEC consulta YouTube inmediatamente.
2. `Actualizar` en el modal fuerza una consulta inmediata de ese `videoId`.
3. `Actualizar YouTube` revisa todos los `videoId` únicos del perfil, no cada contenido.
4. GEC realiza una actualización automática como máximo una vez cada 24 horas por `videoId`.
5. Abrir GEC varias veces dentro de esas 24 horas no genera consultas repetidas.
6. Si la actualización falla, se conservan los últimos datos válidos y la miniatura local existente.
7. Si un video pasa a privado, eliminado o temporalmente inaccesible, la ficha se marca como no disponible pero no se borra automáticamente la información válida anterior.
8. Si una actualización ocurre mientras un contenido está al aire, la reproducción actual usa un snapshot de los metadatos con los que comenzó; la información nueva se usa desde la siguiente emisión.

## Asociación contenido → YouTube

La asociación no debe depender únicamente de una ruta absoluta de Windows.

Cada contenido debe tener una identidad estable basada en la identidad disponible del archivo (huella/fingerprint cuando sea posible y fallback de nombre + tamaño + metadata estable). Esto permite conservar vínculos cuando el usuario reubica la carpeta o importa un perfil en otro equipo.

Los vínculos pertenecen al perfil activo.

## Perfiles y retrocompatibilidad

La configuración de promo YouTube y las asociaciones de contenidos se guardan dentro del perfil.

Un perfil nuevo conserva:

- ON/OFF de promo.
- Tiempo global 5/7/10 s.
- Asociaciones contenido → `videoId`.
- Copia de metadatos necesaria para reconstruir la experiencia.

La API Key nunca se exporta.

Perfiles antiguos que no contienen campos YouTube deben cargar sin error. El normalizador asigna valores por defecto:

- promo desactivada;
- tiempo 10 s;
- vínculos vacíos.

Compatibilidad obligatoria de importación hacia adelante:

- perfiles 0.3.x → Lab.27;
- Lab.25 → Lab.27;
- Lab.26 → Lab.27.

No se garantiza que una versión antigua de GEC comprenda perfiles exportados por Lab.27.

## Comportamiento en Output

La promo solo existe para ítems de tipo **CONTENIDO**.

Nunca debe mostrarse en:

- Noticias RSS.
- Notas generadas.
- Anuncios.
- Standby.
- Otro contenido antes de alcanzar su propio umbral.

Secuencia:

1. Inicia un contenido: promo oculta.
2. Cuando `remainingTime <= promoLeadSeconds`, si el contenido tiene vínculo válido y la función global está activa, ejecutar un **fade in**.
3. La promo permanece visible hasta el final del contenido.
4. No existe fade out.
5. Antes de abandonar el estado CONTENT, eliminar inmediatamente la promo.
6. Recién después se procesa transición o siguiente ítem.

La limpieza debe ejecutarse también en rutas excepcionales:

- botón Siguiente;
- stop/pause que abandone reproducción;
- error del video;
- contenido interrumpido;
- cierre/reapertura de Output;
- retorno a standby;
- cambio a anuncio/noticia/otro contenido.

Debe existir una única función defensiva de limpieza (`clearYouTubePromo` o equivalente) invocada por toda transición fuera de CONTENT.

## Diseño visual de la promo

Referencia aprobada: tarjeta compacta inferior, aproximadamente 35–40% del ancho útil y 14–17% de la altura de un Output 16:9, dentro de márgenes seguros.

Composición:

- Miniatura a la izquierda.
- A la derecha:
  - `Puedes ver el video aquí:`
  - título;
  - nombre del canal.

Sin visualizaciones, fecha, QR ni URL visible.

Entrada: fade in de aproximadamente 300–400 ms.
Salida: eliminación inmediata al finalizar/abandonar el contenido, sin fade out.

El video de fondo no se escala, mueve ni reduce para hacer espacio a la promo.

## Programación manual por contenido

Se preserva la capacidad existente de seleccionar un contenido específico como próximo elemento.

La selección manual tiene prioridad sobre la rotación automática. Una vez emitido el contenido seleccionado, GEC vuelve al ciclo automático normal.

Agregar YouTube no puede eliminar, ocultar ni degradar esta función.

## Arquitectura propuesta

Separar responsabilidades en componentes claros:

1. **YouTubeMetadataService**
   - valida URL;
   - extrae `videoId`;
   - llama YouTube Data API;
   - normaliza título/canal/miniatura;
   - descarga miniatura de forma atómica;
   - no conoce UI ni Output.

2. **YouTubePromoStore / profile integration**
   - asociaciones contenido → `videoId`;
   - caché por `videoId`;
   - timestamps de actualización;
   - migración/defaults de perfiles antiguos;
   - deduplicación.

3. **Contenido UI**
   - controles globales compactos;
   - modal de vínculo;
   - acciones de actualización;
   - mantiene `Programar próximo`.

4. **Output promo controller**
   - recibe snapshot de promo al iniciar contenido;
   - observa tiempo restante;
   - muestra una sola vez al cruzar umbral;
   - limpia al abandonar CONTENT;
   - no realiza llamadas de red.

## Manejo de errores

- URL inválida: no guardar vínculo.
- API Key ausente: mostrar `Configurar YouTube`; la reproducción de contenidos funciona normalmente sin promo.
- API Key inválida/cuota/error de red: conservar caché anterior; mostrar error no intrusivo en Contenidos.
- Miniatura no descargable: no reemplazar una miniatura válida existente.
- Archivo de contenido movido: intentar reconocerlo por identidad estable antes de considerar el vínculo perdido.
- Video YouTube no disponible: mantener datos guardados y marcar estado para revisión.

Ningún error de YouTube puede detener una emisión.

## Pruebas y regresiones obligatorias

### Unitarias / integración

- Parseo de formatos de URL de YouTube.
- Deduplicación por `videoId`.
- Un solo refresh para múltiples contenidos con el mismo video.
- TTL de 24 h.
- Refresh manual ignora TTL.
- Error de refresh conserva caché anterior.
- Perfil viejo sin campos YouTube normaliza sin error.
- Export/import conserva vínculos y no exporta API Key.
- Reubicación de carpeta mantiene asociaciones cuando se reconoce el mismo archivo.

### Output

- Promo aparece exactamente en CONTENT al alcanzar 5/7/10 s.
- Fade in único.
- Sin fade out.
- Limpieza antes de transición a noticia.
- Limpieza antes de transición a anuncio.
- Limpieza antes de standby.
- Limpieza al pulsar Siguiente.
- Limpieza en error/end anticipado.
- No aparece en Noticias, Anuncios o Standby.
- No se arrastra a otro contenido.
- Actualización de metadata durante emisión no altera la promo ya iniciada.

### Regresiones existentes

- Programar contenido específico como próximo sigue funcionando.
- Rotación automática y recuperación adaptativa siguen funcionando.
- Regla anuncio-después-de-contenido sigue funcionando.
- Exclusivas y contadores de sesión no cambian.
- NDI sigue reflejando exactamente el Output.
- Output LAN sigue reflejando exactamente el Output.
- Monitor local sigue reflejando Output.
- Música/standby/transiciones conservan comportamiento previo.
- Importación de perfiles 0.3.x/Lab.25/Lab.26 sin error.

## Criterio de terminado

Lab.27 solo se considera lista para entregar cuando:

- toda la matriz nueva y heredada pasa;
- CI Windows termina en verde;
- el Portable EXE se empaqueta correctamente;
- el arranque real empaquetado pasa;
- los artefactos se generan;
- no se observan regresiones en programación manual de contenidos, anuncios post-contenido, standby, NDI, LAN, perfiles ni cola.
