window.DB = {
  now: '2026-07-23',
  badwords: ['젠장', '바보', '멍청'],
  issues: [
    { id: 'i1', title: '반도체 수출 규제 확대', summary: '주요국의 첨단 반도체 수출 통제가 공급망 재편을 촉발.', sources: ['news','sns','gov'], traffic: 92000, heat: 'high' },
    { id: 'i2', title: '북극 항로 상용화', summary: '해빙 가속으로 북극 항로 상업 운항 논의 본격화.', sources: ['report','news'], traffic: 31000, heat: 'medium' },
    { id: 'i3', title: '중앙은행 디지털화폐(CBDC) 도입', summary: '주요국 CBDC 파일럿 확대 — 아직 현실화된 분기 없음.', sources: ['gov','report'], traffic: 47000, heat: 'medium' },
    { id: 'i4', title: '희토류 공급 다변화', summary: '신규 이슈 — 아직 제출된 시나리오 없음.', sources: ['news'], traffic: 8000, heat: 'low' }
  ],
  scenarios: [
    // i1 — 강조 줄기 s1→s2, depth·star 분산으로 가지치기 시연
    { id:'s1', issueId:'i1', parentScenarioId:null, title:'규제 전면 확대', body:'통제 품목이 성숙 공정까지 확대되는 경로.', rationale:'과거 제재 확대 패턴 + 정책 발언 정황.', discussionSummary:'다수 참여자가 확대 기조에 동의, 산업계 반발을 변수로 지목.', stars:41, createdAt:'2026-01-10', realizedAt:'2026-03-01', treeLane:0, reflected:true, mapLocation:{x:300,y:180,label:'동아시아'} },
    { id:'s2', issueId:'i1', parentScenarioId:'s1', title:'역내 자급 가속', body:'규제 대응으로 역내 생산 내재화가 급진전.', rationale:'보조금 규모·팹 착공 발표.', discussionSummary:'보조금 규모가 결정적이라는 데 합의.', stars:28, createdAt:'2026-03-15', realizedAt:'2026-05-20', treeLane:0, reflected:true, mapLocation:{x:340,y:200,label:'한·중·대만'} },
    { id:'s3', issueId:'i1', parentScenarioId:'s1', title:'우회 무역 확산', body:'제3국 경유 우회로 형성.', rationale:'무역 통계 이상 징후.', discussionSummary:'단기 과대평가 우려가 다수.', stars:12, createdAt:'2026-03-20', realizedAt:null, treeLane:-1, reflected:false, mapLocation:null },
    { id:'s6', issueId:'i1', parentScenarioId:'s2', title:'팹 국산화 완성', body:'핵심 공정 국산화 완료.', rationale:'착공 팹 가동률 근거.', discussionSummary:'낙관론과 시점 논쟁 병존.', stars:15, createdAt:'2026-06-01', realizedAt:null, treeLane:0, reflected:false, mapLocation:null },
    { id:'s7', issueId:'i1', parentScenarioId:'s2', title:'보조금 축소 역풍', body:'재정 부담으로 보조금 축소.', rationale:'재정 적자 추계.', discussionSummary:'지지 낮음.', stars:6, createdAt:'2026-06-05', realizedAt:null, treeLane:1, reflected:false, mapLocation:null },
    { id:'s8', issueId:'i1', parentScenarioId:'s2', title:'수출 반등', body:'우회 수요로 수출 반등.', rationale:'선적 데이터 반등.', discussionSummary:'중간 지지.', stars:22, createdAt:'2026-06-10', realizedAt:null, treeLane:2, reflected:false, mapLocation:null },
    { id:'s9', issueId:'i1', parentScenarioId:'s3', title:'제3국 제재 확대', body:'우회로 차단 위한 제재 확대.', rationale:'제재 명단 확대 정황.', discussionSummary:'가능성 중간.', stars:9, createdAt:'2026-05-01', realizedAt:null, treeLane:-1, reflected:false, mapLocation:null },
    { id:'s10', issueId:'i1', parentScenarioId:'s9', title:'글로벌 통제망 형성', body:'다자 통제 레짐 성립.', rationale:'다자 협의체 논의.', discussionSummary:'장기·불확실.', stars:3, createdAt:'2026-06-15', realizedAt:null, treeLane:-2, reflected:false, mapLocation:null },
    // i2 — 단일 현실화 줄기
    { id:'s4', issueId:'i2', parentScenarioId:null, title:'항로 조기 상용화', body:'2030 이전 정기 상업 운항.', rationale:'쇄빙선 발주·보험 상품 출시.', discussionSummary:'조기 상용화에 무게.', stars:19, createdAt:'2026-02-01', realizedAt:'2026-04-10', treeLane:0, reflected:true, mapLocation:{x:400,y:60,label:'북극해'} },
    // i3 — realizedAt 전부 null (현실화 0 시연)
    { id:'s5', issueId:'i3', parentScenarioId:null, title:'리테일 CBDC 우선', body:'개인 대상 CBDC 우선 확산.', rationale:'파일럿 대상·한도.', discussionSummary:'리테일 우선론 우세.', stars:15, createdAt:'2026-02-15', realizedAt:null, treeLane:0, reflected:false, mapLocation:null },
    { id:'s11', issueId:'i3', parentScenarioId:'s5', title:'홀세일 우선 반론', body:'기관 간 결제부터 도입.', rationale:'결제 인프라 우선순위.', discussionSummary:'소수 지지.', stars:8, createdAt:'2026-04-01', realizedAt:null, treeLane:1, reflected:false, mapLocation:null }
  ],
  comments: [
    { id:'c1', scenarioId:'s1', author:'분석가_김', body:'정책 발언 타임라인이 이 경로를 지지함.', ts:'2026-02-20' },
    { id:'c2', scenarioId:'s1', author:'연구원_이', body:'산업계 반발 변수 고려 필요.', ts:'2026-02-21' },
    { id:'c3', scenarioId:'s3', author:'트레이더_박', body:'우회 무역은 과대평가일 수 있음, 젠장.', ts:'2026-04-02' },
    { id:'c4', scenarioId:'s2', author:'분석가_최', body:'보조금 규모가 결정적이었음.', ts:'2026-05-22' }
  ],
  analyses: [
    { scenarioId:'s1', lenses:{ political:'수출 통제 동맹 결속 강화, 비동맹국과 마찰 확대.', economic:'단기 공급 충격·가격 상승, 중기 재고 조정.', military:'이중용도 부품 통제로 방산 공급망 재정렬.', civilian:'전자제품 가격 전가, 역내 팹 투자로 고용 부분 상쇄.' } },
    { scenarioId:'s2', lenses:{ political:'산업 정책 주도권 경쟁 심화.', economic:'보조금 재정 부담↑, 장기 자급률↑.', military:'전략물자 국산화로 자율성 확보.', civilian:'지역 고용 창출, 초기 제품 단가 상승.' } },
    { scenarioId:'s4', lenses:{ political:'북극 연안국 관할권 분쟁 부상.', economic:'운송 거리 단축으로 물류비 절감.', military:'북극 해군 존재감 경쟁 가속.', civilian:'연안 환경 리스크·원주민 공동체 영향.' } }
  ]
};
