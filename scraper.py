#!/usr/bin/env python3
"""
MiLoto Scraper
Extrae resultados de baloto.com y los guarda en data.json
Compatible con la estructura actual del sitio de MiLoto.
"""

import json
import re
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
    if DATA_FILE.exists():
        with open(DATA_FILE, encoding='utf-8') as f:
            return json.load(f)
    return {'sorteos': [], 'updated': '', 'total': 0}


def parse_date(text):
    m = re.search(r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})', text, re.IGNORECASE)
    if not m:
        return None

    day = int(m.group(1))
    month_name = m.group(2).lower()
    year = int(m.group(3))

    month = MESES.get(month_name)
    if not month:
        return None

    return f'{year}-{month:02d}-{day:02d}'


def scrape_page(page=1):
    url = f'https://www.baloto.com/miloto/resultados/?page={page}'

    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
    except Exception as e:
        print(f'Error consultando página {page}: {e}')
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    results = []

    rows = soup.find_all('tr')

    for row in rows:
        fecha_td = row.find('td')
        nums_td = row.find('td', class_='td-results')

        if not fecha_td or not nums_td:
            continue

        fecha = parse_date(fecha_td.get_text(" ", strip=True))
        if not fecha:
            continue

        nums = []

        for span in nums_td.find_all('span'):
            txt = span.get_text(strip=True)

            if txt.isdigit():
                n = int(txt)
                if 1 <= n <= 39:
                    nums.append(n)

        nums = sorted(list(set(nums)))

        if len(nums) == 5:
            results.append({
                'fecha': fecha,
                'nums': nums
            })

    return results


def main():
    print('=== MiLoto Scraper ===')

    data = load_existing()
    existing_dates = {s['fecha'] for s in data['sorteos']}

    print(f'Sorteos existentes: {len(existing_dates)}')

    new_results = []

    for page in range(1, 6):
        print(f'\nScrapeando página {page}...')

        page_results = scrape_page(page)

        print(f'Encontrados {len(page_results)} resultados')

        if not page_results:
            break

        for result in page_results:
            if result['fecha'] not in existing_dates:
                new_results.append(result)
                print(f'NUEVO: {result["fecha"]} -> {result["nums"]}')

    if new_results:
        data['sorteos'].extend(new_results)
        data['sorteos'].sort(key=lambda x: x['fecha'])

        for idx, item in enumerate(data['sorteos'], start=1):
            item['id'] = idx

    data['updated'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data['total'] = len(data['sorteos'])

    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'Total sorteos: {data["total"]}')
    print('Proceso finalizado.')


if __name__ == '__main__':
    main()
