"""Artifact integrity checks, not a real browser/rendering test."""
import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('bundle_builder',ROOT/'scripts/build_lab.py')
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class ParsedHTML(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.scripts=[]; self.resources=[]; self.ids=[]; self.current=None
        self.feed(text)
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if 'id' in attrs:self.ids.append(attrs['id'])
        if tag=='script':
            self.current={'attrs':attrs,'text':''};self.scripts.append(self.current)
        if (tag in ('script','img','iframe','audio','video') and attrs.get('src')) or (tag=='link' and attrs.get('href')):
            self.resources.append((tag,attrs))
    def handle_data(self,text):
        if self.current is not None:self.current['text']+=text
    def handle_endtag(self,tag):
        if tag=='script':self.current=None

class BundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content=builder.build()
        cls.html=ParsedHTML(cls.content.decode('utf-8'))
        cls.payload=json.loads(next(s['text'] for s in cls.html.scripts if s['attrs'].get('id')=='research-data'))

    def test_saved_bundle_matches_sources(self):
        self.assertEqual((ROOT/'ROYALE_DATA_LAB.html').read_bytes(),self.content)

    def test_inert_payload_is_lossless(self):
        self.assertEqual(self.payload,builder.dataset())
        self.assertEqual(self.payload['package']['version'],'4.0.0')

    def test_no_network_assets_are_required(self):
        self.assertEqual(self.html.resources,[])
        for script in self.html.scripts:
            if script['attrs'].get('type')=='application/json':continue
            self.assertNotRegex(script['text'],r'\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bimport\s*\(')

    def test_script_order_and_unique_controls(self):
        self.assertEqual(len(self.html.scripts),5)
        self.assertEqual(self.html.scripts[0]['attrs'].get('type'),'application/json')
        self.assertIn('RoyaleData',self.html.scripts[1]['text'])
        self.assertIn('RoyaleEconomy',self.html.scripts[2]['text'])
        self.assertIn('RoyaleContracts',self.html.scripts[3]['text'])
        self.assertEqual(len(self.html.ids),len(set(self.html.ids)))

    def test_source_title_cannot_escape_json_script(self):
        value=builder.dataset()
        hostile='</script><script>alert("test")</script>&\u2028\u2029'
        value['sources'][0]['title']=hostile
        with patch.object(builder,'dataset',return_value=value):content=builder.build().decode('utf-8')
        html=ParsedHTML(content)
        self.assertEqual(len(html.scripts),5)
        self.assertEqual(json.loads(html.scripts[0]['text'])['sources'][0]['title'],hostile)

    def test_evidence_scopes_remain_separate(self):
        tables=self.payload['tables']
        self.assertEqual(set(tables),{p.stem for p in (ROOT/'data/tables').glob('*.json')})
        self.assertEqual(len(tables['card_catalog_2023']),120)
        self.assertEqual(len(tables['level_stats_2023']),4956)
        self.assertEqual(len(tables['archive_behavior_extensions_2023']),113)
        self.assertEqual(len(tables['archive_reference_extensions_2023']),37)
        self.assertEqual(sum(r['reference_level_status']=='not_stated' for r in tables['official_patch_expansion_2026']),40)
        self.assertTrue(all(r['full_current_card_profile'] is False for r in tables['verified_patch_fields_2026']))
        self.assertTrue(all(r['observed'] is False and r['test_status']=='not_run' for r in tables['interaction_cases']))

    def test_no_unexpanded_template_markers(self):
        text=self.content.decode('utf-8')
        for marker in ['__DATA__','/*__STYLE__*/','/*__CORE__*/','/*__ECONOMY__*/','/*__CONTRACTS__*/','/*__APP__*/']:
            self.assertNotIn(marker,text)

    def test_reference_scenarios_do_not_claim_observation(self):
        scenarios=json.loads((ROOT/'data/contracts/reference_scenarios.json').read_text(encoding='utf-8'))
        self.assertFalse(scenarios['original_client_executed'])
        self.assertEqual(scenarios['scenario_count'],30)
        self.assertEqual(len(scenarios['scenarios']),30)
        for item in scenarios['scenarios']:
            self.assertEqual(item['original_observation'],{'observed':False,'test_status':'not_run'})

if __name__=='__main__':unittest.main()
