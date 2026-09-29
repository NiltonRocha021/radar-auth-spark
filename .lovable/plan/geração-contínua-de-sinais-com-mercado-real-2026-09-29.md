# Geração contínua de sinais com mercado real

## Objetivo
Restabelecer a geração de sinais usando somente dados atuais de mercado, sem permitir que valores simulados alimentem análises ou operações reais.

## Implementação
- Criar um scanner central de mercado que consulte candles reais da Binance, valide qualidade e atualidade dos dados, calcule tendência, volatilidade, RSI, volume, entrada, proteção, alvos e confiança.
- Executar o scanner automaticamente quando a tela de sinais detectar ausência ou desatualização, com trava de frequência e deduplicação para impedir sinais repetidos.
- Persistir apenas sinais originados de candles reais; quando nenhuma oportunidade atingir o critério, retornar um estado explícito de “mercado analisado, sem oportunidade” em vez de dados fictícios.
- Corrigir a consulta de sinais para não ocultar registros válidos por diferenças de status, expiração ou formato de período.
- Expor na interface a origem, o horário da análise e eventuais falhas das fontes reais.
- Remover os mocks da tela de sinais também no ambiente de desenvolvimento, evitando confundir demonstração visual com análise real.

## Validação
- Testar cálculo, validade, deduplicação, expiração e recusa de candles incompletos ou antigos.
- Confirmar com dados reais que sinais são gravados, aparecem na tela e atualizam sem recarregar.
- Verificar dashboard, bot, risco, sentimento e manipulação para que dados indisponíveis apareçam como indisponíveis, nunca como números simulados.
- Validar telas críticas em computador e celular, executar testes e conferir a segurança do banco.

## Segurança operacional
- A geração de sinais apenas analisa mercado e não envia ordens.
- Toda ordem REAL continuará exigindo as proteções existentes e confirmação explícita do titular.
- Restringir o estado global de segurança de negociação ao usuário autorizado, removendo a leitura ampla atualmente detectada.
