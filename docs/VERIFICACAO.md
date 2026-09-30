# Roteiro de verificação — WedTech

Lista de tudo o que conferir para garantir que o sistema está rodando. Siga na ordem: cada parte usa o que a anterior criou. Marque `[x]` no que passar. Se algo falhar, anote o passo e o que apareceu na tela.

Tempo estimado: **40 a 60 minutos** para a lista completa. Para uma conferência rápida antes de uma apresentação, faça só os itens marcados com ⭐ (uns 10 minutos).

**Dica:** use duas janelas do navegador lado a lado, uma com o **painel da loja** e outra com a **área do consultor**. As duas contas funcionam juntas no mesmo navegador.

---

## 0. Preparação

- [ ] ⭐ Feche servidores antigos (janelas "WedTech - …") e dê dois cliques em `iniciar-tudo.bat`.
  - **Esperado:** abrem 4 janelas minimizadas (Painel, Mercado Livre, Amazon, Shopee) e o navegador abre o site.
- [ ] Teste automático: numa janela de comando, na pasta do projeto, rode os três arquivos de `tests\` (veja o README).
  - **Esperado:** `app_state_test: OK`, `marketplace_checkout_test: OK`, `consultor_test: OK`.
- [ ] ⭐ Depois de reiniciar os servidores, dê **F5** em todas as abas que já estavam abertas.

## 1. Site (página inicial) — http://localhost:8000/

- [ ] ⭐ A página abre sem preços, com os botões "Falar com um consultor" e "Entrar".
- [ ] ⭐ **Pedir proposta:** clique em "Falar com um consultor" e preencha:
  - loja **"Loja Teste Verificação"**, ramo Eletrônicos, cidade **Campinas/SP**, 2 lojas físicas, 200 a 500 produtos;
  - canais Mercado Livre e Amazon;
  - seu nome, e-mail e WhatsApp.
  - **Esperado:** o cursor começa no campo "Nome da loja" e aparece "Tudo certo, [nome]!".
- [ ] **CNPJ inválido:** tente enviar com o CNPJ `11.222.333/0001-82`.
  - **Esperado:** mensagem "Confira o CNPJ". Com `11.222.333/0001-81` ele aceita.
- [ ] **Campos obrigatórios:** envie sem o nome da loja.
  - **Esperado:** mensagem pedindo o nome da loja.
- [ ] **Chat com o vendedor:** abra "Fale com um vendedor online", responda e preencha nome, loja e WhatsApp.
  - **Esperado:** agradecimento no chat.

## 2. Login e contas

- [ ] ⭐ Em `login.php`, clique em "Exemplo: vendedor" e entre.
  - **Esperado:** abre o painel da loja.
  - Num banco novo, o primeiro acesso pede o tipo de loja: escolha **Eletrônicos e acessórios**.
- [ ] ⭐ Em **Canais de venda**, deixe **Mercado Livre, Amazon e Shopee conectados**. As vitrines só vendem canais conectados.
- [ ] ⭐ Em outra aba, abra `login.php`.
  - **Esperado:** aparece "Painel da loja · conectado" e dá para entrar com a outra conta.
  - Entre com "Exemplo: adm". **Esperado:** abre a área do consultor.
- [ ] Volte à aba do painel da loja e navegue.
  - **Esperado:** continua conectado como lojista, sem pedir login.
- [ ] Senha errada.
  - **Esperado:** "E-mail ou senha incorretos."

## 3. Painel da loja — http://localhost:8000/modulos/index.php

### Início
- [ ] ⭐ Os indicadores aparecem (ruptura, vendas de hoje, onde vende bem, produtos parados).
- [ ] Clique em "Ruptura".
  - **Esperado:** leva para Estoque já filtrado.

### Caixa (PDV)
- [ ] ⭐ Abra o caixa com um valor inicial e registre uma venda pelo código ou pela busca.
- [ ] Pague em dinheiro com troco.
  - **Esperado:** a venda é registrada e o estoque do produto cai.
- [ ] Faça uma sangria e um suprimento. Feche o caixa com a contagem.
  - **Esperado:** o resumo do fechamento mostra a diferença, se houver.

### Pedidos, retiradas e devoluções
- [ ] **Pedidos:** filtre por loja e por canal.
  - **Esperado:** a lista respeita os filtros; "Limpar" volta tudo.
- [ ] **Retiradas:** um pedido "pronto para retirada" aparece aqui e pode ser entregue.
- [ ] **Devoluções:** aparecem só as pedidas pelo cliente. Analise uma (aprovar ou recusar) e receba o produto.
  - **Esperado:** o prazo do CDC aparece e o estoque volta quando o produto é recebido.

### Produtos, estoque e fornecedores
- [ ] **Estoque:** faça um ajuste com motivo.
  - **Esperado:** o saldo muda e o ajuste fica registrado.
- [ ] **Fornecedores:** abra a ficha de um fornecedor, edite CNPJ, contato e endereço e salve.
- [ ] **Estoque baixo:** use "pedir ao fornecedor" num produto com estoque baixo.
  - **Esperado:** aparece um pedido de compra para confirmar.

### Canais e o resto
- [ ] **Canais de venda:** as taxas de cada marketplace aparecem. Coloque um preço abaixo do custo com taxa.
  - **Esperado:** aviso de prejuízo.
- [ ] **Menus Financeiro, Datas, Anúncios, Automações, IoT e WedTech AI:** cada um abre sem erro.
- [ ] ⭐ **Menu do perfil:** clique no círculo com as iniciais (canto superior direito).
  - **Esperado:** mostra nome, e-mail, loja, plano e consultor.
  - Clique em "Configurações da loja": abre Configurações e o menu fecha.
  - Com o menu aberto, Esc e clicar fora também fecham o menu.
- [ ] **Trocar senha:** pelo menu, abra "Trocar senha".
  - **Esperado:** pede a senha atual. Não precisa trocar.
- [ ] **Som:** em Notificações, o botão alterna entre "Som ligado" e "Som desligado".

## 4. Tempo real entre as telas

Deixe o **painel da loja em Pedidos** aberto numa janela.

- [ ] ⭐ Abra http://localhost:8011/ (Mercado Livre) e compre um produto (pedido de teste).
  - **Esperado, em até 3 segundos e sem F5:**
    - o pedido aparece no painel;
    - sobe a janela flutuante com som (o som só toca depois de você clicar uma vez na página do painel);
    - o estoque cai no painel, no site da loja e nas outras vitrines.
- [ ] Clique na janela flutuante.
  - **Esperado:** vai para Pedidos e marca o aviso como lido.
- [ ] Com a vitrine da **Amazon** aberta, venda o mesmo produto no **PDV**.
  - **Esperado:** o estoque na vitrine cai sozinho em poucos segundos.
- [ ] Coloque um produto no carrinho da vitrine e zere o estoque dele pelo painel.
  - **Esperado:** o produto sai do carrinho com aviso.
- [ ] Na vitrine, em "Meus pedidos", marque o pedido como enviado no painel.
  - **Esperado:** o status muda na vitrine sem F5.
- [ ] Na vitrine, peça devolução de um pedido entregue.
  - **Esperado:** aparece no painel em Devoluções, com aviso.

## 5. Área do consultor — http://localhost:8000/consultor/index.php

- [ ] ⭐ **Visão geral:** a loja de exemplo aparece como "online agora" (o painel dela está aberto).
- [ ] ⭐ **Contatos do site:** o pedido da parte 1 aparece com:
  - nome da loja, CNPJ, cidade, lojas físicas, produtos, canais e observação.

### Cotação
- [ ] ⭐ No contato da parte 1, clique em **Fazer cotação**.
  - **Esperado:** cliente, loja, CNPJ, cidade, ramo, lojas, produtos e canais já vêm preenchidos e o preço já aparece calculado.
- [ ] Marque e desmarque marketplaces e mude a quantidade de produtos.
  - **Esperado:** a proposta recalcula na hora.
  - A linha "Amazon: cadastro de N produtos" mostra o preço por produto.
- [ ] Dê 15% de desconto (acima do limite de 10%).
  - **Esperado:** aviso de aprovação.
  - Como adm, o envio é direto.
  - Como consultor comum, a cotação iria para aprovação.
- [ ] ⭐ Clique em **"Salvar e enviar ao cliente"**.
  - **Esperado:** aparecem o link, o botão **WhatsApp com o número do cliente**, o botão **E-mail** e o botão **Contrato**.
- [ ] Clique em **WhatsApp**.
  - **Esperado:** abre o WhatsApp na conversa com o número do cliente, com a mensagem pronta.
- [ ] Clique em **E-mail** e em **Abrir no Gmail**.
  - **Esperado:** o e-mail abre com destinatário, assunto e texto.
- [ ] Clique em **Contrato**.
  - **Esperado:** aparece "Minuta para leitura" com os dados do cliente, dos canais e os valores.
- [ ] ⭐ Abra o **link da proposta** numa aba anônima (como se fosse o cliente).
  - Marque "Li e concordo", escreva o nome e clique em **Aceitar proposta**.
  - **Esperado:** "Proposta aceita!".
  - Na área do consultor sobe a janela "aceitou a proposta" com som.
- [ ] Abra o contrato de novo.
  - **Esperado:** mostra "Contrato aceito eletronicamente por …" com o código de registro.
- [ ] ⭐ Na cotação aceita, clique em **Cadastrar a loja com esta cotação** e cadastre.
  - **Esperado:** aparece a senha provisória. A loja nova tem o plano, os limites e a mensalidade da cotação.
- [ ] Entre com a loja nova numa janela anônima.
  - **Esperado:** pede para criar uma senha e depois abre o painel.

### Contrato e liberações de uma loja
- [ ] ⭐ Em **Lojas**, abra a loja de exemplo. Troque o plano pelos cartões, libere um recurso como extra, aumente as lojas físicas com o "+" e altere a mensalidade.
  - **Esperado:** o resumo "O que muda para o lojista" lista tudo; perdas aparecem em vermelho.
- [ ] Clique em **Salvar e aplicar agora**.
  - **Esperado, no painel da loja em poucos segundos:** sobe a janela "Seu plano foi atualizado" e a tela do recurso liberado ou bloqueado muda.
- [ ] **Modo suporte:** clique em "Ver painel (modo suporte)".
  - **Esperado:** o painel da loja abre com a faixa "Modo suporte", sem poder alterar nada.
  - A outra janela do lojista continua normal.
  - "Voltar para a área do consultor" volta.

### Suporte em tempo real (chat)
- [ ] ⭐ No painel da loja, em **Suporte**, abra um chamado.
  - **Esperado:** na área do consultor sobe a janela com som, e o menu Suporte fica com o contador vermelho.
- [ ] ⭐ Responda como consultor.
  - **Esperado:** a resposta aparece **na hora** na conversa do lojista.
  - Se o lojista estiver em outra tela, sobe a janela com som e o menu Suporte mostra o contador.
- [ ] Digite uma resposta sem enviar enquanto o outro lado manda mensagem.
  - **Esperado:** a mensagem nova aparece e o que você digitava não se perde.
- [ ] No consultor, Ctrl + Enter envia a resposta.

### Gestão
- [ ] **Tabela de preços:** altere o preço de um marketplace e salve. Preencha os "Dados da WedTech no contrato".
  - **Esperado:** a próxima cotação usa o preço novo e o contrato mostra os dados da empresa.
- [ ] **Consultores:** cadastre um consultor.
  - **Esperado:** aparece a senha provisória.
- [ ] **Registro de ações:** mostra cotações, contratos, senhas e acessos em modo suporte.

## 6. Sair e reiniciar

- [ ] Saia da área do consultor (menu lateral → Sair).
  - **Esperado:** o painel da loja continua conectado.
- [ ] ⭐ Pressione uma tecla na janela do `iniciar-tudo.bat` e rode o `.bat` de novo.
  - **Esperado:** todos são desconectados e precisam entrar de novo; os dados continuam lá.

---

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| Página não abre / "conexão recusada" | Rode `iniciar-tudo.bat` de novo; veja se a janela "WedTech - Painel (8000)" está aberta. |
| Vitrine sem produtos | Entre no painel da loja uma vez e confira se o marketplace está conectado em **Canais de venda**. |
| Não atualiza sozinho | Dê F5 uma vez (código antigo em cache). Confira se as duas telas estão no mesmo servidor (`localhost:8000`). |
| Sem som | Clique uma vez na página (o navegador exige) e confira o botão de som em Notificações. |
| Porta ocupada | Feche as janelas "WedTech - …" antigas ou reinicie o computador. |
| Tudo deslogou | Normal depois de reiniciar o servidor ou de 2 horas sem uso. |
