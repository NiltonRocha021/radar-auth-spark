# Alertas financeiros, risco e validação LIVE

## Implementação
- Exibir no dashboard alertas persistentes quando o saldo LIVE ficar negativo ou cair abaixo do melhor saldo, com aviso sonoro único por nova piora e opção de silenciar.
- Criar painel de risco por par com posições abertas, margem, risco estimado, stop e severidade, atualizado a cada 15 segundos.
- Exibir no dashboard o ROI acumulado LIVE e um gráfico do saldo líquido real por ordem, atualizado pelo mesmo polling.
- Mostrar na lista administrativa um selo LIVE/DEMO por usuário conforme a configuração real do bot, sem expor credenciais.
- Completar os metadados próprios das rotas alteradas e validar os estados vazio, carregando e erro.

## Validação administrativa
- Abrir a área administrativa com a sessão autorizada disponível.
- Criar o perfil “Magnata” somente após haver e-mail e senha provisória válidos; o nome sozinho não permite criar uma conta segura.
- Confirmar visualmente que o status do bot aparece na lista e no detalhe do usuário.

## Publicação e Binance
- Validar o dashboard em desktop, executar os testes relevantes e confirmar que o projeto está íntegro.
- Publicar após a validação.
- Abrir o formulário seguro para substituir `BINANCE_API_KEY`, `BINANCE_API_SECRET` e definir `BINANCE_BASE_URL` para produção. As chaves nunca serão exibidas no chat.

## Limitações externas
- Créditos da conta não podem ser recarregados pelo projeto; se a publicação ou ferramentas estiverem bloqueadas por saldo, será necessário recarregar no workspace.
- A ativação e confirmação de ordens LIVE só ocorrerão depois que novas credenciais reais forem salvas com segurança.
