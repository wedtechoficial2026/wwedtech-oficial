<?php
// contrato.php - Contrato de prestação de serviços gerado a partir da cotação (mesmo código do link
// da proposta). O cliente lê antes de aceitar; depois do aceite o contrato mostra o registro eletrônico.
// ?t=<código>  ·  &imprimir=1 abre a janela de impressão
require_once __DIR__ . '/backend/db.php';

$db = getDb();
$token = (string)($_GET['t'] ?? '');
$row = quoteByToken($db, $token);
$q = $row ? quotePublic($row) : null;
if (!$q) {
    http_response_code(404);
}

$e = static fn($v): string => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$money = static fn($v): string => 'R$ ' . number_format((float)$v, 2, ',', '.');
$date = static fn(?string $v): string => $v ? date('d/m/Y', strtotime($v)) : '—';
// Campo não preenchido vira uma linha para completar à mão
$fill = static fn(?string $v): string => trim((string)$v) !== '' ? htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8') : '<span class="blank">&nbsp;</span>';

$company = priceTable($db)['empresa'];
$r = $q['resultado'] ?? [];
$c = $q['cliente'] ?? [];
$config = $r['config'] ?? [];
$status = $q['status'] ?? '';
$accepted = $status === 'aceita';
$plan = PLAN_NAMES[$r['plano'] ?? ''] ?? '';
$channels = array_map(static fn($id) => QUOTE_CHANNELS[$id][0] ?? $id, $config['canais'] ?? []);
$modules = array_map(static fn($k) => STORE_MODULES[$k] ?? $k, array_keys(array_filter($r['modulos'] ?? [])));
$limits = $r['limites'] ?? [];
$trial = (int)($r['teste_dias'] ?? 0);
$products = (int)($config['produtos'] ?? 0);
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title><?= $q ? 'Contrato WedTech · proposta #' . $q['id'] : 'Contrato não encontrado' ?></title>
  <link rel="icon" href="frontend/img/modulos/favicon-wedtech.png" type="image/png">
  <link rel="stylesheet" href="frontend/css/consultor/proposta.css">
</head>
<body>
<?php if (!$q): ?>
  <main class="sheet narrow">
    <h1>Contrato não encontrado</h1>
    <p>O link pode estar incompleto. Peça ao seu consultor WedTech para enviar de novo.</p>
  </main>
