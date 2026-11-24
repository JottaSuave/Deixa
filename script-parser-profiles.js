/*
 * Reusable conventions for recognizing theatrical scripts.
 * Keep examples and parsing rules here; keep actual script text in script-data.js.
 */
window.SCRIPT_PARSER_PROFILES = {
  defaultProfileId: 'pt-br-theatre-v1',
  profiles: {
    'pt-br-theatre-v1': {
      version: 1,
      label: 'Roteiro teatral em português',
      referenceDeck: 'Dramaturgia LAB 08',
      sceneHeadings: ['CENA', 'ATO', 'QUADRO', 'SCENE', 'ACT'],
      castSectionHeadings: ['PERSONAGENS', 'ELENCO'],
      sceneListSectionHeadings: ['CENAS'],
      castSectionEndPatterns: ['Pré-Carnaval', 'Segunda-feira'],
      speakerAliases: [
        { canonical: 'PUXADOR DE SAMBA', aliases: ['PUXADOR'] }
      ],
      inlineSpeakerLabels: [
        { label: 'PUXADOR', canonical: 'PUXADOR DE SAMBA' }
      ],
      multiwordSpeakerExamples: [
        'PUXADOR DE SAMBA',
        'ALGUÉM QUE IA PASSANDO'
      ],
      wrappedSpeakerNamesFromCastList: true,
      carryUnlabelledContinuation: true,
      rubricLabelPattern: '^R[ÚU]BRICA:',
      columnLayoutTitlePattern: 'RETRATO[- ]FALADO',
      columnLayoutCollectiveSpeaker: 'O POVO',
      stageDirectionPatterns: [
        'OUVE-SE', 'ESCUTA-SE', 'A PESSOA SAI\\b', 'ELA VAI SAIR E DÁ DE CARA\\b',
        'ouve(?:-se)?', 'escuta-se', 'saca', 'atira', 'cai morto', 'gargalha(?:m)?',
        'deixa o rei momo', 'chupa', 'é arrastado', 'entra maldoror', 'examina',
        'mata a vidente', 'está dando comida', 'e outra mulher urinam', 'aponta a faca',
        'arranca o rosto', 'beija mervino', 'atravessa as ruas', 'arrasta o saco',
        'silêncio', 'escuridão', 'blackout', 'fim'
      ],
      layoutMarkers: {
        pageBreak: '\u200C',
        secondColumn: '\u200B\u200B'
      },
      notes: [
        'Prefer the longest complete character name found in the PERSONAGENS/ELENCO section.',
        'PDF line wraps can split a multiword speaker name; join only when the full name is confirmed by the cast list.',
        'PUXADOR is an established short label for PUXADOR DE SAMBA.',
        'An unlabelled continuation may belong to the active speaker; stage directions reset speaker context.',
        'Treat title-like uppercase lines as speaker labels only when they match the cast list or a clear label pattern.',
        'In a RETRATO-FALADO scene, parallel unlabelled statements form the collective voice O POVO; keep column and source order.',
        'A character mentioned inside a speech is not automatically its speaker; use the explicit heading or the active narrative voice.'
      ]
    }
  }
};
