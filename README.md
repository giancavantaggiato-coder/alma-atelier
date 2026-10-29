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
- Para cadastrar vários de uma vez: Equipe → Alunos → **Adicionar alunos por e-mail**.
- No primeiro acesso o aluno completa primeiro nome, sobrenome, quantas vezes por semana vem e escolhe os dias (só aparecem horários com vaga). Se a equipe já marcou os dias dele, eles aparecem prontos.
- Para bloquear alguém: desligue **Acesso ao app** na ficha da pessoa. E-mail fora da base nem recebe o código.
- As aulas das próximas 10 semanas são criadas sozinhas (toda segunda às 9h, horário UTC).
- Trava extra no servidor (uma vez): **Authentication → Auth Hooks → Before User Created → Postgres → função `hook_antes_de_criar_usuario`** → Create/Enable.

## Quem vai aos eventos
- Embaixo de cada evento aparecem as fotinhas de quem se inscreveu (foto de perfil ou iniciais), com "Ana vai", "Você e mais 3" etc. Na ficha do evento, a lista completa.
- Banco: função `inscritos_eventos()` (migração 17). Fantasma só aparece para ele mesmo.

## Publicar
O app fica em https://app.almaestudosvisuais.com.br, publicado pelo GitHub Pages (workflow em `.github/workflows/pages.yml`) a cada alteração na branch main.
DNS na GoDaddy: CNAME `app` → `giancavantaggiato-coder.github.io`. A loja usa CNAME `loja` → `shops.myshopify.com`.
O app confere `version.json` ao voltar para a tela e recarrega sozinho quando sai versão nova.

## Instalar no iPhone
Abrir o endereço no Safari → Compartilhar → Adicionar à Tela de Início.
O login é por código de 6 dígitos (e não por link) justamente para funcionar dentro do app instalado.

## Tela inicial da equipe
- O admin abre em **Hoje**: saudação, se o atelier está aberto, quem está em aula agora, próxima aula (quantos vêm e "Ver quem vem"), pedidos de mudança (só quando há algum) e a agenda pessoal. Adicionar alunos, criar evento e pedidos ficam em **Você**.

## Agenda pessoal (só a equipe)
- Em **Hoje → Seu dia**: tarefas e compromissos do dia, o que ficou para trás e os próximos 7 dias. Toque no círculo para marcar como feita. Deslizar para a direita marca como urgente (fica no topo, com fundo dourado); para a esquerda remove, com Desfazer (se repete, tira só aquele dia). Ordem: urgentes no topo; depois as sem horário, que dá para segurar e arrastar (coluna `ordem`); depois as com horário, pelo relógio.
- Cada item tem dia, horário opcional (e fim), repetição (todo dia, toda semana, todo mês, com data final opcional), lembrete no celular (na hora até 1 semana antes) e anotações. Item que repete pode ser apagado só de um dia.
- No **Calendário**, um pontinho embaixo do número marca dia com coisa sua; ao tocar no dia aparece "Sua agenda" junto com as aulas.
- Banco: tabela `agenda_pessoal` (migração 27). Só o próprio dono, sendo da equipe, lê e escreve; alunos e o modo "ver como aluno" não enxergam.
- Lembretes: `gerar_lembretes_agenda()` roda a cada minuto (pg_cron `alma-agenda-lembretes`) e cria avisos (destino `equipe` com `auth_user_id` do dono), e a `enviar-push` manda só para esse login. Sem horário, o lembrete conta a partir das 8h.
- Menu do admin: Hoje · Calendário · Pessoas · Eventos · Você. **Horários** fica em Você → Horários do atelier.

## Primeiros passos da equipe
1. Entrar com o e-mail da equipe → aba **Equipe**.
2. **Horários**: conferir dias, horários e vagas.
3. **Pessoas → Adicionar alunos por e-mail**: colar os e-mails dos alunos.
4. Avisar os alunos para instalarem o app e entrarem com esse e-mail.

## Login fantasma
- `gianc.avantaggiato@gmail.com` entra como aluno fantasma: vê e usa todas as telas de aluno, mas não aparece em "alunos em aula", na chamada, nas vagas, nos inscritos de eventos nem na lista de Alunos (só em Alunos → Todos, marcado como "Fantasma").
- Mensalidade aparece como "Em construção" para os alunos por enquanto.

## Ver como aluno (dentro do app)
- Em Você → "Ver o app como aluno", a equipe passa a ver e usar o app como o seu cadastro fantasma (`equipe.fantasma_id`), sem sair da conta.
- O app manda o cabeçalho `x-alma-ver-como: aluno` e `meu_aluno_id()` devolve o fantasma. Uma faixa no topo volta para a equipe.

## Diário do aluno
- Aba Você → Diário: registros com tipo (anotação, obra, aula, referência), título, texto e até 10 fotos, em lista por mês.
- Tabela `diario` e bucket privado `diario` (fotos na pasta do login). A equipe vê o diário pelo cadastro do aluno (Ver diário).

## Lista de espera
- Em aula lotada o aluno entra na fila (`entrar_lista_espera`). Quando abre vaga, quem está na fila recebe aviso; quem marca primeiro fica com a vaga.

## Lembretes no celular
- `site/sw.js` recebe os avisos. Inscrições em `push_inscricoes`; avisos em `notificacoes`, enviados pela função `enviar-push`.
- Chaves no Vault: `vapid_publica`, `vapid_privada`, `push_segredo`. A pública também está em `config.js`.
- Avisos: véspera da aula (19h, pg_cron), aula cancelada, vaga aberta na lista de espera, pedido de mudança (equipe e aluno), reposição marcada por aluno (equipe, migração 30) e lembretes da agenda pessoal.
- No iPhone só funciona com o app instalado na tela de início (iOS 16.4+).

## Alertas da equipe
- `equipe_alertas()`: 2+ aulas seguidas sem vir, 6+ reposições acumuladas, aulas com lista de espera. Aparecem no Hoje da equipe.

## Modo vinho
- Sexta, das 22h à meia-noite (hora do aparelho), o app inteiro fica bordô (Cinzento 02 do brandbook), com detalhes em vermelho e creme. Vale para todos.
- No Hoje da equipe, sem aula, aparece "Provavelmente brindando" com duas taças (o mesmo desenho da opção Vinho) se tocando. A página Você mantém as cores do tema escolhido (claro ou escuro); o menu de baixo fica bordô.
- Para ver fora do horário: no app da equipe, Você → Luminosidade (Automático, Valor alto, Valor baixo, Vinho). Alunos não têm a opção Vinho. Também dá para abrir `app.almaestudosvisuais.com.br/?vinho=1`.
