from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import requests
import json
import re

app = FastAPI()

class SignalData(BaseModel):
    pair: str
    rsi: float
    zone: str
    entryPrice: float
    side: str

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "llama3.1:8b"

def extract_json_from_llm(text: str) -> dict:
    """Extrai JSON valido de resposta LLM mesmo com texto extra."""
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    cleaned = re.sub(r'```(?:json)?\s*', '', text).replace('```', '').strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{[^{}]*"score"[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    print(f"[WARN] Falha no parse JSON do LLM. Texto recebido: {text[:300]}")
    return {"score": 50, "reasoning": "parse_error", "liquidityGrab": False}

@app.post("/signal/analyze")
async def analyze_signal(data: SignalData):
    prompt = f"""Analise este sinal de trading: {data.pair} | Lado: {data.side} | Preco: {data.entryPrice} | RSI: {data.rsi} | Zona: {data.zone}.
Retorne APENAS um objeto JSON valido, sem texto extra, sem markdown:
{{"score": <numero 0-100>, "reasoning": "<texto curto>", "liquidityGrab": <true ou false>}}"""

    payload = {"model": MODEL, "prompt": prompt, "stream": False}
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=30)
        result = response.json()
        return extract_json_from_llm(result.get('response', ''))
    except Exception as e:
        print(f"[ERROR] Ollama indisponivel: {e}")
        return {"score": 50, "reasoning": f"ollama_error: {str(e)}", "liquidityGrab": False}

@app.get('/health-check')
def health():
    return {'status': 'ok'}

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8000)
