/* The dashboard uses these same pure query and navigation rules in its contract tests. */
(function(root){
  'use strict';
  const ADMIN_TABS=[
    {
      id:'system',
      label:'시스템',
      eyebrow:'SYSTEM OPERATIONS',
      defaultView:'overview',
      views:[
        {id:'overview',label:'시스템 대시보드',title:'시스템 대시보드',kind:'대시보드'},
        {id:'config',label:'환경·연동 설정',title:'환경·연동 설정',kind:'설정'},
        {id:'access',label:'관리자 계정·권한',title:'관리자 계정·권한',kind:'관리'},
        {id:'backups',label:'백업·유지보수',title:'백업·유지보수',kind:'운영'},
        {id:'errors',label:'통합 오류 모니터링',title:'통합 오류 모니터링',kind:'운영'},
        {id:'audit',label:'통합 감사 로그',title:'통합 감사 로그',kind:'운영'}
      ]
    },
    {
      id:'hub',
      label:'Hub',
      eyebrow:'HUB OPERATIONS',
      defaultView:'dashboard',
      views:[
        {id:'dashboard',label:'Hub 대시보드',title:'Hub 서비스 현황',kind:'대시보드'},
        {id:'analytics',label:'이용 지표·리텐션',title:'이용 지표 및 리텐션',kind:'지표'},
        {id:'games',label:'게임 카탈로그·공개',title:'게임 카탈로그 및 공개 관리',kind:'관리'},
        {id:'submissions',label:'제출 검수 센터',title:'제출 검수 센터',kind:'검수'},
        {id:'community',label:'커뮤니티·신고',title:'게임 커뮤니티 및 신고 관리',kind:'운영'},
        {id:'users',label:'사용자·저장 관리',title:'사용자 및 저장 현황',kind:'관리'}
      ]
    },
    {
      id:'forge',
      label:'Forge',
      eyebrow:'FORGE INFRASTRUCTURE',
      defaultView:'overview',
      views:[
        {id:'overview',label:'Forge 대시보드',title:'Forge 인프라 현황',kind:'대시보드'},
        {id:'projects',label:'프로젝트·템플릿',title:'프로젝트 및 공식 템플릿',kind:'관리'},
        {id:'builds',label:'Web 빌드 큐·패키지',title:'Web 빌드 큐 및 패키지 검증',kind:'운영'},
        {id:'drive',label:'Drive 동기화·보존',title:'운영자 Drive 동기화 및 보존',kind:'운영'},
        {id:'sessions',label:'협업·멀티플레이',title:'협업 세션 및 멀티플레이',kind:'운영'},
        {id:'settings',label:'Forge 운영 설정',title:'Forge 운영 설정 및 보안 경계',kind:'설정'}
      ]
    },
    {
      id:'qa',
      label:'QA',
      eyebrow:'QUALITY ASSURANCE',
      defaultView:'overview',
      views:[
        {id:'overview',label:'QA 대시보드',title:'QA 품질 현황',kind:'대시보드'},
        {id:'runs',label:'자동화 테스트·회귀',title:'자동화 테스트 및 회귀 리포트',kind:'검수'},
        {id:'ai',label:'AI 모델 플레이 QA',title:'AI 모델 플레이 QA',kind:'검수'},
        {id:'policies',label:'정책·스케줄·격리',title:'심사 정책·스케줄 및 격리',kind:'설정'},
        {id:'metrics',label:'QA·검증 지표',title:'QA 및 가상 검증 지표',kind:'지표'}
      ]
    },
    {
      id:'l10n',
      label:'L10N',
      eyebrow:'PLATFORM LOCALIZATION',
      defaultView:'overview',
      views:[
        {id:'overview',label:'L10N 대시보드',title:'플랫폼 다국어(L10N) 현황',kind:'대시보드'},
        {id:'strings',label:'스트링 테이블',title:'LOCTEXT 스트링 테이블',kind:'관리'},
        {id:'gather',label:'수집 및 검증',title:'텍스트 수집(Gather) 및 정적 검증',kind:'운영'},
        {id:'ai',label:'AI 번역·프롬프트',title:'AI 번역 및 상황별 프롬프트',kind:'운영'},
        {id:'glossary',label:'단어집 (Glossary)',title:'표준 단어집 및 번역 금지(DNT)',kind:'설정'},
        {id:'media',label:'다국어 이미지',title:'플랫폼 다국어 이미지 관리',kind:'관리'},
        {id:'releases',label:'버전·배포 관리',title:'L10N 릴리스 스냅샷 및 롤백',kind:'운영'}
      ]
    },
    {
      id:'store',
      label:'Store',
      eyebrow:'PLAYFORGE STORE OPERATIONS',
      defaultView:'overview',
      views:[
        {id:'overview',label:'Store 대시보드',title:'PlayForge Store 운영 현황',kind:'대시보드'},
        {id:'submissions',label:'제출 심사 큐',title:'Store 제출 심사 큐',kind:'검수'},
        {id:'packages',label:'패키지 · 킬스위치',title:'Store 패키지 상태 및 킬스위치',kind:'운영'}
      ]
    }
  ];

  const LEGACY_HASH_ROUTES={
    '#overview':{tab:'hub',view:'dashboard'},
    '#trends':{tab:'hub',view:'dashboard'},
    '#play-funnel':{tab:'hub',view:'analytics'},
    '#retention':{tab:'hub',view:'analytics'},
    '#games':{tab:'hub',view:'games'},
    '#submissions':{tab:'hub',view:'submissions'},
    '#community':{tab:'hub',view:'community'},
    '#errors':{tab:'system',view:'errors'},
    '#audit':{tab:'system',view:'audit'}
  };

  function findTab(tabId){return ADMIN_TABS.find(t=>t.id===tabId)||ADMIN_TABS[1];}
  function findView(tab,viewId){return tab.views.find(v=>v.id===viewId)||tab.views.find(v=>v.id===tab.defaultView)||tab.views[0];}

  function parseQuery(search){
    const map={};
    const body=String(search||'').replace(/^\?/,'');
    if(!body)return map;
    for(const part of body.split('&')){
      if(!part)continue;
      const at=part.indexOf('=');
      const key=at<0?part:part.slice(0,at);
      const val=at<0?'':part.slice(at+1);
      try{map[decodeURIComponent(key.replace(/\+/g,' '))]=decodeURIComponent(val.replace(/\+/g,' '));}catch{}
    }
    return map;
  }

  function resolveAdminRoute(search='',hash=''){
    const params=parseQuery(search);
    const rawTab=params.tab||null;
    const rawView=params.view||null;
    if(!rawTab&&!rawView&&LEGACY_HASH_ROUTES[hash]){
      const legacy=LEGACY_HASH_ROUTES[hash];
      const tab=findTab(legacy.tab);
      return {tab:tab.id,view:findView(tab,legacy.view).id,fromLegacyHash:true};
    }
    const tab=findTab(rawTab||'hub');
    const view=findView(tab,rawView||tab.defaultView);
    return {tab:tab.id,view:view.id,fromLegacyHash:false};
  }

  function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
  function metricsQuery(dataset,filters={}){
    if(!['live','qa','demo'].includes(dataset))throw new Error('통계 데이터 종류가 올바르지 않습니다.');
    const parts=['dataset='+dataset];if(dataset==='demo')return parts.join('&');
    const {from='',to='',gameId='',qaRunId=''}=filters;
    if((from&&!validDate(from))||(to&&!validDate(to)))throw new Error('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    if(from&&to&&from>to)throw new Error('시작일은 종료일보다 늦을 수 없습니다.');
    if(gameId&&!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(gameId))throw new Error('게임 선택이 올바르지 않습니다.');
    if(qaRunId&&!/^[A-Za-z0-9._:-]{1,80}$/.test(qaRunId))throw new Error('QA 실행 ID 형식이 올바르지 않습니다.');
    if(from)parts.push('from='+encodeURIComponent(from));
    if(to)parts.push('to='+encodeURIComponent(to));
    if(gameId)parts.push('gameId='+encodeURIComponent(gameId));
    if(dataset==='qa'&&qaRunId)parts.push('qaRunId='+encodeURIComponent(qaRunId));
    return parts.join('&');
  }
  const selectedRetention=data=>data?.retention?.selected||data?.retention?.platform||{};
  const rateText=(value,empty='분모 없음')=>value==null?empty:`${(Number(value)*100).toFixed(1)}%`;
  root.AdminRules={ADMIN_TABS,LEGACY_HASH_ROUTES,findTab,findView,resolveAdminRoute,metricsQuery,selectedRetention,rateText,validDate};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.AdminRules;
})(globalThis);
