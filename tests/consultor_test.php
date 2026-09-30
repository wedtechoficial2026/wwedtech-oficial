<?php
require_once __DIR__ . '/../backend/app_state.php';

function check(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function fails(callable $fn, string $expected, string $message): void {
    try {
        $fn();
    } catch (Throwable $e) {
        check(str_contains($e->getMessage(), $expected), $message . ' — veio: ' . $e->getMessage());
        return;
    }
    throw new RuntimeException($message . ' — não recusou.');
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$db->exec('PRAGMA foreign_keys = ON;');
createSchema($db);
createRelationalSchema($db);

// Perfis: a migração cria o administrador de demonstração
$admin = $db->query("SELECT id, nome, papel FROM users WHERE email = 'adm@wedtech.com'")->fetch();
check($admin && $admin['papel'] === 'admin', 'A migração deve criar o administrador de demonstração.');
fails(fn() => createConsultant($db, ['id' => 99, 'papel' => 'consultor'], ['nome' => 'X', 'email' => 'x@x.com']), 'administrador', 'Consultor não cadastra consultores.');
$ana = createConsultant($db, $admin, ['nome' => 'Ana Consultora', 'email' => 'ana@wedtech.com']);
$bruno = createConsultant($db, $admin, ['nome' => 'Bruno Consultor', 'email' => 'bruno@wedtech.com']);
$anaUser = $db->query("SELECT id, nome, papel FROM users WHERE email = 'ana@wedtech.com'")->fetch();
$brunoUser = $db->query("SELECT id, nome, papel FROM users WHERE email = 'bruno@wedtech.com'")->fetch();
check(strlen($ana['senha_provisoria']) === 8 && $anaUser['papel'] === 'consultor', 'Consultor criado com senha provisória.');

// Contato do site vira loja
$db->exec("INSERT INTO leads (client_id, origem, nome, email, whatsapp, dados) VALUES ('00000000-0000-4000-8000-000000000001', 'consultor', 'Carla', 'carla@loja.com', '11999990000', '{\"loja\":\"Loja da Carla\"}')");
$leadId = (int)$db->lastInsertId();
check(listLeads($db, $anaUser)[0]['loja'] === 'Loja da Carla', 'Contatos sem dono aparecem para os consultores.');
updateLead($db, $anaUser, $leadId, ['status' => 'conversa', 'notas' => 'Ligar amanhã']);
fails(fn() => updateLead($db, $brunoUser, $leadId, ['status' => 'perdido']), 'outro consultor', 'Contato em atendimento é só de quem pegou.');
check(count(listLeads($db, $brunoUser)) === 0, 'Contato atribuído some da lista dos outros consultores.');

// Cadastro da loja pelo consultor
fails(fn() => createStore($db, $anaUser, ['nome' => 'L', 'responsavel' => 'Carla', 'email' => 'c@c.com', 'tipo' => 'moda', 'plano' => 'basico']), 'nome da loja', 'Valida o nome.');
$store = createStore($db, $anaUser, ['nome' => 'Loja da Carla', 'responsavel' => 'Carla Souza', 'email' => 'carla@loja.com', 'tipo' => 'moda', 'plano' => 'basico', 'teste_dias' => 14, 'valor_mensal' => 79.9, 'cnpj' => '12.345.678/0001-90', 'lead_id' => $leadId]);
fails(fn() => createStore($db, $anaUser, ['nome' => 'Outra', 'responsavel' => 'Carla', 'email' => 'carla@loja.com', 'tipo' => 'moda', 'plano' => 'basico']), 'Já existe', 'E-mail repetido é recusado.');
$owner = $db->query("SELECT id, papel, trocar_senha FROM users WHERE email = 'carla@loja.com'")->fetch();
check($owner['papel'] === 'lojista' && (int)$owner['trocar_senha'] === 1, 'Lojista criado precisa trocar a senha provisória.');
check($db->query("SELECT status FROM leads WHERE id = $leadId")->fetchColumn() === 'fechado', 'O contato é marcado como fechado.');
$businessId = $store['business_id'];
$provision = businessProvision($db, (int)$owner['id']);
check($provision['tipo'] === 'moda' && $provision['store']['name'] === 'Loja da Carla' && $provision['store']['cnpj'] === '12.345.678/0001-90', 'O painel da loja nova começa com os dados do cadastro.');

// Escopo: cada consultor vê só as lojas dele; o administrador vê todas
check(count(listStores($db, $anaUser)) === 1 && count(listStores($db, $brunoUser)) === 0 && count(listStores($db, $admin)) === 1, 'Cada consultor vê só as próprias lojas.');
fails(fn() => getStore($db, $brunoUser, $businessId), 'outro consultor', 'Consultor não abre loja de outro.');
fails(fn() => startSupportMode($db, $brunoUser, $businessId), 'outro consultor', 'Consultor não entra em modo suporte de loja de outro.');
fails(fn() => startSupportMode($db, $admin, 99999), 'não encontrada', 'Modo suporte recusa loja inexistente.');
fails(fn() => updateStore($db, $admin, 99999, ['situacao' => 'ativa']), 'não encontrada', 'Alterar loja inexistente é recusado.');
check(getStore($db, $anaUser, $businessId)['situacao'] === 'teste', 'Loja com teste começa em teste.');

// Contrato: plano, limites e módulos liberados valem no painel e o painel não sobrescreve o plano
updateStore($db, $anaUser, $businessId, ['plano' => 'profissional', 'limites' => ['maxShops' => 4], 'modulos' => ['automacoes' => true, 'iot' => true]]);
$state = ['version' => 3, 'plan' => 'basico', 'store' => ['name' => 'Loja da Carla'], 'products' => [], 'orders' => [], 'seq' => []];
syncModularTables($db, (int)$owner['id'], $state, 1);
check($db->query("SELECT plano FROM businesses WHERE id = $businessId")->fetchColumn() === 'profissional', 'O painel não pode sobrescrever o plano do consultor.');
$applied = applyBusinessContract($db, (int)$owner['id'], $state);
check($applied['plan'] === 'profissional' && $applied['planLimits']['maxShops'] === 4 && $applied['planLimits']['maxChannels'] === 6, 'Limites do plano com a liberação extra.');
check($applied['modules']['iot'] === true && $applied['modules']['etiquetas'] === false, 'Módulos liberados pelo consultor.');
check($applied['account']['consultant']['name'] === 'Ana Consultora', 'O lojista vê quem é o consultor dele.');

// Chamados: lojista abre, consultor responde e resolve, lojista reabre
$ownerUser = ['id' => (int)$owner['id'], 'papel' => 'lojista'];
$ticketId = openTicket($db, $ownerUser, $businessId, 'Não consigo imprimir a etiqueta', 'Aparece erro ao despachar o pedido PED-1002.');
replyTicket($db, $anaUser, $ticketId, 'Vou verificar, pode me mandar um print?');
check(ticketForUser($db, $ownerUser, $ticketId)['status'] === 'em_atendimento', 'Resposta do consultor coloca em atendimento.');
fails(fn() => replyTicket($db, $ownerUser, $ticketId, 'ok', 'resolvido'), 'Só o consultor', 'Lojista não muda a situação.');
replyTicket($db, $anaUser, $ticketId, 'Resolvido: atualize a página.', 'resolvido');
replyTicket($db, $ownerUser, $ticketId, 'Voltou a acontecer.');
$ticket = ticketForUser($db, $ownerUser, $ticketId);
check($ticket['status'] === 'aberto' && count($ticket['mensagens']) === 4, 'Lojista respondendo reabre o chamado.');
fails(fn() => ticketForUser($db, ['id' => 9999, 'papel' => 'lojista'], $ticketId), 'não encontrado', 'Outra loja não vê o chamado.');
check(staffOverview($db, $anaUser)['chamados_abertos'] === 1, 'Visão geral conta chamados abertos.');

// Senha e modo suporte (somente leitura) com registro
$reset = resetStorePassword($db, $anaUser, $businessId);
check(strlen($reset['senha_provisoria']) === 8, 'Nova senha provisória gerada.');
$_SESSION = [];
check(panelContext($anaUser) === null, 'Consultor sem modo suporte não abre painel de loja.');
startSupportMode($db, $anaUser, $businessId);
$context = panelContext($anaUser);
check($context['readonly'] === true && $context['owner_id'] === (int)$owner['id'], 'Modo suporte abre a loja em somente leitura.');
check(panelContext($ownerUser)['readonly'] === false, 'O lojista continua com acesso normal.');
endSupportMode($db, $anaUser);
check(panelContext($anaUser) === null, 'Encerrar o modo suporte fecha o acesso.');
$actions = array_column(getStore($db, $anaUser, $businessId)['historico'], 'acao');
foreach (['loja_criada', 'loja_alterada', 'chamado_respondido', 'senha_redefinida', 'suporte_iniciado', 'suporte_encerrado'] as $action) {
    check(in_array($action, $actions, true), 'Registro de ações deve ter ' . $action);
}

// Suspender a loja
updateStore($db, $anaUser, $businessId, ['situacao' => 'suspensa']);
check(listStores($db, $anaUser)[0]['saude'] === 'parada', 'Loja suspensa aparece como parada.');

// Não lidas: a mensagem do lojista acende o aviso do consultor até ele abrir o chamado
$pulse = staffPulse($db, $anaUser);
check($pulse['contadores']['nao_lidas'] === 1 && $pulse['eventos'][0]['chave'] !== '', 'Mensagem nova do lojista aparece como não lida no pulso.');
check(listTickets($db, $anaUser)[0]['nao_lidas'] == 1, 'A lista de chamados mostra as não lidas.');
markTicketSeen($db, $anaUser, $ticketId);
check(staffPulse($db, $anaUser)['contadores']['nao_lidas'] === 0, 'Abrir o chamado zera as não lidas do consultor.');
check(staffPulse($db, $brunoUser)['contadores']['nao_lidas'] === 0, 'Outro consultor não vê as mensagens desta loja.');
$ownerPulse = ownerSupportPulse($db, (int)$owner['id']);
replyTicket($db, $anaUser, $ticketId, 'Pode tentar de novo agora?');
$ownerPulse2 = ownerSupportPulse($db, (int)$owner['id']);
check($ownerPulse2['sig'] !== $ownerPulse['sig'] && $ownerPulse2['nao_lidas'] === 1 && $ownerPulse2['novas'][0]['texto'] === 'Pode tentar de novo agora?', 'O lojista recebe a resposta nova no pulso.');
markTicketSeen($db, $ownerUser, $ticketId);
check(ownerSupportPulse($db, (int)$owner['id'])['nao_lidas'] === 0, 'Abrir o chamado zera as não lidas do lojista.');

// Cotação: preço por marketplace e por produto cadastrado
$table = priceTable($db);
$calc = quoteCompute($table, ['tipo' => 'moda', 'canais' => ['ml', 'shopee', 'ifood'], 'lojas' => 1, 'produtos' => 100, 'modulos' => [], 'teste_dias' => 0]);
check($calc['config']['canais'] === ['ml', 'shopee'], 'Canal fora do ramo (iFood em moda) é ignorado.');
check($calc['plano_sugerido'] === 'basico' || $calc['plano_sugerido'] === 'profissional', 'Sugere um plano que comporta 2 marketplaces.');
check($calc['plano'] === 'profissional', 'Básico só aceita 1 marketplace: sugere o Profissional — veio ' . $calc['plano']);
$expectedMonthly = $table['planos']['profissional'] + $table['canais']['ml']['mensal'] + $table['canais']['shopee']['mensal'];
check(abs($calc['mensal_total'] - $expectedMonthly) < 0.01, 'Mensalidade = plano + cada marketplace.');
$expectedOnce = 100 * $table['canais']['ml']['cadastro'] + 100 * $table['canais']['shopee']['cadastro'] + $table['implantacao'];
check(abs($calc['unico_total'] - $expectedOnce) < 0.01, 'Pagamento único = produtos × taxa de cada canal + implantação.');
check(abs($calc['primeiro_pagamento'] - ($expectedMonthly + $expectedOnce)) < 0.01, 'Sem teste, o primeiro pagamento soma mensal e único.');
$withExtras = quoteCompute($table, ['tipo' => 'moda', 'canais' => ['ml'], 'lojas' => 3, 'produtos' => 0, 'modulos' => ['iot' => true], 'plano' => 'basico', 'desconto' => 10, 'implantacao' => false]);
$gross = $table['planos']['basico'] + $table['canais']['ml']['mensal'] + $table['modulos']['iot'] + 2 * $table['loja_extra'];
check(abs($withExtras['mensal_total'] - round($gross * 0.9, 2)) < 0.02 && $withExtras['unico_total'] == 0, 'Extras (módulo e lojas além do plano) e desconto entram na conta.');
check($withExtras['limites']['maxShops'] === 3 && $withExtras['modulos']['iot'] === true, 'O contrato da cotação libera o que foi vendido.');

$lead2 = (int)$db->query("INSERT INTO leads (client_id, origem, nome, email, whatsapp, dados) VALUES ('00000000-0000-4000-8000-000000000002', 'consultor', 'Diego', 'diego@loja.com', '11988887777', '{\"loja\":\"Tech do Diego\"}') RETURNING id")->fetchColumn();
fails(fn() => saveQuote($db, $anaUser, 0, ['cliente' => ['nome' => 'D'], 'config' => []]), 'nome do cliente', 'Cotação valida o cliente.');
$quote = saveQuote($db, $anaUser, 0, ['lead_id' => $lead2, 'cliente' => ['nome' => 'Diego Lima', 'loja' => 'Tech do Diego', 'email' => 'diego@loja.com'], 'config' => ['tipo' => 'eletronicos', 'canais' => ['ml', 'amazon'], 'lojas' => 1, 'produtos' => 50, 'desconto' => 25, 'teste_dias' => 14]]);
check($quote['status'] === 'rascunho' && strlen($quote['token']) === 32, 'Cotação nasce como rascunho com link próprio.');
fails(fn() => getQuote($db, $brunoUser, $quote['id']), 'outro consultor', 'Consultor não vê cotação de outro.');
fails(fn() => respondQuote($db, $quote['token'], 'aceitar', 'Diego Lima', ''), 'não está aberta', 'Rascunho não pode ser aceito.');
check(sendQuote($db, $anaUser, $quote['id'])['status'] === 'aprovacao', 'Desconto acima do limite espera o administrador.');
check(in_array('quote-' . $quote['id'] . '-aprovacao', array_column(staffPulse($db, $admin)['eventos'], 'chave'), true), 'O administrador é avisado da aprovação pendente.');
$sent = sendQuote($db, $admin, $quote['id']);
check($sent['status'] === 'enviada' && $sent['validade'] >= date('Y-m-d'), 'Administrador aprova e a proposta é enviada com validade.');
check($db->query("SELECT status FROM leads WHERE id = $lead2")->fetchColumn() === 'proposta', 'O contato vai para "Proposta enviada".');
fails(fn() => respondQuote($db, $quote['token'], 'aceitar', 'Di', ''), 'nome completo', 'Aceite exige o nome.');
fails(fn() => respondQuote($db, str_repeat('0', 32), 'aceitar', 'Diego Lima', ''), 'não encontrada', 'Link inválido é recusado.');
$sigBefore = staffPulse($db, $anaUser)['sig']['cotacoes'];
$accepted = respondQuote($db, $quote['token'], 'aceitar', 'Diego Lima', '');
check(staffPulse($db, $anaUser)['sig']['cotacoes'] !== $sigBefore, 'Aceite no mesmo segundo do envio ainda muda a assinatura das cotações.');
check($accepted['status'] === 'aceita' && $accepted['aceite_nome'] === 'Diego Lima', 'Cliente aceita pelo link.');
fails(fn() => respondQuote($db, $quote['token'], 'recusar', '', ''), 'não está aberta', 'Proposta respondida não muda mais.');
check(in_array('quote-' . $quote['id'] . '-aceita', array_column(staffPulse($db, $anaUser)['eventos'], 'chave'), true), 'O consultor é avisado do aceite.');
$fromQuote = createStore($db, $anaUser, ['nome' => 'Tech do Diego', 'responsavel' => 'Diego Lima', 'email' => 'diego@loja.com', 'tipo' => 'eletronicos', 'plano' => $accepted['plano'], 'teste_dias' => 14, 'quote_id' => $quote['id']]);
$diego = getStore($db, $anaUser, $fromQuote['business_id']);
check($diego['limites']['maxMarketplaces'] >= 2 && abs((float)$diego['valor_mensal'] - $accepted['mensal_total']) < 0.01, 'A loja nasce com o que foi contratado na cotação.');
check($db->query("SELECT status FROM leads WHERE id = $lead2")->fetchColumn() === 'fechado', 'O contato fecha junto com a loja.');
fails(fn() => createStore($db, $anaUser, ['nome' => 'Tech 2', 'responsavel' => 'Diego Lima', 'email' => 'diego2@loja.com', 'tipo' => 'eletronicos', 'plano' => 'basico', 'quote_id' => $quote['id']]), 'já virou uma loja', 'Uma cotação vira no máximo uma loja.');
check(getStore($db, $anaUser, $fromQuote['business_id']) !== null && $db->query("SELECT COUNT(*) FROM users WHERE email = 'diego2@loja.com'")->fetchColumn() == 0, 'Cadastro recusado não deixa acesso pela metade.');

// Pedido de proposta da página inicial: dados da loja chegam ao consultor
check(cnpjValid('11.222.333/0001-81') && cnpjValid('11222333000181'), 'CNPJ válido é aceito com ou sem pontuação.');
check(!cnpjValid('11.222.333/0001-82') && !cnpjValid('11.111.111/1111-11') && !cnpjValid('123'), 'CNPJ com dígito errado, repetido ou curto é recusado.');
$db->exec("INSERT INTO leads (client_id, origem, nome, email, whatsapp, dados) VALUES ('00000000-0000-4000-8000-000000000003', 'consultor', 'Paula', 'paula@loja.com', '11977776666', '{\"loja\":\"Moda da Paula\",\"ramo\":\"moda\",\"cnpj\":\"11.222.333/0001-81\",\"cidade\":\"Campinas/SP\",\"lojas\":2,\"produtos\":200,\"canais\":[\"Loja física\",\"Mercado Livre\",\"Shopee\"],\"observacoes\":\"Já vendo no ML\"}')");
$paula = array_values(array_filter(listLeads($db, $anaUser), fn($l) => $l['nome'] === 'Paula'))[0];
check($paula['loja'] === 'Moda da Paula' && $paula['cnpj'] === '11.222.333/0001-81' && $paula['ramo'] === 'moda' && $paula['cidade'] === 'Campinas/SP', 'O contato traz nome da loja, CNPJ, ramo e cidade.');
check($paula['lojas'] === 2 && $paula['produtos'] === 200 && $paula['canais_ids'] === ['ml', 'shopee'] && $paula['mensagem'] === 'Já vendo no ML', 'O contato traz lojas, produtos, canais (com os códigos da cotação) e a observação.');

// Tabela de preços: só o administrador altera; valores inválidos voltam ao padrão
fails(fn() => savePriceTable($db, $anaUser, []), 'administrador', 'Consultor não altera a tabela de preços.');
$saved = savePriceTable($db, $admin, ['canais' => ['ml' => ['mensal' => 99, 'cadastro' => 'x']], 'desconto_max' => 150]);
check($saved['canais']['ml']['mensal'] == 99 && $saved['canais']['ml']['cadastro'] == $table['canais']['ml']['cadastro'] && $saved['desconto_max'] == 100, 'Tabela de preços salva com valores limpos.');
check(priceTable($db)['canais']['ml']['mensal'] == 99, 'A tabela salva vale nas próximas cotações.');

echo "consultor_test: OK", PHP_EOL;
