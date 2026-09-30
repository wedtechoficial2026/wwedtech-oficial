# WedTech

Sistema omnichannel para lojas de bairro: **um estoque só** para a loja física, o site próprio, o WhatsApp e os marketplaces (Mercado Livre, Amazon, Shopee e outros). Tudo em tempo real: vendeu em um canal, o estoque cai em todos.

A WedTech é vendida por consultores. O cliente pede proposta pelo site, o consultor monta a cotação com o preço de cada marketplace e de cada produto a cadastrar, o cliente aceita pelo link (com contrato) e a loja é criada já configurada.

> **Protótipo funcional (MVP de demonstração).** As vitrines dos marketplaces são simuladas: não publicam anúncios nem chamam as APIs oficiais, e nenhum pagamento é processado. Veja [Limitações](#limitações).

---

## Sumário

- [Como rodar](#como-rodar)
- [Contas de exemplo](#contas-de-exemplo)
- [O que o sistema faz](#o-que-o-sistema-faz)
- [Endereços](#endereços)
- [Como funciona por dentro](#como-funciona-por-dentro)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Testes](#testes)
- [Limitações](#limitações)
- [Documentos](#documentos)

---

## Como rodar

**Requisitos:** Windows e PHP 8.3 com as extensões `pdo_sqlite` e `mbstring`. Se o PHP não estiver instalado:

```bat
winget install --id PHP.PHP.8.3 -e
```

**Para iniciar tudo de uma vez**, dê dois cliques em **`iniciar-tudo.bat`**. Ele:

- sobe o painel em `http://localhost:8000` e as três vitrines de marketplace (portas 8011, 8012 e 8013), cada uma numa janela minimizada;
- abre o site no navegador.

Para **encerrar todos os servidores**, pressione qualquer tecla na janela do `iniciar-tudo.bat`.

Na primeira execução o banco `database.sqlite` é criado sozinho, com as contas abaixo.

**Primeiro acesso:**
1. Entre como lojista e escolha o tipo de loja, por exemplo **Eletrônicos e acessórios**. Isso cria o catálogo de exemplo, e as vitrines dos marketplaces passam a vender esses produtos.
2. Em **Canais de venda**, conecte os marketplaces que quiser mostrar. A loja já começa com dois conectados.

> Reiniciar o servidor desconecta todo mundo. A sessão também expira depois de 2 horas sem uso.

Em outro sistema operacional, rode o servidor embutido do PHP na pasta do projeto:

```bash
php -S localhost:8000
# vitrines (opcional), uma por terminal:
php -S localhost:8011 -t marketplaces/mercado-livre marketplaces/router.php
php -S localhost:8012 -t marketplaces/amazon marketplaces/router.php
php -S localhost:8013 -t marketplaces/shopee marketplaces/router.php
```

## Contas de exemplo

Os botões "Exemplo" da tela de login preenchem os dados.

| Perfil | E-mail | Senha | Abre |
|---|---|---|---|
| Lojista (vendedor) | `admin@wedtech.com` | `admin123` | Painel da loja |
| Administrador WedTech | `adm@wedtech.com` | `adm123` | Área do consultor |

**As duas contas funcionam juntas no mesmo navegador.** A sessão guarda a conta da loja e a da equipe WedTech ao mesmo tempo, e sair de uma não derruba a outra.

---

## O que o sistema faz

### Site (página inicial)
- Apresenta o produto sem mostrar preços: a contratação passa sempre por um consultor.
- **Pedido de proposta** com:
  - dados da loja: nome, ramo, CNPJ com validação dos dígitos, cidade, lojas físicas e quantidade de produtos;
  - canais desejados e contatos.
- Chat com vendedor e montagem de plano com IA (simulados).

### Painel da loja (lojista)
- **Início:** indicadores clicáveis (ruptura, vendas de hoje, canais que vendem bem, produtos parados). Cada um leva direto à área que resolve o assunto.
- **Caixa (PDV):** abertura e fechamento de caixa da loja física, leitor de código de barras, formas de pagamento, sangria e suprimento.
- **Retiradas:** pedidos para retirar na loja.
- **Pedidos:** filtros por loja e canal.
- **Devoluções e trocas:** pedidas pelo cliente e analisadas pelo lojista, seguindo os prazos do Código de Defesa do Consumidor.
- **Produtos e Estoque:** estoque por local, ajuste com motivo, alertas de estoque baixo.
- **Fornecedores e compras:** ficha de cada fornecedor (CNPJ, contato, endereço, produtos) e pedido de reposição quando o estoque está baixo.
- **Canais de venda:**
  - conectar marketplaces;
  - taxas reais de cada plataforma e margem mínima;
  - aviso de venda com prejuízo.
- **Financeiro, Datas e sazonalidade, Anúncios, Automações, Dispositivos (IoT), WedTech AI.**
- **Notificações:** janela flutuante com som para pedidos, devoluções, respostas do consultor e mudanças de plano. O som pode ser desligado.
- **Suporte:** chat com o consultor, com mensagens não lidas.
- **Menu do perfil** (avatar no topo): plano, consultor, configurações, trocar senha e sair.

### Área do consultor (consultor e administrador)
- **Visão geral:** lojas que precisam de atenção, chamados abertos, mensalidades e lojas *online agora*.
- **Contatos do site:** pedidos de proposta com os dados da loja. Um clique faz a cotação ou cadastra a loja já preenchida.
- **Cotações:**
  - **Como o preço é montado:**
    - mensalidade = plano + integração de cada marketplace + recursos extras;
    - pagamento único = **cadastro de cada produto em cada marketplace** + implantação;
    - o plano mais barato que atende é sugerido automaticamente.
  - **Envio:** proposta com link próprio para o cliente ler, imprimir ou salvar em PDF e **aceitar sem login**. O link vai pelo **WhatsApp** (direto no número do cliente) ou por **e-mail**.
  - **Contrato:** contrato de prestação de serviços gerado a partir da cotação, com registro do aceite eletrônico.
  - **Desconto:** acima do limite, a cotação espera a aprovação do administrador.
  - **Cotação aceita:** vira a loja com o contrato já aplicado.
- **Lojas:** cadastro com senha provisória e contrato em cartões. O contrato mostra:
  - plano, recursos incluídos, extras e bloqueados, e limites;
  - o resumo "o que muda para o lojista" antes de salvar.

  A mudança vale no painel da loja em segundos.
- **Modo suporte:** o consultor vê o painel da loja em somente leitura.
- **Suporte:** chamados em forma de chat, em tempo real, com aviso sonoro.
- **Tabela de preços** (o administrador edita): planos, cada marketplace (mensalidade e cadastro por produto), recursos, implantação, desconto máximo e dados da empresa para o contrato.
- **Consultores e Registro de ações:** cada consultor vê só as lojas dele; tudo fica registrado.

### Vitrines de marketplace (simuladas)
- Mercado Livre, Amazon e Shopee, cada uma no próprio endereço, com o **mesmo estoque** do painel.
- A compra cai no painel na hora, com aviso.
- O estoque se atualiza sozinho em todas as telas.
- O cliente acompanha o pedido e pode pedir devolução.

---

## Endereços

| O quê | Endereço |
|---|---|
| Site | http://localhost:8000/ |
| Login | http://localhost:8000/login.php |
| Painel da loja | http://localhost:8000/modulos/index.php |
| Site próprio da loja | http://localhost:8000/modulos/loja.html |
| Área do consultor | http://localhost:8000/consultor/index.php |
| Proposta do cliente | http://localhost:8000/proposta.php?t=CÓDIGO |
| Contrato | http://localhost:8000/contrato.php?t=CÓDIGO |
| Vitrine Mercado Livre | http://localhost:8011/ |
| Vitrine Amazon | http://localhost:8012/ |
| Vitrine Shopee | http://localhost:8013/ |
| Banco de dados (só no próprio computador) | http://localhost:8000/banco.php |
| **Demonstração automática** (para gravar o vídeo) | http://localhost:8000/demonstracao/ |

---

## Como funciona por dentro

- **Backend:** PHP 8.3 sem framework, com banco SQLite (`database.sqlite`, criado sozinho).
- **Frontend:** HTML, CSS e JavaScript puros, sem build e sem dependências externas. Funciona sem internet.
- **Estado da loja:** cada loja tem um estado em JSON com número de revisão (`app_states`), espelhado em tabelas relacionais (produtos, estoque, pedidos, devoluções…). Duas telas salvando ao mesmo tempo não sobrescrevem uma à outra em silêncio: a gravação conflitante é recusada.
- **Tempo real:** as telas consultam o servidor a cada 3 segundos e só baixam os dados quando algo mudou:
  - painel: `api/state.php?revisao=1`;
  - área do consultor: `api/consultor.php?acao=pulso`;
  - suporte: `api/suporte.php?pulso=1`.
- **Sessões:**
  - cada servidor (porta) tem o próprio cookie;
  - a mesma sessão guarda a conta da loja e a da equipe;
  - o painel diz de qual conta é cada chamada pelo cabeçalho `X-WedTech-Conta`.
- **Contrato da loja:** plano, limites e módulos vêm do cadastro feito pelo consultor. O painel do lojista não consegue alterá-los.
- **Banco versionado:** as migrações rodam sozinhas ao abrir o sistema e estão registradas em `schema_migrations`.

---

## Estrutura de pastas

```
index.html                 página inicial (site)
login.php, logout.php      entrada e saída (duas contas por navegador)
trocar-senha.php           senha provisória no primeiro acesso ou troca pelo menu
proposta.php               proposta pública para o cliente (aceite sem login)
contrato.php               contrato gerado a partir da cotação
banco.php                  visualizador do banco (Adminer) — só responde no próprio computador
painel.php                 painel clássico (legado, mantido para dados antigos)
iniciar-tudo.bat           sobe o painel e as três vitrines de uma vez
iniciar-servidor.bat       sobe só o painel

api/                       endpoints JSON
  state.php                estado da loja (com revisão e consulta leve)
  consultor.php            área do consultor (lojas, cotações, chamados, preços…)
  suporte.php              chamados do lojista
  marketplace.php          catálogo e checkout das vitrines
  leads.php                pedidos de proposta do site
  login.php, sessao.php…   autenticação
backend/
  auth.php                 sessão com duas contas, login, troca de senha
  db.php, schema.php       conexão e criação do banco
  relational_schema.php    tabelas relacionais e migrações
  relational_store.php     espelho do estado nas tabelas
  app_state.php            leitura e gravação do estado com revisão
  consultor.php            perfis, lojas, contrato, chamados, pulso, modo suporte
  cotacoes.php             tabela de preços, cálculo, proposta e aceite
  marketplace_storefront.php  vitrines: catálogo, checkout, pedidos e devoluções
consultor/index.php        casca da área do consultor
modulos/index.php          casca do painel da loja
modulos/loja.html          site próprio da loja
marketplaces/              vitrines Mercado Livre, Amazon e Shopee + roteador
frontend/
  js/modulos/core/         regras de negócio (estoque, pedidos, caixa, devoluções…)
  js/modulos/app/          telas do painel (paginas/*.js), ações e eventos
  js/consultor/            área do consultor
  js/marketplaces/         vitrines
  js/shared/               sincronização com o servidor e avisos (janela + som)
  js/site/                 página inicial
  css/                     estilos por área
tests/                     testes PHP (banco em memória)
docs/                      roteiro de verificação e roteiro do vídeo
vendor/php/adminer.php     Adminer (visualizador de banco, terceiros)
```

---

## Testes

Testes automáticos das regras do servidor (usam banco em memória, não mexem no `database.sqlite`):

```bat
php tests\app_state_test.php
php tests\marketplace_checkout_test.php
php tests\consultor_test.php
```

Cada um termina com `...: OK`. O roteiro de verificação manual completo está em [`docs/VERIFICACAO.md`](docs/VERIFICACAO.md).

---

## Limitações

Para uso com lojas reais ainda faltam:

1. **Integração oficial com os marketplaces** (OAuth, anúncios, pedidos e webhooks de cada plataforma). Hoje as vitrines são simuladas.
2. **Nota fiscal** (NF-e/NFC-e).
3. **Publicação online** com HTTPS, banco de produção e backup automático.
4. **Envio de e-mail pelo sistema** e "esqueci minha senha". Hoje a proposta por e-mail abre o programa de e-mail de quem envia.
5. **Cobrança da mensalidade** (Pix, boleto ou cartão) e **pagamento real no PDV** (Pix e maquininha).
6. **Vários usuários por loja** (caixa, gerente).
7. **Revisão jurídica** do modelo de contrato e dos termos de uso.

Pontas conhecidas:
- **Loja suspensa:** a suspensão bloqueia o próximo login; quem já está com o painel aberto só sai quando a sessão termina.
- **Módulos bloqueados:** IoT e automações ficam escondidos no painel, mas o servidor ainda não bloqueia.
- **Link da proposta:** só abre para o cliente quando o sistema estiver publicado na internet.

---

## Documentos

- [`docs/VERIFICACAO.md`](docs/VERIFICACAO.md): lista de tudo o que conferir para garantir que o sistema está rodando.
- [`docs/ROTEIRO-VIDEO.md`](docs/ROTEIRO-VIDEO.md): como gravar o vídeo. O jeito mais fácil é a **demonstração automática** (`demonstracao/`), que usa o sistema sozinha, com legenda, e apresenta o pitch em 12 cenas (contratação, venda completa, ruptura, anúncio, suporte, sazonalidade, devolução e estoque) com 30 verificações. Ela cria dados de verdade, então faça uma cópia do `database.sqlite` antes.
