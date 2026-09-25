# Dashboard por perfil e conta Binance

## Resultado

- Mostrar no dashboard do perfil conectado um comparativo DEMO versus REAL com histórico, ganhos, perdas, taxa de sucesso, ROI e gráfico acumulado.
- Mostrar risco, margem, alerta de perda, volume em carteira, capital disponível e capital comprometido em ordens, sempre conforme o modo salvo do perfil.
- Atualizar os painéis automaticamente após uma troca de modo, sem misturar dados DEMO e REAL.
- Exibir os mesmos registros e estados na tela de Trades.

## Segurança da operação REAL

- Manter as credenciais Binance criptografadas e isoladas por perfil; nenhuma chave ou segredo será enviado ao navegador ou exibido em logs.
- Validar conta, saldos e permissões com uma consulta assinada somente no servidor.
- Implementar “ordem de teste” usando a validação oficial da Binance, que verifica assinatura, filtros e permissões sem executar ou movimentar fundos.
- Não enviar uma ordem financeira real em nome do usuário. A primeira ordem efetiva continuará exigindo confirmação explícita do titular na interface.

## Implementação

- Ampliar a integração Binance Spot para retornar saldos de carteira e capital disponível, além de consultar ordens abertas e validar ordens de teste.
- Criar funções autenticadas que resolvem o modo salvo no servidor e retornam um resumo financeiro seguro do perfil.
- Consolidar os dados DEMO/REAL existentes em um painel comparativo e ligar os cartões de risco e desempenho ao mesmo modo persistido.
- Adicionar estados de carregamento, vazio e erro, atualização periódica e invalidação imediata após mudança de modo.
- Registrar a validação da ordem de teste sem representá-la como execução financeira real.

## Validação

- Cobrir cálculos, isolamento por usuário, alternância DEMO/REAL e respostas inválidas com testes.
- Validar o fluxo autenticado e a apresentação em desktop e celular.
- Confirmar que nenhuma credencial aparece no navegador, respostas ou mensagens de erro.