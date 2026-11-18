#!/usr/bin/env python3
"""출처를 확인한 원소·수송 기준 데이터를 재생성한다. 네트워크/원작 파일 접근 없음."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
DATE = '2026-11-18'
sources = []

def source(id, title, url, ref, kind='community_database', note='페이지가 정확한 원작 빌드 번호를 보장하지 않음. 조회 당시 문서화된 값.'):
    sources.append(dict(id=id, title=title, url=url, retrieved_at=DATE, evidence_kind=kind,
                        tool_ref=ref, source_build=None, note=note))

source('R01', 'Klei ONI 공식 업데이트 목록', 'https://kleiforums.com/game-updates/oni-alpha/', 'turn103589566view0', 'developer_official', '열람 목록의 정식 Release 744825와 Test 763612를 구분. 최신 목록이라는 사실이 개별 수치의 빌드 검증을 대신하지 않음.')
source('R02', 'Klei ONI 게임 및 확장 소개', 'https://www.klei.com/games/oxygen-not-included', 'turn368349004view1', 'developer_official')
source('R03', '사용자 지정 나무위키 진입점', 'https://namu.wiki/w/Oxygen%20Not%20Included', 'turn368349004view0', 'unavailable', '직접 열람 실패. 이 출처로부터 수치를 복원하거나 확인했다고 주장하지 않음.')
source('R04', '공식 정식 업데이트 736649', 'https://kleiforums.com/game-updates/oni-alpha/736649-r2750/', 'turn103589566view1', 'developer_official', '2026-06-11. All versions의 무력화/CPR 및 Waterweed 변경을 확인. DLC 전용 항목과 구분.')
source('R05', '공식 공개 테스트 761015', 'https://kleiforums.com/game-updates/oni-alpha/761015-r2830/', 'turn368349004search0', 'developer_official', '2026-10-29 시작된 U60 공개 테스트. 정식판 기본 규칙으로 자동 채택하지 않음.')
source('R06', 'Cycles', 'https://oxygennotincluded.wiki.gg/wiki/Cycle', 'turn103589566search0', 'community_wiki')
source('R07', 'One element per cell rule', 'https://oxygennotincluded.wiki.gg/wiki/One_element_per_cell_rule', 'turn935986010search0', 'community_wiki')
source('R08', 'Thermal Conductivity', 'https://oxygennotincluded.wiki.gg/wiki/Thermal_Conductivity', 'turn935986010search5', 'community_wiki', '접촉 유형별 공식이 다름. 모든 열교환을 단일 식으로 원작과 동일하다고 주장하지 않음.')
source('R09', 'Gas Pipe transport', 'https://onidb.wiki/buildings/gas-pipe', 'turn944211620view1')
source('R10', 'Liquid Pipe transport', 'https://onidb.wiki/buildings/liquid-pipe', 'turn944211620view0')
source('R11', 'Gas Pipe wiki', 'https://oxygennotincluded.wiki.gg/wiki/Gas_Pipe', 'turn103589566search2', 'community_wiki')
source('R12', 'Novice Research', 'https://oxygennotincluded.wiki.gg/wiki/Novice_Research', 'turn103589566search14', 'community_wiki')
source('R13', 'Gas Pump 상세 통계', 'https://onidb.wiki/buildings/gas-pump', 'turn656652402view0')

items = [
 ('oxygen','산소','gas',1.005,.024,'oxygen','turn821383113view2',None),
 ('water','물','liquid',4.179,.609,'water','turn821383113view1',(99.4,-.6,'steam','ice')),
 ('steam','증기','gas',4.179,.184,'steam','turn873157010view2',(None,99.4,None,'water')),
 ('carbon_dioxide','이산화탄소','gas',.846,.0146,'carbon-dioxide','turn873157010view1',None),
 ('polluted_water','오염된 물','liquid',4.179,.58,'polluted-water','turn821383113view0',(119.4,-20.6,'steam+dirt','polluted_ice')),
 ('ice','얼음','solid',2.05,2.18,'ice','turn821383113view3',(-.6,None,'water',None)),
 ('copper','구리','solid',.385,60,'copper','turn195346347view0',(1083.9,None,'molten_copper',None)),
 ('steel','강철','solid',.49,54,'steel','turn195346347view1',(2426.9,None,'molten_steel',None)),
 ('igneous_rock','화성암','solid',1,2,'igneous-rock','turn195346347view2',(1409.9,None,'magma',None)),
 ('sandstone','사암','solid',.8,2.9,'sandstone','turn195346347view3',(926.9,None,'magma',None)),
 ('iron','철','solid',.449,55,'iron','turn846495823view0',(1534.9,None,'molten_iron',None)),
 ('gold','금','solid',.129,60,'gold','turn846495823view1',(1063.9,None,'molten_gold',None)),
 ('dirt','흙','solid',1.48,2,'dirt','turn846495823view2',(326.9,None,None,None)),
 ('chlorine','염소 기체','gas',.48,.0081,'chlorine-gas','turn132448278view2',(None,-34.6,None,'liquid_chlorine')),
]
records=[]
scope='base_elements; public_reference_snapshot; build_unpinned'
def field(value,unit,source_ids,note='',status=None):
    return dict(value=value,unit=unit,source_ids=source_ids,evidence_status=status or ('unresolved' if value is None else 'community_reference'),scope=scope,notes=note)

for i,(id,name,state,cp,k,slug,ref,phases) in enumerate(items,20):
    sid=f'R{i:02d}'
    source(sid,name+' 원소 속성','https://onidb.wiki/elements/'+slug,ref)
    f={'state':field(state,'enum',[sid]),'specific_heat':field(cp,'DTU/(g*degC)',[sid]),'thermal_conductivity':field(k,'DTU/(m*s*degC)',[sid]),
       'transition_on_heating':field(None,'degC',[],'이 묶음에서 정확한 전이 경계를 확정하지 않음.'),
       'transition_on_cooling':field(None,'degC',[],'이 묶음에서 정확한 전이 경계를 확정하지 않음.')}
    if phases:
        hi,lo,hito,loto=phases
        if hi is not None:
            f['transition_on_heating']=field(hi,'degC',[sid],'화면에 표시된 반올림 값. 정확한 엔진 경계·히스테리시스는 미검증. 직접 런타임 상수로 사용 금지.','community_display_rounded')
            if hito:f['heating_product']=field(hito,'element_id',[sid])
        if lo is not None:
            f['transition_on_cooling']=field(lo,'degC',[sid],'화면에 표시된 반올림 값. 정확한 엔진 경계·히스테리시스는 미검증. 직접 런타임 상수로 사용 금지.','community_display_rounded')
            if loto:f['cooling_product']=field(loto,'element_id',[sid])
    records.append(dict(id='element.'+id,domain='element',name=name,fields=f))

source('R34','Hydrogen Gas 문맥이 포함된 물질 표','https://oxygennotincluded.wiki.gg/wiki/Template%3AClusterMaterialTable/doc','turn104998292search6','community_wiki','검색으로 반환된 Hydrogen Gas 제목 아래의 기체 값. 액체 수소 열전도도 0.1과 혼동하지 않음.')
source('R35','Sand 문맥이 포함된 물질 표','https://oxygennotincluded.wiki.gg/wiki/Template%3APlanetoidMaterialTable/doc','turn104998292search4','community_wiki','Sand 제목 아래의 고체 값. 본문에 등장하는 Molten Glass 비열 0.2를 모래 값으로 채택하지 않음.')
for id,name,cp,k,sid in [('hydrogen','수소 기체',2.4,.168,'R34'),('sand','모래',.83,2,'R35')]:
    records.append(dict(id='element.'+id,domain='element',name=name,fields={
        'state':field('gas' if id=='hydrogen' else 'solid','enum',[sid]),
        'specific_heat':field(cp,'DTU/(g*degC)',[sid]),'thermal_conductivity':field(k,'DTU/(m*s*degC)',[sid]),
        'transition_on_heating':field(None,'degC',[],'전이 모델 검증 보류.'),'transition_on_cooling':field(None,'degC',[],'전이 모델 검증 보류.')}))

transport=[]
for id,name,cap,rate,threshold,sid in [('gas_pipe','기체 배관',1,1,.1,'R09'),('liquid_pipe','액체 배관',10,10,1,'R10')]:
    transport.append(dict(id='transport.'+id,domain='transport',name=name,fields={
        'nominal_packet_mass':field(cap,'kg',[sid]),'nominal_throughput':field(rate,'kg/s',[sid]),
        'phase_damage_mass_exclusive':field(threshold,'kg',[sid],'임계량 초과 패킷의 상변화 손상에 대한 문서 값. 경계 이하의 모든 예외를 복원한 것은 아님.')}))
transport.append(dict(id='world.primary_cell',domain='world',name='주 환경 셀',fields={
    'element_capacity':field(1,'element/cell',['R07'],'환경 셀의 고체·기체·액체 단일 요소. 같은 위치의 잔해/건물/관 레이어는 별개.'),
    'cycle_seconds':field(600,'s',['R06'])}))

payload=dict(format_version='1.0.0',retrieved_at=DATE,source_game_build=None,
    disclaimer='공개 문서 기반 재구성. 바이너리/원본 설정 파일을 추출한 데이터가 아니다. 정식판 목표 빌드의 직접 검증이 필요하다.',records=records)
(ROOT/'data/elements.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
(ROOT/'data/transport-and-world.json').write_text(json.dumps({**payload,'records':transport},ensure_ascii=False,indent=2)+'\n')
(ROOT/'data/root-sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'elements':len(records),'transport_world_records':len(transport),'sources':len(sources)}))
