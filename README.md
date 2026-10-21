# Alma Atelier · beta

App do aluno (Hoje, Agenda, Eventos, Você) e painel da equipe (Chamada, Pessoas, Horários, Eventos).

## Pastas
- `site/` — o app. É esta pasta que vai para a hospedagem.
- `supabase/01_schema.sql` — tabelas, regras de reposição e segurança do banco `alma-alunos`.

## Base de pessoas
Uma tabela só (`pessoas`) para todo mundo que se relaciona com o Alma. Cada pessoa tem um registro para a vida toda; o vínculo muda com o tempo:
- **Aluno** e **Matrícula pausada**: entram no app (pausado vê tudo, mas não marca reposição).
- **Interessado** e **Ex-aluno**: ficam na base, sem acesso ao app. Ao virar ex-aluno, as turmas são encerradas e as vagas futuras liberadas automaticamente; se voltar, o histórico continua.
- **Compra na loja**: marcação independente do vínculo. Os campos `shopify_customer_id` e `bling_contato_id` já existem para a integração futura.
- Cada cadastro precisa de e-mail ou WhatsApp; alunos precisam de e-mail (é o login).
- Consentimento para receber novidades (LGPD) fica registrado com data.

## Regras que o banco aplica
- Desmarcar com 4h ou mais de antecedência gera 1 reposição. As reposições não vencem e não ficam presas a um dia: o aluno usa em qualquer aula com vaga, ou para remarcar uma aula que desmarcou.
- Aviso com menos de 4h fica registrado como ausência, sem reposição.
- Máximo de 8 reposições acumuladas.
- Reposição só em aula com vaga; desmarcar uma reposição devolve o crédito.
- Aula cancelada pelo atelier: quem estava confirmado ganha reposição (ou recebe o crédito de volta).
- Presença: aula encerrada conta como presença, a menos que a equipe marque "Faltou" na chamada.

## Configuração no painel do Supabase (uma vez) · projeto alma-cadastros
1. **SQL Editor → New query**: cole `supabase/colar-no-sql-editor.sql` e clique em Run.
   Confirme o aviso de "destructive operation" se aparecer (são as regras de desmarcar aula, sair de turma e cancelar inscrição; nada é apagado).
2. **Authentication → Emails → SMTP Settings**: ligue um envio de e-mail próprio.
   Com Google Workspace: host `smtp.gmail.com`, porta `465`, usuário giancarlo@almaestudosvisuais.com.br e uma *senha de app* do Google.
   Sem isso o Supabase só envia e-mails para membros da equipe da conta, poucos por hora.
3. **Authentication → Emails → Templates → Magic Link**: troque o corpo por algo como
   `Seu código para entrar no Alma: {{ .Token }}` — é esse código de 6 dígitos que o app pede.
4. **Authentication → URL Configuration → Site URL**: o endereço onde o app ficar (ex.: `https://app.almaestudosvisuais.com.br`).

## Acesso ao app
- Quem está cadastrado como **Aluno** com e-mail entra direto: no primeiro acesso o app manda o código para esse e-mail.
- Depois de entrar, a pessoa cria uma **senha de 4 números**. Das próximas vezes digita o e-mail e a senha, sem código.
  - O app lembra o e-mail no aparelho. Sequências óbvias (1234, 1111) não são aceitas.
  - **Esqueci a senha**: o app manda o código por e-mail e pede uma senha nova.
  - 5 senhas erradas bloqueiam a senha; a pessoa entra pelo código e cria outra.
  - Trocar a senha: aba **Você → Trocar senha de acesso**.
  - Por trás: tabela `senhas_app` (só o hash), funções em `supabase/13_senha_pin.sql` e a Edge Function `entrar-pin`.
- Para cadastrar vários de uma vez: Equipe → Pessoas → **Adicionar alunos por e-mail**.
- No primeiro acesso o aluno completa primeiro nome, sobrenome, quantas vezes por semana vem e escolhe os dias (só aparecem horários com vaga). Se a equipe já marcou os dias dele, eles aparecem prontos.
- Para bloquear alguém: desligue **Acesso ao app** na ficha da pessoa. E-mail fora da base nem recebe o código.
- As aulas das próximas 10 semanas são criadas sozinhas (toda segunda às 9h, horário UTC).
- Trava extra no servidor (uma vez): **Authentication → Auth Hooks → Before User Created → Postgres → função `hook_antes_de_criar_usuario`** → Create/Enable.

## Publicar
O app fica em https://app.almaestudosvisuais.com.br, publicado pelo GitHub Pages (workflow em `.github/workflows/pages.yml`) a cada alteração na branch main.
DNS na GoDaddy: CNAME `app` → `giancavantaggiato-coder.github.io`. A loja usa CNAME `loja` → `shops.myshopify.com`.
O app confere `version.json` ao voltar para a tela e recarrega sozinho quando sai versão nova.

## Instalar no iPhone
Abrir o endereço no Safari → Compartilhar → Adicionar à Tela de Início.
O login é por código de 6 dígitos (e não por link) justamente para funcionar dentro do app instalado.

## Primeiros passos da equipe
1. Entrar com o e-mail da equipe → aba **Equipe**.
2. **Horários**: conferir dias, horários e vagas.
3. **Pessoas → Adicionar alunos por e-mail**: colar os e-mails dos alunos.
4. Avisar os alunos para instalarem o app e entrarem com esse e-mail.

## Login fantasma
- `gianc.avantaggiato@gmail.com` entra como aluno fantasma: vê e usa todas as telas de aluno, mas não aparece em "alunos em aula", na chamada, nas vagas, nos inscritos de eventos nem na lista de Alunos (só em Pessoas → Todos, marcado como "Fantasma").
- Mensalidade aparece como "Em construção" para os alunos por enquanto.
