#!/usr/bin/env python3
"""
MiLoto Scraper
Extrae resultados de baloto.com y los guarda en data.json
Corre via GitHub Actions automáticamente
"""

import json
import re
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

MESES = {
    'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
    'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'es-CO,es;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

DATA_FILE = Path('data.json')


def load_existing():
    """Carga el data.json existente o retorna estructura vacía."""
    if DATA_FILE.exists():
        with open(DATA_FILE) as f:
            return json.load(f)
    return {'sorteos': [], 'updated': ''}


def parse_date(text):
    """Convierte '12 de Junio de 2026' a '2026-06-12'."""
    m = re.search(r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})', text, re.IGNORECASE)
    if not m:
        return None
    day, mes_str, year = int(m.group(1)), m.group(2).lower(), int(m.group(3))
    mes = MESES.get(mes_str)
    if not mes or year < 2023:
        return None
    return f'{year}-{mes:02d}-{day:02d}'


def scrape_page(page=1):
    """Scrapea una página de resultados y retorna lista de {fecha, nums}."""
    url = f'https://www.baloto.com/miloto/resultados/?page={page}'
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f'  Error página {page}: {e}')
        return []

    # --- DIAGNÓSTICO TEMPORAL ---
    print(f'  [DEBUG] status={resp.status_code} bytes={len(resp.text)}')
    print(f'  [DEBUG] primeros 500 caracteres:\n{resp.text[:500]}')
    print(f'  [DEBUG] contiene "SORTEO"? {"SORTEO" in resp.text}')
    print(f'  [DEBUG] contiene "HISTORICO" o "HISTÓRICO"? {"HISTORICO" in resp.text.upper()}')
    # --- FIN DIAGNÓSTICO ---

    soup = BeautifulSoup(resp.text, 'html.parser')
    results = []

    # Buscar filas de resultados — baloto.com muestra tabla con fecha y números
    # Estrategia 1: buscar patrones de fecha + números en el HTML
    text = resp.text

    # Extraer todas las fechas
    date_pattern = re.compile(r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})', re.IGNORECASE)
    # Extraer todos los grupos de 5 números separados por ' - '
    nums_pattern = re.compile(r'\b(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\b')

    dates_found = []
    for m in date_pattern.finditer(text):
        day, mes_str, year = int(m.group(1)), m.group(2).lower(), int(m.group(3))
        mes = MESES.get(mes_str)
        if mes and year >= 2023 and 1 <= day <= 31:
            fecha = f'{year}-{mes:02d}-{day:02d}'
            dates_found.append(fecha)

    nums_found = []
    for m in nums_pattern.finditer(text):
        ns = [int(m.group(i)) for i in range(1, 6)]
        if all(1 <= n <= 39 for n in ns) and len(set(ns)) == 5:
            nums_found.append(sorted(ns))

    # Emparejar fechas con números
    count = min(len(dates_found), len(nums_found))
    for i in range(count):
        results.append({'fecha': dates_found[i], 'nums': nums_found[i]})

    return results


def get_total_pages():
    """Obtiene el número total de páginas."""
    url = 'https://www.baloto.com/miloto/resultados/?page=1'
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        m = re.search(r'Página\s+\d+\s+de\s+(\d+)', resp.text)
        if m:
            return int(m.group(1))
    except:
        pass
    return 1


def main():
    print('=== MiLoto Scraper ===')
    print(f'Iniciando: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')

    # Cargar datos existentes
    data = load_existing()
    existing_dates = {s['fecha'] for s in data['sorteos']}
    print(f'Sorteos existentes: {len(existing_dates)}')

    last_fecha = max(existing_dates) if existing_dates else '2020-01-01'
    print(f'Último sorteo conocido: {last_fecha}')

    # Scrape página 1 siempre (tiene los más recientes)
    new_results = []
    print(f'\nScrapeando página 1...')
    page_results = scrape_page(1)
    print(f'  Encontrados: {len(page_results)} resultados')

    for r in page_results:
        if r['fecha'] not in existing_dates and r['fecha'] > last_fecha:
            new_results.append(r)
            print(f'  NUEVO: {r["fecha"]} → {r["nums"]}')

    # Si hay resultados muy nuevos, también revisar página 2
    if len(new_results) >= 8:
        print(f'\nScrapeando página 2 (muchos nuevos)...')
        time.sleep(1)
        page2 = scrape_page(2)
        for r in page2:
            if r['fecha'] not in existing_dates and r['fecha'] > last_fecha:
                new_results.append(r)
                print(f'  NUEVO: {r["fecha"]} → {r["nums"]}')

    if not new_results:
        print('\nNo hay resultados nuevos.')
    else:
        print(f'\nAgregando {len(new_results)} resultados nuevos...')
        # Agregar a los existentes
        data['sorteos'].extend(new_results)
        # Ordenar por fecha
        data['sorteos'].sort(key=lambda x: x['fecha'])
        # Renumerar sorteos
        for i, s in enumerate(data['sorteos'], 1):
            s['id'] = i

    # Actualizar metadata
    data['updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data['total']   = len(data['sorteos'])

    # Guardar
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'\nGuardado: {DATA_FILE}')
    print(f'Total sorteos: {data["total"]}')
    print(f'Último: {data["sorteos"][-1]["fecha"] if data["sorteos"] else "—"}')
    print('=== Listo ===')


if __name__ == '__main__':
    main()
