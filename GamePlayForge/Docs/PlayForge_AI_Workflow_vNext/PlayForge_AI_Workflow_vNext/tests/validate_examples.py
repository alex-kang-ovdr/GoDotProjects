"""Validate sample record shape; this does not authorize data use."""
from pathlib import Path
import copy
import json
import sys
try:
    import jsonschema
except ImportError:
    sys.exit('Optional schema tests require jsonschema. C++ tests have no third-party dependencies.')
root=Path(__file__).resolve().parents[1]
schema=json.loads((root/'schemas/workflow-run.schema.json').read_text(encoding='utf-8'))
base=json.loads((root/'examples/workflow-run.synthetic.json').read_text(encoding='utf-8'))
validator=jsonschema.Draft202012Validator(schema)
validator.check_schema(schema)
cases=[('synthetic_record_valid',base,True)]
x=copy.deepcopy(base);x['metrics']['tokens']['total']=0
cases.append(('unknown_tokens_cannot_be_zero',x,False))
x=copy.deepcopy(base);x['apiKey']='secret-placeholder'
cases.append(('extra_top_level_secret_field_rejected',x,False))
x=copy.deepcopy(base);x['metrics']['tokens']['source']='provider_metered'
cases.append(('metered_tokens_require_number',x,False))
x=copy.deepcopy(base);x['metrics']['tokens']={'total':250,'source':'client_reported'}
cases.append(('client_reported_count_labeled_not_verified',x,True))
x=copy.deepcopy(base);x['policy']['sourceRefs']=[]
cases.append(('empty_lineage_rejected',x,False))
x=copy.deepcopy(base);x['metrics']['toolCallsObserved']=-1
cases.append(('negative_metric_rejected',x,False))
x=copy.deepcopy(base);x['origin']['fullConversation']='not allowed'
cases.append(('broad_conversation_field_rejected',x,False))
failures=0
for label, data, expected in cases:
    ok=validator.is_valid(data)==expected
    failures+=not ok
    print(('PASS ' if ok else 'FAIL ')+label)
print(f'SUMMARY {len(cases)} checks, {failures} failures')
sys.exit(bool(failures))
