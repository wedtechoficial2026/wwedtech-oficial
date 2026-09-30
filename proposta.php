<?php
// proposta.php - Proposta comercial WedTech que o consultor envia ao cliente (link com código único).
// O cliente lê, imprime ou salva em PDF e aceita ou recusa sem precisar de login.
// ?t=<código>  ·  &imprimir=1 abre a janela de impressão  ·  POST resposta=aceitar|recusar
require_once __DIR__ . '/backend/db.php';

$db = getDb();
$token = (string)($_GET['t'] ?? '');
$feedback = '';
$feedbackOk = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $origin = ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? '');
        respondQuote($db, $token, (string)($_POST['resposta'] ?? ''), (string)($_POST['nome'] ?? ''), (string)($_POST['motivo'] ?? ''), $origin);
        // Depois de responder, volta para a proposta (recarregar a página não reenvia a resposta)
        header('Location: proposta.php?t=' . rawurlencode($token) . '&respondida=1', true, 303);
        exit;
    } catch (InvalidArgumentException | DomainException $e) {
        $feedback = $e->getMessage();
    } catch (Throwable $e) {
        error_log('Falha ao responder a proposta: ' . $e->getMessage());
        $feedback = 'Não foi possível registrar sua resposta. Tente novamente.';
    }
}

$row = quoteByToken($db, $token);
$q = $row ? quotePublic($row) : null;
if (!$q) {
    http_response_code(404);
}
if ($q && isset($_GET['respondida'])) {
    $feedbackOk = true;
    $feedback = $q['status'] === 'aceita' ? 'Proposta aceita! Seu consultor já foi avisado e vai entrar em contato para cadastrar sua loja.' : 'Resposta registrada. Obrigado por avaliar nossa proposta.';
}

$e = static fn($v): string => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$money = static fn($v): string => 'R$ ' . number_format((float)$v, 2, ',', '.');
$date = static fn(?string $v): string => $v ? date('d/m/Y', strtotime($v)) : '—';
$r = $q['resultado'] ?? [];
$c = $q['cliente'] ?? [];
$status = $q['status'] ?? '';
$statusLabel = QUOTE_STATUS[$status] ?? '';
$open = $status === 'enviada';
$channelNames = array_map(static fn($id) => QUOTE_CHANNELS[$id][0] ?? $id, $r['config']['canais'] ?? []);
$modulesOn = array_keys(array_filter($r['modulos'] ?? []));
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title><?= $q ? 'Proposta WedTech #' . $q['id'] : 'Proposta não encontrada' ?></title>
  <link rel="icon" href="frontend/img/modulos/favicon-wedtech.png" type="image/png">
  <link rel="stylesheet" href="frontend/css/consultor/proposta.css">
</head>
<body>
<?php if (!$q): ?>
  <main class="sheet narrow">
    <h1>Proposta não encontrada</h1>
    <p>O link pode estar incompleto. Peça ao seu consultor WedTech para enviar de novo.</p>
  </main>
