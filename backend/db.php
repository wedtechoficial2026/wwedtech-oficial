<?php
// Conexão e inicialização do banco de dados SQLite.

require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/relational_schema.php';
require_once __DIR__ . '/seeds.php';
require_once __DIR__ . '/consultor.php';

function getDb(): PDO {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dbFile = dirname(__DIR__) . '/database.sqlite';
    $isNew = !file_exists($dbFile);

    try {
        $pdo = new PDO('sqlite:' . $dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON;');
        $pdo->exec('PRAGMA journal_mode = WAL;');

        createSchema($pdo);
        createRelationalSchema($pdo);
        if ($isNew || filesize($dbFile) === 0) {
            seedDefaultData($pdo);
        }
        createConsultorSchema($pdo);

        return $pdo;
    } catch (PDOException $e) {
        die('Erro na conexão com o banco de dados: ' . htmlspecialchars($e->getMessage()));
    }
}
