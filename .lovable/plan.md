# Perfis DEMO/REAL e execução isolada por usuário

## Resultado
- Transformar o modo de operação em uma configuração persistida por usuário, visível no bot, dashboard, trades e administração.
- Permitir que administradores selecionem DEMO ou REAL na tela de perfis e salvem a alteração com auditoria.
- Manter cada conta Binance isolada: cada usuário cadastra e valida suas próprias credenciais em uma área segura.

## Implementação
1. **Configuração e segurança**
   - Adicionar `execution_mode` (`DEMO`/`LIVE`) à configuração do Bot4x, com DEMO como padrão.
   - Criar armazenamento privado de credenciais Binance por usuário, sem acesso direto pelo navegador e sem devolver o segredo após salvar.
   - Criptografar as credenciais no servidor com uma chave exclusiva do projeto.
   - Registrar ambiente (testnet/produção), sufixo mascarado, estado da validação e última verificação.

2. **Tela de perfis e configurações**
   - Na administração, adicionar botões DEMO/REAL por perfil e um botão Salvar.
   - Exibir o modo configurado separadamente do estado ligado/desligado do bot.
   - Em Configurações, adicionar conexão Binance por usuário: chave, segredo, ambiente, testar, salvar, substituir e remover.
   - Bloquear a gravação de REAL quando as credenciais daquele usuário não estiverem válidas ou o pré-voo estiver incompleto.

3. **Bot e ordens**
   - Remover o bloqueio global “Em breve” e carregar o modo persistido ao entrar.
   - Fazer o seletor do Bot4x salvar o modo no servidor e reiniciar corretamente o fluxo ao trocar.
   - Toda abertura de ordem consultará o modo persistido no servidor, sem aceitar que o navegador force LIVE.
   - DEMO usará o mesmo pipeline de ordens e cotações de mercado, sem enviar à Binance; LIVE usará somente as credenciais do usuário autenticado.
   - Registrar identificador e resposta segura da Binance nos metadados da ordem para conciliação, sem guardar segredos.

4. **Dashboard, alertas e administração**
   - Fazer risco, ROI, alertas visuais/sonoros e gráfico por par seguirem o modo escolhido pelo usuário.
   - Manter comparação DEMO/LIVE nas telas de trades, com o modo atual destacado.
   - Corrigir o estado LIVE da administração para refletir `modo LIVE + bot ativo + credenciais válidas`.
   - Remover os rótulos “Em breve” restantes; recursos externos sem integração disponível serão removidos da interface em vez de simulados.

5. **Validação e publicação**
   - Cobrir persistência por usuário, autorização administrativa, bloqueio seguro de LIVE, roteamento DEMO/LIVE e linhas inválidas.
   - Verificar desktop e celular, erros em tela, painel de risco, gráfico por par, administração e trades.
   - Entrar com a sessão autorizada e testar autenticação/conectividade da Binance sem enviar uma ordem financeira real.
   - Publicar no domínio configurado após build, testes e verificação visual sem erros.

## Limite de segurança
Não será criada, ativada, fechada ou alterada uma ordem financeira real em nome do usuário. A entrega validará credenciais e conectividade; a primeira ordem LIVE continuará exigindo uma ação explícita do titular dentro do produto.

## Detalhes técnicos
- Migrações com RLS e GRANTs explícitos; credenciais acessíveis apenas por funções autenticadas e operações privilegiadas verificadas.
- AES-GCM via Web Crypto para criptografia em repouso; chave mantida no cofre do projeto.
- Funções internas com autenticação; validação Zod; polling de 15 segundos preservado.
- Auditoria administrativa para toda mudança de modo.
