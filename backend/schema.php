<?php

function createSchema(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha TEXT NOT NULL,
            cargo TEXT NOT NULL DEFAULT 'Administrador',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS settings (
            chave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            sku TEXT NOT NULL,
            qtd INTEGER NOT NULL DEFAULT 0,
            min INTEGER NOT NULL DEFAULT 0,
            preco REAL NOT NULL DEFAULT 0.0,
            vendas_dia REAL NOT NULL DEFAULT 0.0,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente TEXT NOT NULL,
            total REAL NOT NULL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'aberto',
            data TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS pedido_itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER NOT NULL,
            produto_id INTEGER,
            nome TEXT NOT NULL,
            qtd INTEGER NOT NULL,
            preco REAL NOT NULL,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            num TEXT NOT NULL UNIQUE,
            pedido_id INTEGER,
            data TEXT NOT NULL,
            cliente TEXT NOT NULL,
            total REAL NOT NULL,
            icms REAL NOT NULL,
            chave TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS app_states (
            user_id INTEGER NOT NULL,
            app_key TEXT NOT NULL CHECK (app_key IN ('legacy', 'modular')),
            revision INTEGER NOT NULL DEFAULT 1,
            payload TEXT NOT NULL,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, app_key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL UNIQUE,
            origem TEXT NOT NULL,
            nome TEXT NOT NULL,
            email TEXT,
            whatsapp TEXT NOT NULL,
            dados TEXT NOT NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS marketplace_order_requests (
            request_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            channel TEXT NOT NULL,
            order_id TEXT NOT NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS marketplace_request_limits (
            ip_hash TEXT NOT NULL,
            criado_em INTEGER NOT NULL
        );
    ");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_marketplace_limits_time ON marketplace_request_limits (criado_em);');
}