<?php else: ?>
  <main class="sheet">
    <header class="doc-head">
      <div class="brand"><img src="frontend/img/modulos/wedtech-symbol.png" alt="" width="40" height="40"><span><b>Wed</b>Tech</span></div>
      <div class="doc-meta">
        <strong>Proposta comercial #<?= $q['id'] ?></strong>
        <span><?= $q['enviada_em'] ? 'Enviada em ' . $date($q['enviada_em']) : 'Criada em ' . $date($q['criado_em']) ?><?= $q['validade'] ? ' · válida até ' . $date($q['validade']) : '' ?></span>
        <span class="status status-<?= $e($status) ?>"><?= $e($statusLabel) ?></span>
      </div>
    </header>

    <?php if ($feedback): ?>
      <div class="notice <?= $feedbackOk ? 'ok' : 'error' ?>" role="status"><?= $e($feedback) ?></div>
    <?php endif; ?>
    <?php if ($status === 'rascunho' || $status === 'aprovacao'): ?>
      <div class="notice" role="status">Pré-visualização: esta proposta ainda não foi enviada ao cliente.</div>
    <?php endif; ?>

    <section class="parties">
      <div><small>Para</small><b><?= $e($c['nome'] ?? '') ?></b><span><?= $e($c['loja'] ?? '') ?></span><?php if (!empty($c['cnpj'])): ?><span>CNPJ <?= $e($c['cnpj']) ?></span><?php endif; ?></div>
      <div><small>Seu consultor</small><b><?= $e($q['consultor_nome']) ?></b><span><?= $e($q['consultor_email']) ?></span></div>
    </section>

    <section class="block">
      <h2>O que está incluído</h2>
      <ul class="included">
        <li><b>Plano <?= $e(PLAN_NAMES[$r['plano'] ?? 'profissional'] ?? '') ?></b>: estoque único, pedidos de todos os canais num lugar só, PDV e caixa da loja física, devoluções, fornecedores e relatórios.</li>
        <li><b><?= (int)($r['config']['lojas'] ?? 0) ?> <?= (int)($r['config']['lojas'] ?? 0) === 1 ? 'loja física' : 'lojas físicas' ?></b><?= $channelNames ? ' e vendas em <b>' . $e(implode(', ', $channelNames)) . '</b>' : '' ?>.</li>
        <?php if (!empty($r['config']['produtos'])): ?><li><b><?= (int)$r['config']['produtos'] ?> produtos</b> cadastrados por nós em cada canal escolhido.</li><?php endif; ?>
        <?php if ($modulesOn): ?><li>Recursos: <?= $e(implode(', ', array_map(static fn($k) => STORE_MODULES[$k] ?? $k, $modulesOn))) ?>.</li><?php endif; ?>
        <?php if (!empty($r['teste_dias'])): ?><li><b><?= (int)$r['teste_dias'] ?> dias de teste</b> antes da primeira mensalidade.</li><?php endif; ?>
      </ul>
    </section>

    <section class="block">
      <h2>Mensalidade</h2>
      <table class="lines">
        <?php foreach ($r['mensal'] ?? [] as [$label, $value]): ?>
          <tr class="<?= $value < 0 ? 'discount' : '' ?>"><td><?= $e($label) ?></td><td><?= (float)$value === 0.0 ? 'incluso' : $money($value) ?></td></tr>
        <?php endforeach; ?>
        <tr class="total"><td>Total por mês</td><td><?= $money($q['mensal_total']) ?></td></tr>
      </table>
    </section>

    <?php if (!empty($r['unico'])): ?>
    <section class="block">
      <h2>Pagamento único (cadastro e implantação)</h2>
      <table class="lines">
        <?php foreach ($r['unico'] as [$label, $value]): ?>
          <tr><td><?= $e($label) ?></td><td><?= $money($value) ?></td></tr>
        <?php endforeach; ?>
        <tr class="total"><td>Total único</td><td><?= $money($q['unico_total']) ?></td></tr>
      </table>
    </section>
    <?php endif; ?>

    <section class="summary">
      <div><small>Por mês</small><strong><?= $money($q['mensal_total']) ?></strong></div>
      <div><small>Pagamento único</small><strong><?= $money($q['unico_total']) ?></strong></div>
      <div><small>Primeiro pagamento</small><strong><?= $money($r['primeiro_pagamento'] ?? 0) ?></strong><?php if (!empty($r['teste_dias'])): ?><em>a mensalidade começa depois do teste</em><?php endif; ?></div>
    </section>

    <?php if ($q['observacoes']): ?>
      <section class="block"><h2>Observações</h2><p><?= nl2br($e($q['observacoes'])) ?></p></section>
    <?php endif; ?>

    <section class="block conditions">
      <h2>Condições</h2>
      <p>Valores em reais. As taxas cobradas pelos próprios marketplaces e apps sobre cada venda não fazem parte desta proposta. Mensalidade sem fidelidade: pode ser cancelada a qualquer momento com aviso de 30 dias.</p>
    </section>

    <?php if ($status === 'aceita'): ?>
      <section class="answer done">✅ Aceita por <b><?= $e($q['aceite_nome']) ?></b> em <?= $date($q['respondido_em']) ?>.</section>
    <?php elseif ($status === 'recusada'): ?>
      <section class="answer done">Proposta recusada em <?= $date($q['respondido_em']) ?>.</section>
    <?php elseif ($status === 'vencida'): ?>
      <section class="answer done">Esta proposta venceu em <?= $date($q['validade']) ?>. Fale com <?= $e($q['consultor_nome']) ?> para receber uma nova.</section>
    <?php elseif ($open): ?>
      <section class="answer no-print">
        <h2>Sua resposta</h2>
        <form method="post" class="accept">
          <input type="hidden" name="resposta" value="aceitar">
          <label for="nome">Seu nome completo</label>
          <input id="nome" name="nome" required minlength="3" maxlength="80" autocomplete="name">
          <label class="check"><input type="checkbox" required> <span>Li e concordo com os valores desta proposta e com o <a href="contrato.php?t=<?= $e($token) ?>" target="_blank" rel="noopener">contrato de prestação de serviços</a>.</span></label>
          <button class="btn primary">Aceitar proposta</button>
        </form>
        <details class="refuse">
          <summary>Não quero seguir com esta proposta</summary>
          <form method="post">
            <input type="hidden" name="resposta" value="recusar">
            <label for="motivo">Pode contar o motivo? (opcional)</label>
            <textarea id="motivo" name="motivo" rows="2" maxlength="400"></textarea>
            <button class="btn">Recusar proposta</button>
          </form>
        </details>
      </section>
    <?php endif; ?>

    <div class="toolbar no-print"><a class="btn" href="contrato.php?t=<?= $e($token) ?>" target="_blank" rel="noopener">📄 <?= $status === 'aceita' ? 'Ver o contrato' : 'Ler o contrato' ?></a><button type="button" class="btn" onclick="window.print()">🖨️ Imprimir ou salvar em PDF</button></div>
  </main>
  <?php if (isset($_GET['imprimir'])): ?><script>window.addEventListener("load", function () { window.print(); });</script><?php endif; ?>
<?php endif; ?>
</body>
</html>
