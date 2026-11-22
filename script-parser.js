/* Text parser adapted from Cenograma Beta 0.49.125's script import flow. */
window.parseScriptText = function parseScriptText(raw) {
  const input = String(raw || '').replace(/\r/g, '').split('\n');
  const rows = input.map((text, index) => ({ text, trim: text.trim(), index })).filter(row => row.trim);
  if (!rows.length) throw new Error('O arquivo não contém texto de roteiro.');
  const normalize = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const upper = value => normalize(value).toLocaleUpperCase('pt-BR');
  const sceneRe = /^(?:CENA|ATO|QUADRO|SCENE|ACT)(?:\s+([IVXLCDM]+|\d+)\b|\s*[:.\-–—])\s*(.*)$/i;
  const momentRe = /^(?:MOMENTO\s+CÊNICO|MOMENTO\s+CENICO|MC)\s+([A-Z0-9]+)(?:\s*[:.\-–—]\s*(.*))?$/i;
  const dashRe = /^([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 _'.\-]{0,54}?)\s*[–—-]\s*(.+)$/u;
  const colonRe = /^([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 _'.\-]{0,54}?)\s*:\s*(.+)$/u;
  const upperLine = /^[A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 _'.\-]{0,60}$/u;
  const known = new Set(), sceneTitles = new Map();
  let section = '';
  for (const row of rows) {
    const text = row.trim;
    if (/^PERSONAGENS$/i.test(text)) { section = 'characters'; continue; }
    if (/^CENAS$/i.test(text)) { section = 'scenes'; continue; }
    const title = text.match(/^(\d+)\.\s+(.+)$/);
    if (section === 'scenes' && title) { sceneTitles.set(Number(title[1]), normalize(title[2])); continue; }
    if (/^(?:CENA|ATO|QUADRO)\s+\d+/i.test(text)) break;
    if (section === 'characters') {
      if (/^(?:CENA|ATO|QUADRO)\b/i.test(text) || /^(?:Pré-Carnaval|Segunda-feira)/i.test(text)) { section = ''; continue; }
      if (text.length <= 60 && upperLine.test(text)) known.add(upper(text));
    }
  }
  const candidates = new Set(known);
  const firstScene = rows.findIndex(row => sceneRe.test(row.trim));
  const meaningful = firstScene >= 0 ? rows.slice(firstScene) : rows;
  for (const row of meaningful) {
    const text = row.trim, matched = text.match(dashRe) || text.match(colonRe);
    if (matched) candidates.add(upper(matched[1]));
    if (text.length <= 48 && upperLine.test(text) && !/[.!?]/.test(text) && !sceneRe.test(text) && !momentRe.test(text)) candidates.add(upper(text));
  }
  const names = [...candidates].sort((a, b) => b.length - a.length);
  const scenes = [];
  let scene = null, pendingTitle = false, speaker = null, currentLine = null, page = 0, column = 1;
  const addScene = (number, title) => {
    scene = { number, title: normalize(title) || `Cena ${scenes.length + 1}`, lines: [] };
    scenes.push(scene); speaker = null; currentLine = null; pendingTitle = !title;
  };
  const push = (type, text, name = '') => {
    if (!scene) addScene(scenes.length + 1, '');
    const line = { type, speaker: type === 'rubric' ? '' : (name || speaker || ''), text: normalize(text), page, column };
    scene.lines.push(line); currentLine = line; return line;
  };
  const isRubric = text => {
    const clean = normalize(text).replace(/\s+([.,!?;:])/g, '$1');
    if (/^(?:RÚBRICA|RUBRICA)\s*:/i.test(clean) || /^[([{].*[)\]}]$/.test(clean)) return true;
    if (/^(?:Silêncio|Escuridão|Blackout|Fim)\b/i.test(clean)) return true;
    if (currentLine?.type === 'dialogue' && !/[—:]/.test(clean)) { const normalized=upper(clean), label=names.find(name=>normalized.startsWith(name+' ')), remainder=label?clean.slice(label.length).trim():''; if (label && !/^[A-ZÀ-ÖØ-Þ]/u.test(remainder) && /^(?:obedece|entrega|pega|desce|sobe|entra|sai|olha|fala|diz|faz|volta|abre|fecha|anda|corre|começa|termina|afaga|grita|chora|ri|mata|morre|se transforma)\b/i.test(remainder)) return true; }
    return false;
  };
  for (const row of meaningful) {
    let text = row.trim;
    if (text.includes('\u200C')) { page++; column = 1; speaker = null; currentLine = null; continue; }
    if (text.includes('\u200B\u200B')) { column = 2; speaker = null; currentLine = null; continue; }
    if (pendingTitle) {
      const sceneNo = Number(scene?.number), expected = sceneTitles.get(sceneNo);
      if ((expected && upper(expected) === upper(text)) || (!known.has(upper(text)) && upperLine.test(text) && !/[—:]/.test(text))) {
        scene.title = normalize(text).replace(/([A-ZÀ-ÖØ-Þ])-\s+([A-ZÀ-ÖØ-Þ])/gu, '$1-$2'); pendingTitle = false; continue;
      }
      pendingTitle = false;
    }
    const match = text.match(sceneRe);
    if (match) {
      const number = Number(match[1]) || scenes.length + 1;
      addScene(number, normalize(match[2]) || sceneTitles.get(number) || '');
      if (sceneTitles.has(number)) { scene.title = sceneTitles.get(number); pendingTitle = true; }
      continue;
    }
    if (!scene) continue;
    if (text.startsWith('RÚBRICA:') || text.startsWith('RUBRICA:')) { push('rubric', text.replace(/^R[ÚU]BRICA:\s*/i, '')); speaker = null; currentLine = null; continue; }
    if (/^[([{].*[)\]}]$/.test(text) || /^\*.*\*$/.test(text)) { push('rubric', text.replace(/^[([{*]|[)\]}*]$/g, '')); speaker = null; currentLine = null; continue; }
    const shortPuxador=text.match(/^PUXADOR\s+(.+)$/i);
    if (shortPuxador && (known.has('PUXADOR DE SAMBA') || !known.size)) { speaker='PUXADOR DE SAMBA'; known.add(speaker); push('dialogue',shortPuxador[1],speaker); continue; }
    if (isRubric(text)) { push('rubric', text); speaker = null; currentLine = null; continue; }
    let m = text.match(dashRe) || text.match(colonRe);
    if (m && (!known.size || known.has(upper(m[1])))) {
      speaker = upper(m[1]); known.add(speaker); push('dialogue', m[2], speaker); continue;
    }
    const header = upper(text.replace(/:$/, ''));
    if (candidates.has(header) && text.length <= 48 && !/[.!?]/.test(text)) { speaker = header; known.add(speaker); currentLine = null; continue; }
    let prefix = null;
    for (const name of names) {
      if (known.size && !known.has(name)) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('^' + escaped + '\\s+(.+)$', 'u');
      const found = re.exec(upper(text));
      if (found) { prefix = { name, text: normalize(text.slice(name.length)) }; break; }
    }
    if (prefix) { speaker = prefix.name; known.add(speaker); push('dialogue', prefix.text, speaker); continue; }
    if (currentLine?.type === 'dialogue' && currentLine.column === column && /^[a-zà-ÿ0-9…]/.test(text)) { currentLine.text += ' ' + normalize(text); continue; }
    if (currentLine?.type === 'dialogue' && speaker && !/[.!?]$/.test(currentLine.text)) { currentLine.text += ' ' + normalize(text); continue; }
    if (/RETRATO[- ]FALADO/i.test(scene.title)) {
      const raw = text.replace(/^[—–-]\s*/, '');
      if (raw) { speaker = `VOZ ${column}`; push('dialogue', raw, speaker); continue; }
    }
    if (speaker) push('dialogue', text, speaker); else push('rubric', text);
  }
  for (const sc of scenes) {
    const hasLeft = sc.lines.some(line => line.column === 1), hasRight = sc.lines.some(line => line.column === 2);
    if (/RETRATO[- ]FALADO/i.test(sc.title) && hasLeft && hasRight) sc.lines.forEach(line => { line.simultaneousGroup = `sim-${sc.number}`; });
  }
  if (!scenes.length) throw new Error('Não encontrei cenas reconhecíveis no arquivo.');
  return { title: '', characters: [...known], scenes };
};
