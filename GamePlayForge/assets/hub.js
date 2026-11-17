(() => {
  const grid = document.getElementById('projectGrid');
  const status = document.getElementById('catalogStatus');
  const icons = { studio: '◈', playable: '◇' };
  const labels = { studio: 'CREATIVE STUDIO', playable: 'PLAYABLE SAMPLE' };
  function setError(message) { status.textContent = message; status.hidden = false; }
  function card(project) {
    const article = document.createElement('article'); article.className = 'project-card';
    const link = document.createElement('a'); link.href = project.entrypoint; link.setAttribute('aria-label', `${project.title} 실행, 버전 ${project.version}`);
    link.className = 'card-link'; link.style.cssText = 'display:flex;flex:1;flex-direction:column';
    const meta = document.createElement('div'); meta.className = 'card-meta';
    const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = icons[project.kind] || '◇';
    const kind = document.createElement('span'); kind.textContent = labels[project.kind] || project.kind;
    const version = document.createElement('span'); version.className = 'version'; version.textContent = `v${project.version}`;
    meta.append(icon, kind, version);
    const title = document.createElement('h3'); title.textContent = project.title;
    const description = document.createElement('p'); description.textContent = project.description;
    const foot = document.createElement('div'); foot.className = 'card-foot';
    const launch = document.createElement('span'); launch.textContent = project.kind === 'studio' ? '제작 공간 열기 →' : '샘플 실행 →'; foot.append(launch);
    link.append(meta, title, description, foot); article.append(link);
    if (project.reference) {
      const ref = document.createElement('a'); ref.className = 'reference'; ref.href = project.reference; ref.textContent = '분석 노트 ↗';
      ref.style.cssText = 'position:absolute;right:23px;bottom:23px;font-size:11px'; article.style.position = 'relative'; article.append(ref);
    }
    return article;
  }
  fetch('projects.json').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(catalog => {
    if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.projects) || !catalog.projects.length) throw new Error();
    grid.replaceChildren(...catalog.projects.map(card)); status.hidden = true;
  }).catch(() => setError('프로젝트 목록을 불러오지 못했습니다. 로컬 웹 서버로 페이지를 열고 projects.json 파일을 확인해 주세요.'));
})();
