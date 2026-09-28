#!/usr/bin/env python3
"""Teste automatizado da extensão num Firefox real.

Abre uma instância separada do Firefox (headless, perfil temporário), carrega a
extensão como temporária, visita os alvos e lê o relatório de cada aba pela
própria API da extensão. Não usa nem altera o Firefox do usuário.

Uso:
  python3 tools/smoke_test.py ddg                      # cenários do DDG, com verificações
  python3 tools/smoke_test.py ddg-fingerprint
  python3 tools/smoke_test.py --out DIR https://www.sp.gov.br/

Com --out, cada URL gera em DIR: plugin.json (mesmo formato do "Exportar JSON",
com a marca de coleta automatizada), pagina.png e relatorio-<aba>.png.

Atenção: o Firefox automatizado expõe navigator.webdriver = true. Sites com
proteção anti-bot se comportam como diante de um robô (o que também acontece com
o Blacklight); não é equivalente a uma visita comum.

Requer: pip install -r tools/requirements.txt (o Selenium baixa o geckodriver).
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / 'extension'
MANIFEST = json.loads((EXTENSION / 'manifest.json').read_text())
EXT_ID = MANIFEST['browser_specific_settings']['gecko']['id']
UUID = '6c1f0b7e-2d3a-4c8e-9f10-7a5b3c2d1e0f'  # fixo: permite abrir moz-extension://UUID/...
DDG = 'https://privacy-test-pages.site'
DEFAULT_FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox'
TABS = ['third-party', 'cookies', 'storage', 'alerts']
TAB_FILES = {'third-party': 'terceiros', 'cookies': 'cookies', 'storage': 'storage', 'alerts': 'alertas'}

# Executado numa página da extensão: relatório de cada aba comum.
GET_REPORTS = """
const done = arguments[arguments.length - 1];
(async () => {
  const b = window.browser || window.wrappedJSObject.browser;
  const out = [];
  for (const t of await b.tabs.query({})) {
    if (t.url.startsWith('moz-extension:')) continue;
    out.push({ tabId: t.id, url: t.url, report: await b.runtime.sendMessage({ type: 'getReport', tabId: t.id }) });
  }
  done(out);
})().catch(e => done({ error: String(e) }));
"""


class Browser:
    """Firefox com a extensão carregada e uma aba da extensão para consultas."""

    def __init__(self, firefox, headful=False):
        opts = Options()
        opts.binary_location = firefox
        if not headful:
            opts.add_argument('-headless')
        opts.set_preference('extensions.webextensions.uuids', json.dumps({EXT_ID: UUID}))
        opts.set_preference('webgl.force-enabled', True)  # headless sem GPU
        # --allow-system-access: o Marionette só abre moz-extension:// pelo chrome.
        self.driver = webdriver.Firefox(options=opts, service=Service(service_args=['--allow-system-access']))
        self.driver.set_script_timeout(30)
        self.driver.set_window_size(1440, 1000)
        self.driver.install_addon(str(EXTENSION), temporary=True)
        self.page = self.driver.current_window_handle
        self.ext = self.open_extension_tab('popup/popup.html')
        self.driver.switch_to.window(self.page)

    def open_extension_tab(self, path):
        before = set(self.driver.window_handles)
        with self.driver.context(self.driver.CONTEXT_CHROME):
            self.driver.execute_script(
                'gBrowser.addTab(arguments[0], {triggeringPrincipal: '
                'Services.scriptSecurityManager.getSystemPrincipal()});',
                f'moz-extension://{UUID}/{path}')
        time.sleep(2)
        return (set(self.driver.window_handles) - before).pop()

    def visit(self, url, wait):
        self.driver.switch_to.window(self.page)
        self.driver.get(url)
        time.sleep(wait)

    def click(self, element_id, wait):
        self.driver.switch_to.window(self.page)
        self.driver.find_element(By.ID, element_id).click()
        time.sleep(wait)

    def report(self):
        self.driver.switch_to.window(self.ext)
        result = self.driver.execute_async_script(GET_REPORTS)
        self.driver.switch_to.window(self.page)
        if isinstance(result, dict) and 'error' in result:
            raise RuntimeError(result['error'])
        entries = [r for r in result if r['report']]
        return entries[0] if entries else None

    def screenshots(self, tab_id, out):
        """Print da página e de cada aba do relatório (modo "Abrir em aba")."""
        self.driver.switch_to.window(self.page)
        self.driver.save_full_page_screenshot(str(out / 'pagina.png'))
        handle = self.open_extension_tab(f'popup/popup.html?tab={tab_id}')
        self.driver.switch_to.window(handle)
        for tab in TABS:
            self.driver.find_element(By.CSS_SELECTOR, f'.tab[data-tab="{tab}"]').click()
            time.sleep(1)
            self.driver.save_full_page_screenshot(str(out / f'relatorio-{TAB_FILES[tab]}.png'))
        self.driver.close()
        self.driver.switch_to.window(self.page)

    def quit(self):
        self.driver.quit()


# Resumo no terminal

def summary(report):
    t = report['totals']
    c = report['cookies']['summary']
    s = report['storage']['summary']
    f = report['fingerprinting']['summary']
    return (f"{report['url']}\n"
            f"  requisições={t['requests']} sites 3ª parte={t['thirdPartySites']} rastreadores={t['trackerSites']}\n"
            f"  cookies={c['total']} (3ª parte={c['thirdParty']['session'] + c['thirdParty']['persistent']}, "
            f"particionados={c['partitioned']}, 1ª parte por script de 3ª={c['firstPartyByThirdPartyScript']})\n"
            f"  storage: {s['items']} itens em {s['originsWithData']} origens\n"
            f"  fingerprinting: {f['byTechnique']}")


# Cenários do DDG, com o resultado esperado

class Checks:
    def __init__(self):
        self.failures = 0

    def expect(self, ok, message):
        print(f"  {'OK   ' if ok else 'FALHA'} {message}")
        if not ok:
            self.failures += 1


def scenario_tracker(browser, checks):
    expected = {
        '1major-via-script': 'doubleclick.net',
        '1major-with-surrogate': 'doubleclick.net',
        '1major-via-img': 'facebook.com',
        '1major-via-fetch': 'facebook.com',
        'document-fragment': 'facebook.com',
    }
    for page, site in expected.items():
        browser.visit(f'{DDG}/tracker-reporting/{page}.html', wait=3)
        report = browser.report()['report']
        tracker = next((s for s in report['thirdParty'] if s['site'] == site), None)
        checks.expect(tracker is not None and tracker['tracker'], f'tracker-reporting/{page}: {site} como rastreador')


def scenario_storage(browser, checks):
    browser.visit(f'{DDG}/privacy-protections/storage-blocking/', wait=3)
    browser.click('store', wait=8)
    report = browser.report()['report']
    cookies = {(c['name'], c['site']): c for c in report['cookies']['list']}
    tpt = cookies.get(('tptdata', 'privacy-test-pages.site'))
    checks.expect(tpt is not None and any('broken.third-party.site' in w for w in tpt['writers']),
                  'storage-blocking: tptdata gravado por broken.third-party.site')
    checks.expect(report['cookies']['summary']['partitioned'] >= 10, 'storage-blocking: cookies de iframes particionados')
    origins = {o['origin'] for o in report['storage']['origins']}
    checks.expect({'https://good.third-party.site', 'https://broken.third-party.site'} <= origins,
                  'storage-blocking: storage dos iframes de terceiros')


def scenario_fingerprint(browser, checks):
    browser.visit(f'{DDG}/privacy-protections/fingerprinting/', wait=3)
    browser.click('start', wait=15)
    fp = browser.report()['report']['fingerprinting']
    by = fp['summary']['byTechnique']
    checks.expect(by.get('canvas', 0) >= 4, f"fingerprinting: 4 leituras de canvas 2D (obtido {by.get('canvas', 0)})")
    checks.expect(by.get('webgl', 0) >= 1, 'fingerprinting: canvas WebGL')
    checks.expect(by.get('fonts', 0) >= 1, 'fingerprinting: enumeração de fontes')
    checks.expect(any(d.get('copiedFrom') == 'OffscreenCanvas' for d in fp['detections']),
                  'fingerprinting: cópia de OffscreenCanvas')


SCENARIOS = {
    'ddg-tracker': scenario_tracker,
    'ddg-storage': scenario_storage,
    'ddg-fingerprint': scenario_fingerprint,
}


def collect_url(browser, url, wait, out):
    browser.visit(url, wait=wait)
    entry = browser.report()
    if not entry:
        print(f'{url}: sem relatório')
        return
    print(summary(entry['report']))
    if not out:
        return
    out.mkdir(parents=True, exist_ok=True)
    data = {
        'tool': {'name': MANIFEST['name'], 'version': MANIFEST['version']},
        'exportedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'userAgent': browser.driver.execute_script('return navigator.userAgent'),
        'collection': {
            'automated': True,
            'webdriver': browser.driver.execute_script('return navigator.webdriver'),
            'waitSeconds': wait,
            'script': 'tools/smoke_test.py',
        },
        'report': entry['report'],
    }
    (out / 'plugin.json').write_text(json.dumps(data, indent=2, ensure_ascii=False))
    browser.screenshots(entry['tabId'], out)
    print(f'  evidências salvas em {out}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('targets', nargs='+', help="'ddg', 'ddg-tracker', 'ddg-storage', 'ddg-fingerprint' ou URLs")
    parser.add_argument('--out', type=Path, help='pasta para salvar JSON e prints (só para URLs)')
    parser.add_argument('--wait', type=float, default=30, help='segundos de espera em cada URL (padrão 30)')
    parser.add_argument('--headful', action='store_true', help='mostra a janela do Firefox')
    parser.add_argument('--firefox', default=os.environ.get('FIREFOX_BIN', DEFAULT_FIREFOX))
    args = parser.parse_args()

    targets = []
    for target in args.targets:
        targets.extend(SCENARIOS if target == 'ddg' else [target])

    browser = Browser(args.firefox, headful=args.headful)
    checks = Checks()
    try:
        for target in targets:
            if target in SCENARIOS:
                print(f'== {target}')
                SCENARIOS[target](browser, checks)
            else:
                print(f'== {target}')
                collect_url(browser, target, args.wait, args.out)
    finally:
        browser.quit()
    if checks.failures:
        print(f'{checks.failures} verificação(ões) falharam')
        sys.exit(1)


if __name__ == '__main__':
    main()
