<?php

function seedDefaultData(PDO $pdo): void {
    // Contas de exemplo, conferidas pelo e-mail: a conta do administrador WedTech pode já ter sido
    // criada pela migração dos perfis, e isso não pode impedir a criação da conta do lojista.
    $insertUser = $pdo->prepare("
        INSERT OR IGNORE INTO users (nome, email, senha, cargo)
        VALUES (:nome, :email, :senha, :cargo)
    ");
    $insertUser->execute([
        ':nome'  => 'Matheus',
        ':email' => 'admin@wedtech.com',
        ':senha' => password_hash('admin123', PASSWORD_DEFAULT),
        ':cargo' => 'Administrador',
    ]);
    $insertUser->execute([
        ':nome'  => 'Matheus Silva',
        ':email' => 'voce@suaempresa.com.br',
        ':senha' => password_hash('admin123', PASSWORD_DEFAULT),
        ':cargo' => 'Gerente de Estoque',
    ]);

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM produtos");
    $stmt->execute();
    if ($stmt->fetchColumn() == 0) {
        $insertProd = $pdo->prepare("
            INSERT INTO produtos (nome, sku, qtd, min, preco, vendas_dia)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $insertProd->execute(['Camiseta Básica', 'CAM-001', 42, 20, 59.90, 3.2]);
        $insertProd->execute(['Calça Jeans', 'CAL-002', 9, 15, 139.90, 1.8]);
        $insertProd->execute(['Tênis Urbano', 'TEN-003', 6, 10, 249.90, 1.1]);
        $insertProd->execute(['Boné', 'BON-004', 80, 15, 39.90, 0.6]);
    }
}