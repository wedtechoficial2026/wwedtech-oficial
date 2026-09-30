<?php
// api/consultor.php - Área do consultor (perfis "consultor" e "admin").
// GET ?acao=pulso|resumo|lojas|loja&id=|contatos|chamados|chamado&id=|cotacoes|cotacao&id=|precos|consultores|historico|opcoes
// POST ?acao=criar_loja|atualizar_loja|redefinir_senha|contato|responder_chamado|criar_consultor|suporte_iniciar|suporte_encerrar
//          |calcular_cotacao|salvar_cotacao[&id=]|enviar_cotacao&id=|salvar_precos
require_once __DIR__ . '/_api.php';
require_once __DIR__ . '/../backend/app_state.php';

if (!is_logged_in()) {
    responder(['ok' => false, 'erro' => 'Faça login para continuar.'], 401);
}
$user = get_logged_user();
if (!isStaff($user)) {
    responder(['ok' => false, 'erro' => 'Área exclusiva dos consultores WedTech.'], 403);
}
$db = getDb();
$acao = (string)($_GET['acao'] ?? '');
$id = (int)($_GET['id'] ?? 0);

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $dados = match ($acao) {
            'pulso' => staffPulse($db, $user),
            'resumo' => staffOverview($db, $user),
            'lojas' => listStores($db, $user),
            'loja' => getStore($db, $user, $id),
            'contatos' => listLeads($db, $user),
            'chamados' => listTickets($db, $user),
            // Abrir o chamado marca as mensagens do lojista como lidas
            'chamado' => (static function () use ($db, $user, $id) { ticketForUser($db, $user, $id); markTicketSeen($db, $user, $id); return ticketForUser($db, $user, $id); })(),
            'cotacoes' => listQuotes($db, $user),
            'cotacao' => getQuote($db, $user, $id),
            'precos' => priceTable($db),
            'consultores' => isAdmin($user) ? listConsultants($db) : throw new DomainException('Só o administrador vê os consultores.'),
            'historico' => auditTrail($db, $user),
            'opcoes' => [
                'usuario' => ['nome' => $user['nome'], 'papel' => $user['papel']],
                'planos' => PLAN_NAMES,
                'limites_padrao' => PLAN_LIMITS,
                'modulos_padrao' => PLAN_MODULES,
                'modulos' => STORE_MODULES,
                'ramos' => STORE_TYPES,
                'situacoes' => STORE_STATUS,
                'etapas_contato' => LEAD_STATUS,
                'situacoes_chamado' => TICKET_STATUS,
                'situacoes_cotacao' => QUOTE_STATUS,
                'canais' => array_map(static fn($c) => ['nome' => $c[0], 'tipo' => $c[1]], QUOTE_CHANNELS),
                'canais_por_ramo' => QUOTE_CHANNELS_BY_TYPE,
                'precos' => priceTable($db),
                'consultores' => isAdmin($user) ? array_map(static fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome']], listConsultants($db)) : [],
            ],
            default => throw new InvalidArgumentException('Ação inválida.'),
        };
        responder(['ok' => true, 'dados' => $dados]);
    }

    exigir_metodo('POST');
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && strtolower((string)parse_url($origin, PHP_URL_HOST)) !== strtolower(explode(':', (string)($_SERVER['HTTP_HOST'] ?? ''))[0])) {
        responder(['ok' => false, 'erro' => 'Origem da solicitação inválida.'], 403);
    }
    $corpo = ler_corpo();
    $dados = match ($acao) {
        'criar_loja' => createStore($db, $user, $corpo),
        'atualizar_loja' => (static function () use ($db, $user, $id, $corpo) { updateStore($db, $user, $id, $corpo); return getStore($db, $user, $id); })(),
        'redefinir_senha' => resetStorePassword($db, $user, $id),
        'contato' => (static function () use ($db, $user, $id, $corpo) { updateLead($db, $user, $id, $corpo); return true; })(),
        'responder_chamado' => (static function () use ($db, $user, $id, $corpo) {
            replyTicket($db, $user, $id, (string)($corpo['texto'] ?? ''), isset($corpo['status']) && $corpo['status'] !== '' ? (string)$corpo['status'] : null);
            return ticketForUser($db, $user, $id);
        })(),
        'criar_consultor' => createConsultant($db, $user, $corpo),
        'suporte_iniciar' => (static function () use ($db, $user, $id) { startSupportMode($db, $user, $id); return ['redirect' => '../modulos/index.php?conta=equipe']; })(),
        'suporte_encerrar' => (static function () use ($db, $user) { endSupportMode($db, $user); return ['redirect' => '../consultor/index.php']; })(),
        'calcular_cotacao' => quoteCompute(priceTable($db), (array)($corpo['config'] ?? [])),
        'salvar_cotacao' => saveQuote($db, $user, $id, $corpo),
        'enviar_cotacao' => sendQuote($db, $user, $id),
        'salvar_precos' => savePriceTable($db, $user, $corpo),
        default => throw new InvalidArgumentException('Ação inválida.'),
    };
    responder(['ok' => true, 'dados' => $dados]);
} catch (InvalidArgumentException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 422);
} catch (DomainException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 403);
} catch (Throwable $e) {
    error_log('Falha na área do consultor: ' . $e->getMessage());
    responder(['ok' => false, 'erro' => 'Não foi possível concluir. Tente novamente.'], 500);
}
