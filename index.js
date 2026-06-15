require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: { rejectUnauthorized: false }
});

// Verificar JWT
const verificarToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return null;
    }
};

// Conexión RabbitMQ
let canalRabbit = null;

const conectarRabbitMQ = async () => {
    try {
        const conexion = await amqp.connect({
            hostname: process.env.RABBITMQ_HOST || 'gorilla.lmq.cloudamqp.com',
            port: process.env.RABBITMQ_PORT || 5672,
            username: process.env.RABBITMQ_USERNAME || 'wmjcvznb',
            password: process.env.RABBITMQ_PASSWORD || 'kajL4rdiURb0bd1U2X7dFt_FQlCGoYkR',
            vhost: process.env.RABBITMQ_VHOST || 'wmjcvznb'
        });
        canalRabbit = await conexion.createChannel();
        await canalRabbit.assertExchange('exchange.publicaciones', 'direct', { durable: true });
        console.log('RabbitMQ conectado desde Chat-Service');
    } catch (err) {
        console.error('Error conectando a RabbitMQ:', err.message);
    }
};

const publicarNotificacion = async (usuarioId, mensaje) => {
    if (!canalRabbit) return;
    try {
        const evento = {
            usuarioId: usuarioId,
            publicacionId: null,
            mensaje: mensaje
        };
        canalRabbit.publish(
            'exchange.publicaciones',
            'publicacion.creada',
            Buffer.from(JSON.stringify(evento))
        );
    } catch (err) {
        console.error('Error publicando notificacion:', err.message);
    }
};

// ─── REST ENDPOINTS ───────────────────────────────────────────

app.get('/api/v1/chat/conversaciones/:usuarioId', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token requerido' });
    const token = authHeader.split(' ')[1];
    const payload = verificarToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const { usuarioId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM conversaciones 
             WHERE usuario1_id = $1 OR usuario2_id = $1 
             ORDER BY creada_en DESC`,
            [usuarioId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/v1/chat/mensajes/:conversacionId', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token requerido' });
    const token = authHeader.split(' ')[1];
    const payload = verificarToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const { conversacionId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM mensajes WHERE conversacion_id = $1 ORDER BY enviado_en ASC`,
            [conversacionId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/v1/chat/conversaciones', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Token requerido' });
    const token = authHeader.split(' ')[1];
    const payload = verificarToken(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido' });

    const { usuario1_id, usuario2_id, publicacion_id } = req.body;
    try {
        const existe = await pool.query(
            `SELECT * FROM conversaciones 
             WHERE (usuario1_id = $1 AND usuario2_id = $2) 
             OR (usuario1_id = $2 AND usuario2_id = $1)`,
            [usuario1_id, usuario2_id]
        );
        if (existe.rows.length > 0) return res.json(existe.rows[0]);

        const result = await pool.query(
            `INSERT INTO conversaciones (usuario1_id, usuario2_id, publicacion_id) 
             VALUES ($1, $2, $3) RETURNING *`,
            [usuario1_id, usuario2_id, publicacion_id || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/actuator/health', (req, res) => {
    res.json({ status: 'UP' });
});

// ─── WEBSOCKET ────────────────────────────────────────────────

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token requerido'));
    const payload = verificarToken(token);
    if (!payload) return next(new Error('Token inválido'));
    socket.usuarioId = payload.id;
    next();
});

io.on('connection', (socket) => {
    console.log(`Usuario ${socket.usuarioId} conectado al chat`);

    socket.on('unirse_conversacion', (conversacionId) => {
        socket.join(`conversacion_${conversacionId}`);
    });

    socket.on('enviar_mensaje', async (data) => {
        const { conversacion_id, contenido } = data;
        try {
            const result = await pool.query(
                `INSERT INTO mensajes (conversacion_id, emisor_id, contenido) 
                 VALUES ($1, $2, $3) RETURNING *`,
                [conversacion_id, socket.usuarioId, contenido]
            );
            const mensaje = result.rows[0];
            io.to(`conversacion_${conversacion_id}`).emit('nuevo_mensaje', mensaje);

            // Notificar al otro usuario via RabbitMQ
            const conv = await pool.query(
                `SELECT * FROM conversaciones WHERE id = $1`,
                [conversacion_id]
            );
            if (conv.rows.length > 0) {
                const conversacion = conv.rows[0];
                const destinatarioId = Number(conversacion.usuario1_id) === Number(socket.usuarioId)
                    ? conversacion.usuario2_id
                    : conversacion.usuario1_id;

                await publicarNotificacion(
                    destinatarioId,
                    `Tienes un nuevo mensaje en el chat`
                );
            }
        } catch (err) {
            socket.emit('error_mensaje', { error: err.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuario ${socket.usuarioId} desconectado`);
    });
});

// ─── INICIAR SERVIDOR ─────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
    console.log(`SS-Chat-Service corriendo en puerto ${PORT}`);
    await conectarRabbitMQ();
});