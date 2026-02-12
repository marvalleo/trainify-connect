---
description: Re-autenticar con NotebookLM MCP para recuperar acceso a las libretas.
---

Este flujo de trabajo permite restaurar la conexión con NotebookLM si el token ha expirado.

1. Cerrar cualquier ventana de Chrome de autenticación previa si estuviera abierta.
// turbo
2. Ejecutar el comando de autenticación:
`C:\Users\MIPC\AppData\Roaming\Python\Python314\Scripts\notebooklm-mcp-auth.exe`
3. El usuario debe iniciar sesión en la ventana de Chrome que aparece.
4. Una vez cerrada la ventana, ejecutar:
`notebooklm-mcp-refresh-auth` (vía herramienta interna del asistente)