<?php else: ?>
  <main class="sheet contract-doc">
    <header class="doc-head">
      <div class="brand"><img src="frontend/img/modulos/wedtech-symbol.png" alt="" width="40" height="40"><span><b>Wed</b>Tech</span></div>
      <div class="doc-meta">
        <strong>Contrato · proposta #<?= $q['id'] ?></strong>
        <span><?= $accepted ? 'Aceito em ' . $date($q['respondido_em']) : 'Minuta para leitura antes do aceite' ?></span>
        <span class="status status-<?= $e($status) ?>"><?= $e(QUOTE_STATUS[$status] ?? '') ?></span>
      </div>
    </header>

    <h1>Contrato de licença de uso de software e prestação de serviços</h1>
    <p class="lead">Plataforma WedTech de gestão de estoque e vendas em vários canais</p>

    <section class="parties">
      <div>
        <small>Contratada</small>
        <b><?= $fill($company['razao']) ?></b>
        <p>CNPJ <?= $fill($company['cnpj']) ?></p>
        <p><?= $fill($company['endereco']) ?></p>
        <p><?= $fill($company['email']) ?></p>
      </div>
      <div>
        <small>Contratante</small>
        <b><?= $fill($c['loja'] ?? '') ?></b>
        <p>CNPJ <?= $fill($c['cnpj'] ?? '') ?></p>
        <p><?= $fill($c['endereco'] ?? '') ?></p>
        <p>Representada por <?= $fill($c['nome'] ?? '') ?> · <?= $fill($c['email'] ?? '') ?></p>
      </div>
    </section>

    <section class="clause">
      <h2>1. Objeto</h2>
      <p>A CONTRATADA concede à CONTRATANTE o direito de uso, não exclusivo e intransferível, da plataforma WedTech no <b>plano <?= $e($plan) ?></b>, pela internet, durante a vigência deste contrato, com:</p>
      <ul>
        <li>até <?= (int)($limits['maxShops'] ?? 1) ?> <?= (int)($limits['maxShops'] ?? 1) === 1 ? 'loja física' : 'lojas físicas' ?>, <?= (int)($limits['maxChannels'] ?? 0) ?> canais de venda e <?= (int)($limits['maxMarketplaces'] ?? 0) ?> <?= (int)($limits['maxMarketplaces'] ?? 0) === 1 ? 'marketplace ou aplicativo' : 'marketplaces ou aplicativos' ?> de delivery;</li>
        <?php if ($channels): ?><li>integração com: <?= $e(implode(', ', $channels)) ?>;</li><?php endif; ?>
        <?php if ($modules): ?><li>recursos adicionais: <?= $e(implode(', ', $modules)) ?>.</li><?php endif; ?>
      </ul>
    </section>

    <section class="clause">
      <h2>2. Serviços de implantação</h2>
      <?php if ($products > 0 || !empty($config['implantacao'])): ?>
        <ol>
          <?php if ($products > 0 && $channels): ?><li>Cadastro de até <b><?= $products ?> produtos</b> em cada canal contratado, com base nas informações e fotos fornecidas pela CONTRATANTE.</li><?php endif; ?>
          <?php if (!empty($config['implantacao'])): ?><li>Configuração inicial da plataforma e treinamento da equipe da CONTRATANTE.</li><?php endif; ?>
        </ol>
      <?php else: ?>
        <p>Não foram contratados serviços de implantação. A CONTRATANTE faz o próprio cadastro, com o apoio do suporte.</p>
      <?php endif; ?>
    </section>

    <section class="clause">
      <h2>3. Preço e pagamento</h2>
      <p>Pela licença de uso, a CONTRATANTE paga a <b>mensalidade de <?= $money($q['mensal_total']) ?></b><?= (float)$q['desconto_pct'] > 0 ? ', já com ' . str_replace('.', ',', (string)(float)$q['desconto_pct']) . '% de desconto' : '' ?>, detalhada abaixo:</p>
      <table class="lines">
        <?php foreach ($r['mensal'] ?? [] as [$label, $value]): ?>
          <tr class="<?= $value < 0 ? 'discount' : '' ?>"><td><?= $e($label) ?></td><td><?= (float)$value === 0.0 ? 'incluso' : $money($value) ?></td></tr>
        <?php endforeach; ?>
        <tr class="total"><td>Mensalidade</td><td><?= $money($q['mensal_total']) ?></td></tr>
      </table>
      <?php if (!empty($r['unico'])): ?>
        <p>Pelos serviços de implantação, a CONTRATANTE paga uma única vez <b><?= $money($q['unico_total']) ?></b>:</p>
        <table class="lines">
          <?php foreach ($r['unico'] as [$label, $value]): ?>
            <tr><td><?= $e($label) ?></td><td><?= $money($value) ?></td></tr>
          <?php endforeach; ?>
          <tr class="total"><td>Pagamento único</td><td><?= $money($q['unico_total']) ?></td></tr>
        </table>
      <?php endif; ?>
      <ol>
        <?php if ($trial > 0): ?><li>Os primeiros <b><?= $trial ?> dias</b> são de teste, sem cobrança de mensalidade. A primeira mensalidade vence ao fim do teste.</li><?php endif; ?>
        <li>As mensalidades vencem todo mês, na mesma data do início da cobrança.</li>
        <li>O pagamento único vence na assinatura deste contrato.</li>
        <li>Os valores são reajustados a cada 12 meses pela variação do IPCA/IBGE.</li>
        <li>As comissões e tarifas cobradas pelos marketplaces e aplicativos sobre cada venda são pagas pela CONTRATANTE diretamente a eles e não fazem parte deste contrato.</li>
      </ol>
    </section>

    <section class="clause">
      <h2>4. Vigência e cancelamento</h2>
      <p>Este contrato vale por prazo indeterminado a partir do aceite. Qualquer das partes pode encerrá-lo a qualquer momento, sem multa, com aviso de 30 dias. Os serviços de implantação já realizados não são devolvidos. Ao final, a CONTRATANTE pode exportar seus dados em até 30 dias.</p>
    </section>

    <section class="clause">
      <h2>5. Obrigações da CONTRATADA</h2>
      <ol>
        <li>Manter a plataforma disponível e funcionando, com cópias de segurança dos dados.</li>
        <li>Prestar suporte pelo painel (tela Suporte) em dias úteis, em horário comercial.</li>
        <li>Avisar com antecedência sobre manutenções programadas.</li>
      </ol>
    </section>

    <section class="clause">
      <h2>6. Obrigações da CONTRATANTE</h2>
      <ol>
        <li>Fornecer informações corretas sobre produtos, preços e estoque.</li>
        <li>Guardar em sigilo as senhas de acesso e responder pelo uso feito com elas.</li>
        <li>Cumprir as regras de cada marketplace e a legislação aplicável, inclusive o Código de Defesa do Consumidor.</li>
        <li>Pagar os valores nas datas combinadas. Depois de 15 dias de atraso, o acesso pode ser suspenso até a regularização.</li>
      </ol>
    </section>

    <section class="clause">
      <h2>7. Proteção de dados (LGPD)</h2>
      <p>A CONTRATADA trata os dados pessoais dos clientes da CONTRATANTE apenas para executar este contrato, conforme a Lei nº 13.709/2018, como operadora. A CONTRATANTE é a controladora desses dados. As partes mantêm sigilo sobre as informações a que tiverem acesso.</p>
    </section>

    <section class="clause">
      <h2>8. Foro</h2>
      <p>Fica eleito o foro da comarca de <?= $fill($company['foro']) ?> para resolver questões deste contrato.</p>
    </section>

    <?php if ($accepted): ?>
      <div class="e-accept">
        ✅ Contrato aceito eletronicamente por <b><?= $e($q['aceite_nome']) ?></b>, em nome de <?= $e($c['loja'] ?? '') ?>, em <?= $e((new DateTime($q['respondido_em'], new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('America/Sao_Paulo'))->format('d/m/Y \à\s H:i')) ?> (horário de Brasília), pelo link da proposta #<?= $q['id'] ?>.<?php if ($q['aceite_registro']): ?> Registro: <code><?= $e($q['aceite_registro']) ?></code>.<?php endif; ?>
      </div>
    <?php endif; ?>

    <div class="signatures">
      <div><b><?= $fill($company['razao']) ?></b><small>Contratada</small></div>
      <div><b><?= $accepted ? $e($q['aceite_nome']) : $fill($c['nome'] ?? '') ?></b><small>Contratante · <?= $e($c['loja'] ?? '') ?></small></div>
    </div>

    <div class="toolbar no-print">
      <a class="btn" href="proposta.php?t=<?= $e($token) ?>">← Voltar para a proposta</a>
      <button type="button" class="btn primary" onclick="window.print()">🖨️ Imprimir ou salvar em PDF</button>
    </div>
  </main>
  <?php if (isset($_GET['imprimir'])): ?><script>window.addEventListener("load", function () { window.print(); });</script><?php endif; ?>
<?php endif; ?>
</body>
</html>
