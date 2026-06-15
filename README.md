# SS-Chat-Service

Microservicio de mensajería en tiempo real para la plataforma **Sanos & Salvos**. Desarrollado en **Node.js** con Express y Socket.io.

## Tecnologías

- Node.js + Express
- Socket.io (WebSocket en tiempo real)
- PostgreSQL (Supabase)
- RabbitMQ (CloudAMQP)
- JWT para autenticación

## Endpoints REST

| Método | Endpoint                                | Descripción                          |
| ------ | --------------------------------------- | ------------------------------------ |
| GET    | /api/v1/chat/conversaciones/{usuarioId} | Obtener conversaciones de un usuario |
| GET    | /api/v1/chat/mensajes/{conversacionId}  | Obtener mensajes de una conversación |
| POST   | /api/v1/chat/conversaciones             | Crear nueva conversación             |
| GET    | /actuator/health                        | Health check del servicio            |

## WebSocket

Conexión: `wss://ss-chat-service.onrender.com`

| Evento                | Dirección          | Descripción                       |
| --------------------- | ------------------ | --------------------------------- |
| `unirse_conversacion` | Cliente → Servidor | Unirse a una sala de chat         |
| `enviar_mensaje`      | Cliente → Servidor | Enviar un mensaje                 |
| `nuevo_mensaje`       | Servidor → Cliente | Recibir un mensaje en tiempo real |

## Instalación y ejecución local

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm start

# Ejecutar tests
npm test
```

## Variables de entorno

PORT=3001

DB_URL=postgresql://...

JWT_SECRET=...

RABBITMQ_HOST=...

RABBITMQ_PORT=5672

RABBITMQ_USERNAME=...

RABBITMQ_PASSWORD=...

RABBITMQ_VHOST=...

## Despliegue

Desplegado en **Render**: https://ss-chat-service.onrender.com
