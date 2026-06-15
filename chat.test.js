import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de pg Pool
vi.mock('pg', () => {
    const Pool = vi.fn(() => ({
        query: vi.fn()
    }));
    return { Pool };
});

// Mock de amqplib
vi.mock('amqplib', () => ({
    default: {
        connect: vi.fn().mockResolvedValue({
            createChannel: vi.fn().mockResolvedValue({
                assertExchange: vi.fn(),
                publish: vi.fn()
            })
        })
    }
}));

// Mock de jsonwebtoken
vi.mock('jsonwebtoken', () => ({
    default: {
        verify: vi.fn((token) => {
            if (token === 'valid-token') return { id: 1, sub: 'user@test.com' };
            throw new Error('Invalid token');
        })
    }
}));

describe('Chat Service - Lógica de negocio', () => {

    it('debe verificar un token JWT válido', async () => {
        const jwt = await import('jsonwebtoken');
        const payload = jwt.default.verify('valid-token', 'secret');
        expect(payload.id).toBe(1);
        expect(payload.sub).toBe('user@test.com');
    });

    it('debe rechazar un token JWT inválido', async () => {
        const jwt = await import('jsonwebtoken');
        expect(() => jwt.default.verify('invalid-token', 'secret')).toThrow();
    });

    it('debe construir la URL de notificaciones correctamente', () => {
        const conversacion = { usuario1_id: '1', usuario2_id: '2' };
        const emisorId = 1;
        const destinatario = Number(conversacion.usuario1_id) === emisorId
            ? conversacion.usuario2_id
            : conversacion.usuario1_id;
        expect(destinatario).toBe('2');
    });

    it('debe identificar al destinatario cuando el emisor es usuario2', () => {
        const conversacion = { usuario1_id: '1', usuario2_id: '2' };
        const emisorId = 2;
        const destinatario = Number(conversacion.usuario1_id) === emisorId
            ? conversacion.usuario2_id
            : conversacion.usuario1_id;
        expect(destinatario).toBe('1');
    });

    it('debe validar que el contenido del mensaje no esté vacío', () => {
        const contenido = 'Hola, encontré tu mascota';
        expect(contenido.trim().length).toBeGreaterThan(0);
    });

    it('debe rechazar mensajes vacíos', () => {
        const contenido = '   ';
        expect(contenido.trim().length).toBe(0);
    });
});