# Roteiro do vídeo de demonstração — WedTech

## Jeito mais fácil: demonstração automática

O sistema tem uma página que **testa todas as funcionalidades sozinha**, na tela, para você só gravar:
- ela clica e digita com um cursor visível;
- explica cada etapa numa legenda grande;
- marca ✓ em cada verificação que funciona.

São 17 etapas e 33 verificações:

| Área | O que a demonstração faz |
|---|---|
| Site | pedido de proposta com os dados da loja |
| Login | entra com as duas contas no mesmo navegador |
| Painel da loja | indicadores, ajuste de estoque, fornecedores, caixa com Pix, pedidos, notificações, menu do perfil e telas de gestão |
| Mercado Livre | venda na vitrine caindo no painel ao vivo, com o estoque baixando sozinho |
| Suporte | chamado respondido em tempo real |
| Área do consultor | cotação por marketplace, proposta e contrato aceitos pelo cliente, loja criada, mudança de plano chegando ao lojista e registro de ações |

1. Rode o `iniciar-tudo.bat`.
2. **Recomendado:** faça uma cópia do `database.sqlite`, porque a demonstração cria pedidos, chamado, cotação e uma loja.
3. Abra **http://localhost:8000/demonstracao/** e aperte **F11** (tela cheia).
4. Comece a gravar (**Windows + Alt + R**, Clipchamp ou OBS).
5. Escolha a velocidade:
   - **Devagar** se for narrar por cima (cerca de 12 minutos);
   - **Normal** (cerca de 8 minutos).

   Clique em **Começar**.
6. No fim aparece o resumo com todas as verificações. Pare a gravação.

Dá para rodar quantas vezes quiser. O contrato da loja de exemplo volta sozinho ao que era.

---

## Jeito manual: você mesmo conduz

Vídeo de **8 a 10 minutos** mostrando o sistema funcionando de ponta a ponta. São 7 cenas; cada uma diz **o que fazer** na tela e **o que falar** (sugestão, adapte ao seu jeito).

---

## Antes de gravar

### Programa de gravação (escolha um)
- **Clipchamp** (já vem no Windows 11): abra o Clipchamp → "Gravar" → "Tela". Grava a tela inteira com o microfone e já edita.
- **OBS Studio** (grátis, obsproject.com): mais controle. Use a fonte "Captura de tela" e grave em 1920×1080, 30 fps, formato MP4.
- Evite o Win + Alt + R (Xbox Game Bar): ele grava só uma janela, e a demonstração alterna entre várias.

### Deixe tudo pronto
1. Faça uma **cópia de segurança** do `database.sqlite`. Depois da gravação, dá para voltar ao estado de antes.
2. Rode `iniciar-tudo.bat`.
3. Abra **três janelas do navegador**, maximizadas, com zoom em 100% ou 110%:
   - **Janela A:** painel da loja (entre com o exemplo **vendedor**).
   - **Janela B:** área do consultor (entre com o exemplo **adm** no mesmo navegador: as duas contas funcionam juntas).
   - **Janela C:** vitrine do Mercado Livre, http://localhost:8011/.
4. No painel da loja, confira em **Canais de venda** se Mercado Livre, Amazon e Shopee estão **conectados**.
5. Clique uma vez em cada janela. O navegador só libera o som dos avisos depois de um clique.
6. **Ensaie uma vez** sem gravar, seguindo este roteiro.
7. Feche notificações do Windows, WhatsApp e e-mail (modo "Não incomodar").

> Dica: use **Alt + Tab** para alternar entre as janelas durante a gravação.

---

## Cena 1 — Abertura e site (≈ 1 min)

**Na tela:**
1. Abra http://localhost:8000/ e role devagar até "Como funciona".
2. Clique em **Falar com um consultor** e preencha:
   - loja "Moda da Ana", ramo Moda, CNPJ `11.222.333/0001-81`, cidade "São Paulo/SP", 1 loja, 50 a 200 produtos;
   - canais Mercado Livre e Shopee;
   - nome "Ana Souza", e-mail e WhatsApp (pode ser o seu).
3. Clique em **Quero minha proposta**.

**Falar:**
> "Esta é a WedTech: um sistema para a loja de bairro vender em vários lugares ao mesmo tempo (loja física, site, WhatsApp e marketplaces) com um estoque só. O lojista não vê preço no site: ele conta sobre a loja e um consultor monta a proposta sob medida."

## Cena 2 — Consultor faz a cotação (≈ 1 min 30 s)

**Na tela (janela B):**
1. Mostre a **janela flutuante** "Novo contato pelo site" que acabou de subir.
2. Em **Contatos do site**, mostre os dados da Moda da Ana e clique em **Fazer cotação**.
3. Mostre que tudo veio preenchido. Marque a **Amazon** e mude os produtos para 100: o preço recalcula.
4. Aponte a **mensalidade por marketplace** e o **cadastro por produto**.
5. Clique em **Salvar e enviar ao cliente**. Mostre os botões **WhatsApp** (com o número do cliente), **E-mail** e **Contrato**.

