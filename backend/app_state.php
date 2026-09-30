<?php

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/relational_store.php';

function loadAppState(PDO $db, int $userId, string $appKey): ?array {
    $stmt = $db->prepare(
        'SELECT revision, payload FROM app_states WHERE user_id = :user_id AND app_key = :app_key'
    );
    $stmt->execute([':user_id' => $userId, ':app_key' => $appKey]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $data = json_decode($row['payload'], true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data)) {
        throw new UnexpectedValueException('O estado salvo no banco está inválido.');
    }

    $revision = (int)$row['revision'];
    if ($appKey === 'modular' && function_exists('loadModularStateFromTables')) {
        createRelationalSchema($db);
        $relationalSync = $db->prepare("SELECT revision FROM relational_sync_state WHERE business_id = (SELECT id FROM businesses WHERE owner_user_id = ?) AND origem = 'modular'");
        $relationalSync->execute([$userId]);
        if ((int)$relationalSync->fetchColumn() >= $revision) {
            $data = loadModularStateFromTables($db, $userId, $data);
        }
    }
    if ($appKey === 'modular' && function_exists('applyBusinessContract')) {
        $data = applyBusinessContract($db, $userId, $data);
    }

    return ['revision' => $revision, 'data' => $data];
}

function saveAppState(PDO $db, int $userId, string $appKey, array $data, int $expectedRevision): array {
    $payload = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (strlen($payload) > 4 * 1024 * 1024) {
        throw new LengthException('O estado excede o limite permitido de 4 MB.');
    }

    $db->beginTransaction();
    try {
        $current = loadAppState($db, $userId, $appKey);
        if (($current['revision'] ?? 0) !== $expectedRevision) {
            $db->rollBack();
            return ['conflict' => true, 'state' => $current];
        }

        $nextRevision = $expectedRevision + 1;
        if ($current === null) {
            $stmt = $db->prepare(
                'INSERT INTO app_states (user_id, app_key, revision, payload) VALUES (:user_id, :app_key, :revision, :payload)'
            );
        } else {
            $stmt = $db->prepare(
                'UPDATE app_states SET revision = :revision, payload = :payload, atualizado_em = CURRENT_TIMESTAMP WHERE user_id = :user_id AND app_key = :app_key AND revision = :expected_revision'
            );
            $stmt->bindValue(':expected_revision', $expectedRevision, PDO::PARAM_INT);
        }

        $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':app_key', $appKey, PDO::PARAM_STR);
        $stmt->bindValue(':revision', $nextRevision, PDO::PARAM_INT);
        $stmt->bindValue(':payload', $payload, PDO::PARAM_STR);
        $stmt->execute();

        if ($appKey === 'modular') {
            syncModularTables($db, $userId, $data, $nextRevision, true);
        }

        if ($stmt->rowCount() !== 1) {
            $db->rollBack();
            return ['conflict' => true, 'state' => loadAppState($db, $userId, $appKey)];
        }

        $db->commit();
        return ['conflict' => false, 'revision' => $nextRevision];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}