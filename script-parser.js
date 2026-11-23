/* Text parsing engine. Script-specific text and reusable conventions stay outside this file. */
window.parseScriptText = function parseScriptText(raw, options = {}) {
  const profiles = window.SCRIPT_PARSER_PROFILES || { defaultProfileId: 'pt-br-theatre-v1', profiles: {} };
  const profileId = options.profileId || profiles.defaultProfileId;
  const profile = profiles.profiles?.[profileId] || {};
  if (options.profileId && !profiles.profiles?.[profileId]) throw new Error(`Perfil de leitura não registrado: ${profileId}.`);
  const input = String(raw || '').replace(/\r/g, '').split('\n');
  const rows = input.map((text, index) => ({ text, trim: text.trim(), index })).filter(row => row.trim);
  if (!rows.length) throw new Error('O arquivo não contém texto de roteiro.');
  const normalize = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const upper = value => normalize(value).toLocaleUpperCase('pt-BR');
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scenePrefixes = profile.sceneHeadings?.length ? profile.sceneHeadings : ['CENA', 'ATO', 'QUADRO', 'SCENE', 'ACT'];
  const sceneRe = new RegExp('^(?:' + scenePrefixes.map(escapeRegex).join('|') + ')(?:\\s+([IVXLCDM]+|\\d+)\\b|\\s*[:.\\-–—])\\s*(.*)$', 'i');
  const castSectionEndRe = new RegExp('^(?:' + (profile.castSectionEndPatterns || ['Pré-Carnaval', 'Segunda-feira']).map(escapeRegex).join('|') + ')', 'i');
  const columnLayoutTitleRe = new RegExp(profile.columnLayoutTitlePattern || 'RETRATO[- ]FALADO', 'i');
  const pageBreakMarker = profile.layoutMarkers?.pageBreak || '\u200C';
  const secondColumnMarker = profile.layoutMarkers?.secondColumn || '\u200B\u200B';
  const momentRe = /^(?:MOMENTO\s+CÊNICO|MOMENTO\s+CENICO|MC)\s+([A-Z0-9]+)(?:\s*[:.\-–—]\s*(.*))?$/i;
  const dashRe = /^([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 _'.\-]{0,54}?)\s*[–—-]\s*(.+)$/u;
  const colonRe = /^([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 _'.\-]{0,54}?)\s*:\s*(.+)$/u;
  const upperLine = /^[A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 _'.\-]{0,60}$/u;
  const aliases = profile.speakerAliases || [];
  const canonicalSpeaker = value => {
    const normalized = upper(value);
    const alias = aliases.find(item => [item.canonical, ...(item.aliases || [])].some(name => upper(name) === normalized));
    return alias ? upper(alias.canonical) : normalized;
  };
  const castHeadings = (profile.castSectionHeadings || ['PERSONAGENS']).map(upper);
  const sceneListHeadings = (profile.sceneListSectionHeadings || ['CENAS']).map(upper);
  const known = new Set(), sceneTitles = new Map();
  let section = '';
  for (const row of rows) {
    const text = row.trim;
    if (castHeadings.includes(upper(text.replace(/:$/, '')))) { section = 'characters'; continue; }
    if (sceneListHeadings.includes(upper(text.replace(/:$/, '')))) { section = 'scenes'; continue; }
    const title = text.match(/^(\d+)\.\s+(.+)$/);
    if (section === 'scenes' && title) { sceneTitles.set(Number(title[1]), normalize(title[2])); continue; }
    if (sceneRe.test(text)) break;
    if (section === 'characters') {
      if (sceneRe.test(text) || castSectionEndRe.test(text)) { section = ''; continue; }
      if (text.length <= 60 && upperLine.test(text)) known.add(canonicalSpeaker(text));
    }
  }
  const candidates = new Set(known);
  const firstScene = rows.findIndex(row => sceneRe.test(row.trim));
  const meaningful = firstScene >= 0 ? rows.slice(firstScene) : rows;
  for (const row of meaningful) {
    const text = row.trim, matched = text.match(dashRe) || text.match(colonRe);
    if (matched) candidates.add(canonicalSpeaker(matched[1]));
    if (text.length <= 48 && upperLine.test(text) && !/[.!?]/.test(text) && !sceneRe.test(text) && !momentRe.test(text)) candidates.add(canonicalSpeaker(text));
  }
  const names = [...candidates].sort((a, b) => b.length - a.length);
  const repairedMeaningful = [];
  for (let i = 0; i < meaningful.length; i++) {
    const row = meaningful[i], first = upper(row.trim);
    let repaired = false;
    for (const name of (profile.wrappedSpeakerNamesFromCastList === false ? [] : [...known]).sort((a, b) => b.length - a.length)) {
      const words = name.split(' ');
      for (let cut = 1; cut < words.length; cut++) {
        if (first !== words.slice(0, cut).join(' ')) continue;
        const tail = words.slice(cut).join(' ');
        let collected = '', consumed = 0;
        while (i + 1 + consumed < meaningful.length) {
          const next = normalize(meaningful[i + 1 + consumed].trim);
          if (/[\u200c\u200b]/.test(next)) break;
          collected = `${collected} ${next}`.trim(); consumed++;
          const upperCollected = upper(collected);
          if (upperCollected === tail || upperCollected.startsWith(`${tail} `)) {
            const remainder = collected.slice(tail.length).trim();
            repairedMeaningful.push({ ...row, trim: `${name}${remainder ? ` ${remainder}` : ''}` });
            i += consumed; repaired = true; break;
          }
          if (!tail.startsWith(`${upperCollected} `)) break;
        }
        if (repaired) break;
      }
      if (repaired) break;
    }
    if (!repaired) repairedMeaningful.push(row);
  }
  meaningful.splice(0, meaningful.length, ...repairedMeaningful);
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
  const rubricLabelRe = new RegExp(profile.rubricLabelPattern || '^R[ÚU]BRICA:', 'i');
  const stageDirectionRe = new RegExp('^(?:' + (profile.stageDirectionPatterns || ['ouve(?:-se)?', 'escuta-se', 'saca', 'atira', 'cai morto', 'silêncio', 'escuridão', 'blackout', 'fim']).join('|') + ')\\b', 'i');
  const isRubric = text => {
    const clean = normalize(text).replace(/\s+([.,!?;:])/g, '$1');
    if (rubricLabelRe.test(clean) || /^[([{].*[)\]}]$/.test(clean)) return true;
    if (stageDirectionRe.test(clean)) return true;
    if (currentLine?.type === 'dialogue' && !/[—:]/.test(clean)) { const normalized=upper(clean), label=names.find(name=>normalized.startsWith(name+' ')), remainder=label?clean.slice(label.length).trim():''; if (label && !/^[A-ZÀ-ÖØ-Þ]/u.test(remainder) && /^(?:obedece|entrega|pega|desce|sobe|entra|sai|olha|fala|diz|faz|volta|abre|fecha|anda|corre|começa|termina|afaga|grita|chora|ri|mata|morre|se transforma)\b/i.test(remainder)) return true; }
    return false;
  };
  for (const row of meaningful) {
    let text = row.trim;
    if (text.includes(pageBreakMarker)) { page++; column = 1; speaker = null; currentLine = null; continue; }
    if (text.includes(secondColumnMarker)) { column = 2; speaker = null; currentLine = null; continue; }
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
    if (rubricLabelRe.test(text)) { push('rubric', text.replace(rubricLabelRe, '').trim()); speaker = null; currentLine = null; continue; }
    if (/^[([{].*[)\]}]$/.test(text) || /^\*.*\*$/.test(text)) { push('rubric', text.replace(/^[([{*]|[)\]}*]$/g, '')); speaker = null; currentLine = null; continue; }
    let inlineSpeaker = null;
    for (const rule of profile.inlineSpeakerLabels || []) {
      const found = text.match(new RegExp('^' + escapeRegex(rule.label) + '\\s+(.+)$', 'i'));
      const canonical = canonicalSpeaker(rule.canonical);
      if (found && (known.has(canonical) || !known.size)) { inlineSpeaker = { speaker: canonical, text: found[1] }; break; }
    }
    if (inlineSpeaker) { speaker = inlineSpeaker.speaker; known.add(speaker); push('dialogue', inlineSpeaker.text, speaker); continue; }
    if (isRubric(text)) { push('rubric', text); speaker = null; currentLine = null; continue; }
    let m = text.match(dashRe) || text.match(colonRe);
    if (m && (!known.size || known.has(canonicalSpeaker(m[1])))) {
      speaker = canonicalSpeaker(m[1]); known.add(speaker); push('dialogue', m[2], speaker); continue;
    }
    const header = canonicalSpeaker(text.replace(/:$/, ''));
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
    if (profile.carryUnlabelledContinuation !== false && currentLine?.type === 'dialogue' && currentLine.column === column && /^[a-zà-ÿ0-9…]/.test(text)) { currentLine.text += ' ' + normalize(text); continue; }
    if (profile.carryUnlabelledContinuation !== false && currentLine?.type === 'dialogue' && speaker && !/[.!?]$/.test(currentLine.text)) { currentLine.text += ' ' + normalize(text); continue; }
    if (columnLayoutTitleRe.test(scene.title)) {
      const raw = text.replace(/^[—–-]\s*/, '');
      if (raw) { speaker = `VOZ ${column}`; push('dialogue', raw, speaker); continue; }
    }
    if (speaker) push('dialogue', text, speaker); else push('rubric', text);
  }
  for (const sc of scenes) {
    const repaired = [];
    for (const line of sc.lines) {
      const text = normalize(line.text);
      const previous = repaired[repaired.length - 1];
      const isDirection = stageDirectionRe.test(text);
      if (profile.carryUnlabelledContinuation !== false && line.type === 'rubric' && !isDirection && /^[a-zà-ÿ0-9…]/u.test(text) && previous?.type === 'dialogue') {
        previous.text = `${previous.text} ${text}`;
      } else repaired.push(line);
    }
    sc.lines = repaired;
    const hasLeft = sc.lines.some(line => line.column === 1), hasRight = sc.lines.some(line => line.column === 2);
    if (columnLayoutTitleRe.test(sc.title) && hasLeft && hasRight) sc.lines.forEach(line => { line.simultaneousGroup = `sim-${sc.number}`; });
  }
  if (!scenes.length) throw new Error('Não encontrei cenas reconhecíveis no arquivo.');
  return {
    schemaVersion: 1,
    parser: { engine: 'deixa-script-parser', engineVersion: '1.1.0', profileId, profileVersion: profile.version || 1 },
    title: '', characters: [...known], scenes
  };
};
