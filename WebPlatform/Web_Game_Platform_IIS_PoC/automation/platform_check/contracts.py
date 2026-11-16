"""Offline JSON Schema and OpenAPI reference checks, not a full API conformance test."""
from pathlib import Path
import json
from jsonschema import Draft202012Validator, FormatChecker
import yaml

def check(identifier,title,status,message,**extra):
    return dict(id=identifier,title=title,status=status,message=message,**extra)

def read_json(path):
    if path.stat().st_size > 2*1024*1024: raise ValueError('Contract file exceeds 2 MiB')
    def pairs(items):
        out={}
        for key,value in items:
            if key in out: raise ValueError('Duplicate JSON key: '+key)
            out[key]=value
        return out
    return json.loads(path.read_text(encoding='utf-8-sig'),object_pairs_hook=pairs,parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Non-finite JSON value')))

def validate_contracts(specs_dir:Path)->list[dict]:
    specs=specs_dir.resolve();results=[];schemas={}
    for name in ['catalog.schema.json','game.manifest.schema.json','analytics_events.schema.json']:
        try:
            schema=read_json(specs/name);Draft202012Validator.check_schema(schema);schemas[name]=schema
            results.append(check('CONTRACT-SCHEMA-'+name,name,'pass','Draft 2020-12 schema structure is valid.'))
        except Exception as error: results.append(check('CONTRACT-SCHEMA-'+name,name,'fail',str(error)))
    for name,schema_name in [('catalog.example.json','catalog.schema.json'),('game.manifest.example.json','game.manifest.schema.json')]:
        if not (specs/name).exists():
            results.append(check('CONTRACT-EXAMPLE-'+name,name,'skip','No example file in this package.'));continue
        try:
            errors=list(Draft202012Validator(schemas[schema_name],format_checker=FormatChecker()).iter_errors(read_json(specs/name)))
            results.append(check('CONTRACT-EXAMPLE-'+name,name,'fail' if errors else 'pass','; '.join(e.message for e in errors[:10]) if errors else 'Example satisfies its schema.'))
        except Exception as error: results.append(check('CONTRACT-EXAMPLE-'+name,name,'fail',str(error)))
    api_path=specs/'openapi.yaml'
    if not api_path.exists():
        results.append(check('CONTRACT-OPENAPI','OpenAPI reference check','skip','This package uses the documented PoC API adapter; no production OpenAPI file is included.'));return results
    try:
        if api_path.stat().st_size>2*1024*1024: raise ValueError('OpenAPI input exceeds 2 MiB')
        api=yaml.safe_load(api_path.read_text(encoding='utf-8-sig'))
        if not isinstance(api,dict) or not str(api.get('openapi','')).startswith('3.1.'): raise ValueError('Expected OpenAPI 3.1')
        operations=sum(1 for methods in api.get('paths',{}).values() for key in methods if key.lower() in {'get','post','put','patch','delete','options','head'})
        refs=[]
        def visit(value):
            if isinstance(value,dict):
                if '$ref' in value: refs.append(value['$ref'])
                for child in value.values():visit(child)
            elif isinstance(value,list):
                for child in value:visit(child)
        visit(api)
        for ref in refs:
            name,_,fragment=ref.partition('#')
            if name:
                target=(specs/name).resolve()
                if target.parent!=specs or target.suffix!='.json':raise ValueError('Only local JSON schema references are accepted: '+ref)
                item=read_json(target)
            else:item=api
            if fragment:
                if not fragment.startswith('/'):raise ValueError('Unsupported reference fragment: '+ref)
                for token in fragment[1:].split('/'):
                    token=token.replace('~1','/').replace('~0','~')
                    item=item[int(token)] if isinstance(item,list) else item[token]
        results.append(check('CONTRACT-OPENAPI','OpenAPI local references','pass',f'{len(api.get("paths",{}))} paths, {operations} operations, {len(refs)} local references resolved.'))
        results.append(check('CONTRACT-OPENAPI-LIMIT','API execution scope','skip','Parsing and reference resolution do not certify full OpenAPI conformance or a running API.'))
    except Exception as error:results.append(check('CONTRACT-OPENAPI','OpenAPI local references','fail',str(error)))
    return results

def validate_events(path:Path,specs_dir:Path)->list[dict]:
    try:
        schema=read_json(specs_dir/'analytics_events.schema.json');Draft202012Validator.check_schema(schema)
        errors=list(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(read_json(path)))
        return [check('EVENT-BATCH','Production event input contract','fail' if errors else 'pass','; '.join(f'{list(e.absolute_path)}: {e.message}' for e in errors[:20]) if errors else 'Input conforms to the production event contract. This does not verify session ownership or event truth.')]
    except Exception as error:return [check('EVENT-BATCH','Production event input contract','fail',str(error))]
