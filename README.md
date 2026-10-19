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
- Desmarcar com 4h ou mais de antecedência gera 1 reposição, válida por 1 ano a partir da aula perdida.
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

## Liberar o acesso ao app
- Só entra no app quem a equipe liberou: na ficha da pessoa (Equipe → Pessoas), vínculo **Aluno** e **Liberar acesso ao app** ligado.
- E-mail não liberado nem recebe o código. Desligar a opção corta o acesso na hora.
- Trava extra no servidor (uma vez): **Authentication → Auth Hooks → Before User Created → Postgres → função `hook_antes_de_criar_usuario`** → Create/Enable.

## Publicar
O Netlify publica sozinho a cada alteração enviada a este repositório (pasta `site`, configurada em `netlify.toml`).
Domínio próprio: em Domain management, adicione `app.almaestudosvisuais.com.br` e crie o registro CNAME indicado no seu provedor de domínio.

## Instalar no iPhone
Abrir o endereço no Safari → Compartilhar → Adicionar à Tela de Início.
O login é por código de 6 dígitos (e não por link) justamente para funcionar dentro do app instalado.

## Primeiros passos da equipe
1. Entrar com o e-mail da equipe → aba **Equipe**.
2. **Horários**: conferir dias, horários e vagas; depois **Gerar** as aulas das próximas semanas.
3. **Alunos**: cadastrar cada aluno com o e-mail que ele vai usar e marcar os dias fixos.
4. Avisar os alunos para instalarem o app e entrarem com esse e-mail.