**Falar:**
> "O pedido cai na hora para o consultor, já com os dados da loja. Ele faz a cotação com um clique: o preço é calculado pela tabela: cada marketplace tem a sua mensalidade e cada produto cadastrado tem um custo. O sistema sugere o plano mais barato que atende. Aí é só mandar pelo WhatsApp ou por e-mail."

## Cena 3 — Cliente aceita com contrato (≈ 1 min)

**Na tela:**
1. Clique em **Ver proposta** (abre numa aba nova).
2. Role a proposta e clique em **Ler o contrato**. Mostre as cláusulas rapidamente e volte.
3. Marque "Li e concordo", escreva "Ana Souza" e clique em **Aceitar proposta**.
4. Volte para a janela B: mostre a janela **"aceitou a proposta"** com som.
5. Clique em **Cadastrar a loja com esta cotação** → **Cadastrar loja e gerar acesso**. Mostre a senha provisória.

**Falar:**
> "O cliente recebe a proposta com o contrato, pode imprimir ou salvar em PDF, e aceita pelo link, sem precisar de login. O consultor é avisado na hora e cadastra a loja com um clique, já com o plano e as integrações que o cliente contratou."

## Cena 4 — Painel da loja (≈ 1 min 30 s)

**Na tela (janela A):**
1. **Início:** mostre os indicadores e clique em **Ruptura** (leva ao estoque filtrado). Volte.
2. **Caixa (PDV):** abra o caixa, venda um produto, pague em dinheiro com troco.
3. Mostre rapidamente **Pedidos** (filtros), **Estoque**, **Fornecedores** (ficha) e **Canais de venda** (taxas e aviso de prejuízo).
4. Clique no **círculo do perfil** no topo e mostre o menu.

**Falar:**
> "Esse é o painel do lojista. Na primeira tela ele já vê o que precisa de atenção, e cada número leva direto para resolver. O caixa funciona como o de mercado, com abertura e fechamento. Os pedidos de todos os canais ficam num lugar só, e o sistema avisa quando uma venda num marketplace daria prejuízo por causa das taxas."

## Cena 5 — Tempo real: venda no marketplace (≈ 1 min 30 s) ⭐ cena principal

**Na tela:** coloque a janela A (painel em **Pedidos**) e a janela C (vitrine) **lado a lado**: Windows + ← e Windows + →.
1. Na vitrine, mostre o estoque de um produto (ex.: "24 disponíveis").
2. Compre esse produto.
3. **Sem F5:** o pedido aparece no painel, sobe a janela flutuante com som e o estoque cai no painel e na vitrine.
4. Venda o mesmo produto no **Caixa (PDV)** e mostre o estoque caindo sozinho na vitrine.

**Falar:**
> "Aqui está o coração do sistema. O cliente comprou no Mercado Livre e, em três segundos, sem atualizar nada, o pedido caiu no painel com aviso sonoro e o estoque baixou em todos os canais. E vale o contrário: vendeu no balcão, o anúncio do marketplace se ajusta sozinho. Assim a loja nunca vende o que não tem."

## Cena 6 — Suporte e contrato em tempo real (≈ 1 min 30 s)

**Na tela:** janela A (lojista) e janela B (consultor) lado a lado.
1. No painel da loja, **Suporte** → **Abrir chamado** ("Como emito etiqueta?").
2. No consultor, mostre a janela com som e o contador vermelho; abra o chamado e responda.
3. No lojista, a resposta **aparece na hora** na conversa.
4. No consultor, abra **Lojas** → a loja de exemplo → no contrato, **libere Dispositivos (IoT)** como extra. Mostre o resumo "O que muda para o lojista" e clique em **Salvar e aplicar agora**.
5. No lojista, mostre a janela **"Seu plano foi atualizado"** e o menu IoT liberado.

**Falar:**
> "O lojista fala com o consultor por um chat dentro do sistema, em tempo real. E o consultor controla o que cada loja tem: troca o plano, libera um recurso, e o painel da loja muda na hora, com aviso. Antes de salvar, ele vê exatamente o que muda para o cliente."

## Cena 7 — Encerramento (≈ 30 s)

**Na tela:** volte à Visão geral do consultor (lojas online, chamados, mensalidades) e depois ao site.

**Falar:**
> "Resumindo: o cliente pede a proposta pelo site, o consultor cota e fecha com contrato, e a loja vende em todos os canais com um estoque só, tudo em tempo real. Essa é a WedTech."

---

## Depois de gravar

- Corte as pausas e os erros no Clipchamp ou em outro editor. Uma música de fundo baixa ajuda.
- Exporte em **1080p MP4**.
- Para voltar o sistema ao estado de antes, feche os servidores e restaure a cópia do `database.sqlite`.
- Publique no YouTube como **"Não listado"** se for mandar só para algumas pessoas, e coloque o link no README do GitHub.
