import time
import statistics
from collections import deque

# --- Configuracoes de Seguranca ---
JANELA_TEMPORAL = 86400
LIMIAR_SENSIBILIDADE = 2.5
COOLDOWN_SEG = 300
TAMANHO_MIN_BUFFER = 10
# Janela historica aceita: 90 dias atras ate agora (dinamico, nao hardcoded)
JANELA_HISTORICA_DIAS = 90

buffer_volume = deque(maxlen=60)  # maxlen elimina o popleft() manual
ultima_anomalia_ts = 0

def get_data_minima_ms() -> int:
    """Retorna timestamp minimo aceito: agora menos 90 dias (em ms)."""
    return int((time.time() - JANELA_HISTORICA_DIAS * 86400) * 1000)

def validar_e_processar(payload):
    global ultima_anomalia_ts

    # 1. Validacao Temporal — dinamica (90 dias atras)
    ultimo_ts_historico = payload['history'][-1][0]
    data_minima = get_data_minima_ms()
    if ultimo_ts_historico < data_minima:
        print(f"[X] REJEITADO: Dados historicos obsoletos ({ultimo_ts_historico} < {data_minima}).")
        return False

    # 2. Verifica Estado de Cooldown
    tempo_atual = time.time()
    if tempo_atual - ultima_anomalia_ts < COOLDOWN_SEG:
        print(f"[!] MODO DE SEGURANCA: Bloqueado (Cooldown).")
        return False

    # 3. Validacao de Volume (Z-Score)
    vol_atual = payload['volume']

    if len(buffer_volume) >= TAMANHO_MIN_BUFFER:
        vols = [d['vol'] for d in buffer_volume]
        media = statistics.mean(vols)
        std = statistics.stdev(vols)
        limiar = media + (LIMIAR_SENSIBILIDADE * std)

        if std > 0 and vol_atual > limiar:
            print(f"[!!!] ANOMALIA DE VOLUME: {vol_atual:.2f} > {limiar:.2f}. Protecao ativada.")
            ultima_anomalia_ts = tempo_atual
            return False

    # 4. Dado aprovado — deque(maxlen=60) descarta o mais antigo automaticamente
    buffer_volume.append({'ts': time.time(), 'vol': vol_atual})


    print(f"[*] SINAL VALIDADO: {payload['signalId']} | Volume: {vol_atual:.2f}")
    return True

if __name__ == "__main__":
    sinal_recebido = {
        "signalId": "SIG-26scyzkqg",
        "symbol": "ETHUSDT",
        "price": 2003.75,
        "volume": 749640660.811721,
        "history": [[1502942400000, 301.13, 301.13, 301.13, 301.13, 0.42643]]
    }

    if validar_e_processar(sinal_recebido):
        print("Executando ordem...")
    else:
        print("Ordem cancelada por seguranca.")
